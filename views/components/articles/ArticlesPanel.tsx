/**
 * Vue « Articles de la note » : les articles que la note active cite, chacun avec son statut de vigueur, son texte,
 * les décisions de la base qui l'appliquent (et la phrase où elles le citent), ses versions, et sa note d'article.
 * Le panneau des références donne la liste de tout ce que la note cite ; celui-ci s'attache aux seuls articles.
 */
import { ExternalLink, FilePlus, FileText, RefreshCw } from "lucide-react";
import { Notice } from "obsidian";
import { useMemo, useState } from "react";
import { createMissingArticleNotes, openArticleNote } from "references/articleNotes";
import { loadArticleVersions, storeArticleVersion } from "references/articleVersions";
import { articleExcerpts, countApplying, statusLabel } from "references/corpus";
import { LegalRef } from "references/parser";
import { ArticleVersion } from "references/versions";
import { ArticleModal } from "views/ArticleModal";
import { useDatabaseVersion, useNoteReferences, usePlugin } from "views/hooks";
import { ExcerptQuote } from "../jurisprudence/Shared";
import { period } from "../jurisprudence/ArticlesTab";

/** Longueur de l'aperçu du texte d'un article. */
const PREVIEW_LENGTH = 400;
/** Nombre de décisions dont on montre la phrase. */
const EXCERPTS_SHOWN = 5;

const inForce = (status?: string) => !status || ["VIGUEUR", "VIGUEUR_DIFF"].includes(status);

export const ArticlesPanel = () => {
	const plugin = usePlugin();
	const { file, refs } = useNoteReferences();
	// Relit la base quand elle change (liens retrouvés, décisions complétées) et après une création de note.
	const version = useDatabaseVersion();
	const [created, setCreated] = useState(0);
	const [busy, setBusy] = useState(false);

	const articles = useMemo(() => refs.filter((ref) => ref.kind === "article"), [refs]);
	if (!file) return <p className="legifrance-empty">Ouvrez une note pour voir les articles qu'elle cite.</p>;
	if (articles.length === 0) return <p className="legifrance-empty">Aucun article cité dans « {file.basename} ».</p>;

	const withoutNote = articles.filter((ref) => !plugin.references.articleNoteFor(ref.key));
	const stale = articles.filter((ref) => !inForce(plugin.references.linkFor(ref)?.statut));

	async function createAll() {
		setBusy(true);
		try {
			await createMissingArticleNotes(plugin, withoutNote.map((ref) => ref.key));
			setCreated(created + 1);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
		setBusy(false);
	}

	return (
		<div className="legifrance-articles-panel" data-version={version}>
			<h4>{file.basename}</h4>
			<div className="setting-item-description">
				{articles.length} article{articles.length > 1 ? "s" : ""}
				{stale.length > 0 && <span className="legifrance-warning"> · {stale.length} plus en vigueur</span>}
				{" · "}{articles.length - withoutNote.length} avec note
			</div>
			{withoutNote.length > 0 && (
				<button disabled={busy} onClick={() => void createAll()}>
					{busy ? "Création…" : `Créer les notes manquantes (${withoutNote.length})`}
				</button>
			)}
			{articles.map((ref) => (
				<ArticleCard key={ref.key} reference={ref} onNoteChange={() => setCreated(created + 1)} />
			))}
		</div>
	);
};

const ArticleCard = ({ reference, onNoteChange }: { reference: LegalRef; onNoteChange: () => void }) => {
	const plugin = usePlugin();
	const [open, setOpen] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const link = plugin.references.linkFor(reference);
	const applying = countApplying(plugin.references, reference.key);
	const notePath = plugin.references.articleNoteFor(reference.key);
	const text = link?.texte;

	async function refresh() {
		if (!plugin.hasCredentials) {
			new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
			return;
		}
		setRefreshing(true);
		await plugin.links.resolve([reference], true);
		setRefreshing(false);
	}

	async function toNote() {
		try {
			await openArticleNote(plugin, reference.key);
			onNoteChange();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	return (
		<section className="legifrance-article-card">
			<div className="legifrance-article-card-head">
				<div className="legifrance-article-card-title" role="button" tabIndex={0} aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}>
					<span>{reference.label}</span>
					<div className="setting-item-description">
						{link ? (link.statut ? statusLabel(link.statut) : "Statut inconnu") : "Lien non retrouvé"}
						{!inForce(link?.statut) && <span className="legifrance-warning"> ⚠ plus en vigueur</span>}
						{applying > 0 && ` · appliqué par ${applying} décision${applying > 1 ? "s" : ""}`}
					</div>
				</div>
				<div className="legifrance-row-actions">
					<button className="clickable-icon" aria-label={notePath ? "Ouvrir la note de l'article" : "Créer la note de l'article"} onClick={() => void toNote()}>
						{notePath ? <FileText size={16} /> : <FilePlus size={16} />}
					</button>
					<button className="clickable-icon" aria-label="Revérifier sur Légifrance" disabled={refreshing} onClick={() => void refresh()}>
						<RefreshCw size={16} />
					</button>
					{link && (
						<a className="clickable-icon" aria-label="Ouvrir sur Légifrance" href={link.url}>
							<ExternalLink size={16} />
						</a>
					)}
				</div>
			</div>
			{open && (
				<div className="legifrance-article-card-body">
					{text && link ? (
						<div className="legifrance-excerpt" role="button" tabIndex={0} onClick={() => new ArticleModal(plugin.app, reference, link).open()} onKeyDown={(e) => e.key === "Enter" && new ArticleModal(plugin.app, reference, link).open()}>
							{text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text}
						</div>
					) : (
						<div className="setting-item-description">Texte non récupéré.</div>
					)}
					<ArticleDecisions articleKey={reference.key} count={applying} />
					<ArticleVersions reference={reference} />
				</div>
			)}
		</section>
	);
};

/** Phrases où les décisions de la base citent l'article. */
const ArticleDecisions = ({ articleKey, count }: { articleKey: string; count: number }) => {
	const plugin = usePlugin();
	const excerpts = useMemo(() => (count > 0 ? articleExcerpts(plugin.references, articleKey, EXCERPTS_SHOWN) : []), [plugin, articleKey, count]);
	if (count === 0) return <div className="setting-item-description">Aucune décision de la base n'applique cet article.</div>;
	return (
		<div>
			<div className="legifrance-row-meta">Décisions qui l'appliquent</div>
			{excerpts.map(({ decisionId, title, date, excerpt }) => (
				<div key={decisionId}>
					<div className="setting-item-description">{title}{date ? ` · ${date}` : ""}</div>
					<ExcerptQuote excerpt={excerpt} />
				</div>
			))}
			{excerpts.length === 0 && <div className="setting-item-description">{count} décision{count > 1 ? "s" : ""}, dont le texte n'est pas encore récupéré (Réglages → Base de données → Compléter).</div>}
			<a className="setting-item-description" onClick={() => void plugin.activateJurisprudenceView({ tab: "articles", articleKey })}>Voir toutes les décisions →</a>
		</div>
	);
};

/** Versions de l'article, relevées sur l'API à la demande (une seule fois par article). */
const ArticleVersions = ({ reference }: { reference: LegalRef }) => {
	const plugin = usePlugin();
	const [versions, setVersions] = useState<ArticleVersion[] | undefined>(() => plugin.references.articleVersions(reference.key));
	const [loading, setLoading] = useState(false);

	async function load() {
		if (!plugin.hasCredentials) {
			new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
			return;
		}
		setLoading(true);
		try {
			setVersions((await loadArticleVersions(plugin, reference.key, reference.label)) ?? []);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
		setLoading(false);
	}

	async function read(version: ArticleVersion) {
		try {
			if (await storeArticleVersion(plugin, version, reference.label)) await plugin.openStoredDocument(version.id);
			else new Notice("Le texte de cette version est indisponible.");
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	if (!versions) return <button disabled={loading} onClick={() => void load()}>{loading ? "Recherche des versions…" : "Voir les versions"}</button>;
	if (versions.length === 0) return <div className="setting-item-description">Aucune version retrouvée sur Légifrance.</div>;
	return (
		<div>
			<div className="legifrance-row-meta">Versions ({versions.length})</div>
			{versions.map((version) => (
				<div key={version.id} className="setting-item-description">
					<a onClick={() => void read(version)}>{period(version)}</a> · {statusLabel(version.status)}
				</div>
			))}
		</div>
	);
};
