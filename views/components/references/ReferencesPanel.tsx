/**
 * Panneau latéral des références juridiques de la note active : décisions, articles et textes cités, avec leur lien
 * (retrouvé via l'API, `plugin.links`), la pastille d'état des décisions, le texte lu dans la base, et, pour une fiche,
 * ses écarts avec Légifrance (`FicheInsights`). Le mode débogage affiche le journal de chaque recherche de lien.
 */
import { Mentions } from "./Mentions";
import { Section } from "./Section";
import { BookOpen, ExternalLink, FileText, Search } from "lucide-react";
import { decisionKey } from "references/ids";
import { storedLegalDocument } from "references/stored";
import { Notice, TFile, setTooltip } from "obsidian";
import { useMemo, useState } from "react";
import { ArticleModal } from "views/ArticleModal";
import { canResolve } from "references/resolver";
import { LegalRef, RefKind } from "references/parser";
import { isFiche } from "references/fiches";
import { articleExcerpts, corpusGaps, countApplying, statusLabel } from "references/corpus";
import { decisionsOf } from "references/insights";
import { ExcerptQuote, Genealogy, RelatedList, SourceBadge } from "views/components/jurisprudence/Shared";
import { useDatabaseVersion, useNoteReferences, usePlugin } from "views/hooks";
import LegifrancePlugin from "main";

/** Rubriques d'affichage, dans l'ordre. */
const GROUPS: { kind: RefKind; title: string }[] = [
	{ kind: "decision", title: "Décisions" },
	{ kind: "texte", title: "Textes" },
	{ kind: "article", title: "Articles" },
	{ kind: "eu", title: "Droit de l'Union" },
	{ kind: "identifiant", title: "Identifiants Légifrance" },
];

/** Longueur de l'aperçu d'un article dans la liste ; le texte entier s'affiche au survol et au clic. */
const EXCERPT_LENGTH = 50;
/** Longueur maximale du texte de l'infobulle (les articles peuvent être très longs). */
const TOOLTIP_LENGTH = 800;

/** Références juridiques de la note active, chacune avec son lien Légifrance. */
export const ReferencesPanel = () => {
	const plugin = usePlugin();
	const { file, refs } = useNoteReferences();
	const [busy, setBusy] = useState(false);

	/** Références que l'API peut encore retrouver (sans lien mémorisé, ni recherche en cours). */
	const missing = refs.filter(
		(ref) => canResolve(ref) && !plugin.references.linkFor(ref) && !plugin.links.pending.has(ref.key)
	);

	async function resolve(targets: LegalRef[]) {
		if (!plugin.hasCredentials) {
			new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
			return;
		}
		setBusy(true);
		await plugin.links.resolve(targets, true);
		setBusy(false);
	}

	if (!file) {
		return <p className="legifrance-empty">Ouvrez une note pour en lister les références juridiques.</p>;
	}

	return (
		<div className="legifrance-references">
			<h4>{file.basename}</h4>
			{isFiche(plugin.app.metadataCache.getFileCache(file)?.frontmatter, plugin.settings) && <FicheInsights file={file} />}
			{refs.length === 0 && (
				<p className="legifrance-empty">Aucune référence juridique détectée dans cette note.</p>
			)}

			{plugin.settings.debugRefs && (
				<div className="legifrance-debug-bar">
					<button disabled={busy} onClick={() => resolve(refs.filter((ref) => canResolve(ref)))}>
						Relancer toutes les recherches
					</button>
					<button onClick={() => copyDiagnostic(plugin, file.path, refs)}>Copier le diagnostic</button>
				</div>
			)}

			{missing.length > 0 && !plugin.settings.autoResolveRefs && (
				<button disabled={busy} onClick={() => resolve(missing)}>
					{busy ? "Recherche…" : `Retrouver ${missing.length} lien${missing.length > 1 ? "s" : ""} via l'API`}
				</button>
			)}

			{refs.some((ref) => ref.kind === "article") && <NoteGaps file={file} />}

			{GROUPS.map(({ kind, title }) => {
				const group = refs.filter((ref) => ref.kind === kind);
				return (
					group.length > 0 && (
						<Section key={kind} id={`group-${kind}`} title={title} count={group.length}>
							{group.map((ref) => (
								<ReferenceItem key={ref.key} reference={ref} disabled={busy} onResolve={() => resolve([ref])} />
							))}
						</Section>
					)
				);
			})}
		</div>
	);
};

/** Diagnostic de la note (références, données, journal de recherche), copié dans le presse-papiers. */
async function copyDiagnostic(plugin: LegifrancePlugin, path: string, refs: LegalRef[]) {
	const lines = [`Note : ${path}`, `Identifiants PISTE : ${plugin.hasCredentials ? "renseignés" : "ABSENTS"}`, ""];
	for (const ref of refs) {
		const link = plugin.references.linkFor(ref);
		lines.push(`## ${ref.label}`, `type : ${ref.kind} | données : ${JSON.stringify(ref.data)}`);
		lines.push(`lien : ${link?.url ?? "aucun"} | repli : ${ref.fallbackUrl ?? plugin.links.urlFor(ref)}`);
		lines.push(...(plugin.links.traces.get(ref.key) ?? ["(aucune recherche pendant cette session)"]), "");
	}
	await navigator.clipboard.writeText(lines.join("\n"));
	new Notice("Diagnostic copié dans le presse-papiers.");
}

/** Ce que la base sait d'une fiche : où la décision est citée, articles visés, décisions proches. */
const FicheInsights = ({ file }: { file: TFile }) => {
	const plugin = usePlugin();
	const version = useDatabaseVersion();
	const records = useMemo(() => decisionsOf(plugin), [plugin, version]);
	const record = records.find((r) => r.fichePath === file.path);
	const articles = record
		? plugin.references.db.all<{ key: string; label: string; count: number }>(
				"SELECT article_key AS key, label, count FROM decision_articles WHERE decision_id = ? ORDER BY count DESC LIMIT 8",
				[record.id]
			)
		: [];

	if (!record) {
		return <p className="setting-item-description">Fiche de décision, non reliée aux citations de vos notes (identifiant Légifrance manquant, ou décision jamais citée).</p>;
	}
	return (
		<div className="legifrance-fiche-insights">
			<Section id="fiche" title="Fiche de décision">
				<Mentions record={record} version={version} />
				{record.themes.length > 0 && <div className="setting-item-description">{record.themes.slice(0, 3).map((t) => <span key={t} className="legifrance-chip">{t}</span>)}</div>}
				{articles.length > 0 && (
					<Section id="articles-vises" title="Articles visés" count={articles.length}>
						{articles.map((a) => (
							<div key={a.key}><a onClick={() => void plugin.activateJurisprudenceView({ tab: "articles", articleKey: a.key })}>{a.label}</a></div>
						))}
					</Section>
				)}
				<Section id="genealogy" title="Généalogie" defaultOpen={false}>
					<Genealogy record={record} records={records} />
				</Section>
				<Section id="related" title="Décisions proches" defaultOpen={false}>
					<RelatedList record={record} records={records} />
				</Section>
			</Section>
		</div>
	);
};

interface ReferenceItemProps {
	reference: LegalRef;
	disabled: boolean;
	onResolve: () => void;
}

const ReferenceItem = ({ reference, disabled, onResolve }: ReferenceItemProps) => {
	const plugin = usePlugin();
	const link = plugin.references.linkFor(reference);
	const pending = plugin.links.pending.has(reference.key);
	const missed = plugin.references.isRecentMiss(reference);

	let status = reference.url || reference.fallbackUrl ? "Lien vers la page du texte." : "Lien de recherche Légifrance.";
	// Le titre d'un article est son libellé : l'afficher deux fois n'apprend rien.
	if (link) status = link.titre === reference.label ? "" : link.titre;
	else if (pending) status = "Recherche sur Légifrance…";
	else if (missed) status = "Introuvable via l'API : lien de recherche.";

	const fichePath = plugin.references.ficheFor(reference);
	const fiche = fichePath ? plugin.app.vault.getAbstractFileByPath(fichePath) : null;

	const applying = reference.kind === "article" ? countApplying(plugin.references, reference.key) : 0;
	const inForce = !link?.statut || ["VIGUEUR", "VIGUEUR_DIFF"].includes(link.statut);

	const texte = link?.texte;
	// Texte déjà en base (décision complétée, article retrouvé) : lisible dans le lecteur, sans requête.
	const documentId = link ? decisionKey(link.url) ?? /(?:LEGIARTI|LEGITEXT|JORFTEXT|JORFARTI)\d{12}/.exec(link.url)?.[0] : undefined;
	const readable = !!documentId && !!storedLegalDocument(plugin, documentId);
	const trace = plugin.settings.debugRefs ? plugin.links.traces.get(reference.key) : undefined;

	return (
		<div className="setting-item">
			<div className="setting-item-info">
				<div className="setting-item-name">
					{reference.label}
					{reference.kind === "decision" && <SourceBadge fiche={fiche instanceof TFile} notes={1} />}
				</div>
				{status && <div className="setting-item-description">{status}</div>}
				{!inForce && <div className="setting-item-description legifrance-warning">⚠ Version en vigueur introuvable (statut : {statusLabel(link?.statut).toLowerCase()}).</div>}
				{applying > 0 && (
					<div className="setting-item-description">
						<a onClick={() => void plugin.activateJurisprudenceView({ tab: "articles", articleKey: reference.key })}>
							Appliqué par {applying} décision{applying > 1 ? "s" : ""} de votre base
						</a>
					</div>
				)}
				{applying > 0 && <ApplyingExcerpts articleKey={reference.key} />}
				{plugin.settings.debugRefs && (
					<details className="legifrance-trace">
						<summary>Diagnostic</summary>
						<pre>{trace ? trace.join("\n") : "Aucune recherche pendant cette session (résultat en cache, ou recherche non lancée)."}</pre>
					</details>
				)}
				{texte && link && (
					<div
						className="legifrance-excerpt"
						role="button"
						tabIndex={0}
						// Survol : début du texte dans une infobulle ; clic : texte entier dans une fenêtre.
						ref={(el) => el && setTooltip(el, texte.slice(0, TOOLTIP_LENGTH) + (texte.length > TOOLTIP_LENGTH ? "…" : ""), { delay: 300 })}
						onClick={() => new ArticleModal(plugin.app, reference, link).open()}
						onKeyDown={(e) => e.key === "Enter" && new ArticleModal(plugin.app, reference, link).open()}
					>
						{texte.length > EXCERPT_LENGTH ? `${texte.slice(0, EXCERPT_LENGTH).trimEnd()}…` : texte}
					</div>
				)}
			</div>
			<div className="setting-item-control">
				{fiche instanceof TFile && (
					<button
						className="clickable-icon"
						aria-label={`Ouvrir la fiche : ${fiche.basename}`}
						onClick={() => void plugin.app.workspace.getLeaf(false).openFile(fiche)}
					>
						<FileText size={16} />
					</button>
				)}
				{readable && (
					<button className="clickable-icon" aria-label="Lire le texte (base de données)" onClick={() => void plugin.openStoredDocument(documentId!)}>
						<BookOpen size={16} />
					</button>
				)}
				{!link && !pending && canResolve(reference) && (
					<button
						className="clickable-icon"
						aria-label="Retrouver le document via l'API"
						disabled={disabled}
						onClick={onResolve}
					>
						<Search size={16} />
					</button>
				)}
				<a
					className="clickable-icon"
					aria-label={link ? "Ouvrir sur Légifrance" : "Rechercher sur Légifrance"}
					href={plugin.links.urlFor(reference)}
				>
					<ExternalLink size={16} />
				</a>
			</div>
		</div>
	);
};

/** Phrases où les décisions de la base citent l'article, lues à l'ouverture seulement (leur texte est analysé à la demande). */
const ApplyingExcerpts = ({ articleKey }: { articleKey: string }) => {
	const plugin = usePlugin();
	const [open, setOpen] = useState(false);
	const excerpts = useMemo(() => (open ? articleExcerpts(plugin.references, articleKey, 3) : []), [plugin, articleKey, open]);
	return (
		<details className="legifrance-applying" onToggle={(e) => setOpen(e.currentTarget.open)}>
			<summary>Voir comment les décisions le citent</summary>
			{open && excerpts.length === 0 && <div className="setting-item-description">Aucun texte de décision à citer : complétez les décisions (Réglages → Base de données).</div>}
			{excerpts.map(({ decisionId, title, date, excerpt }) => (
				<div key={decisionId}>
					<div className="setting-item-description">{title}{date ? ` · ${date}` : ""}</div>
					<ExcerptQuote excerpt={excerpt} />
				</div>
			))}
		</details>
	);
};

/** Décisions de la base qui appliquent les articles de la note sans y être citées. */
const NoteGaps = ({ file }: { file: TFile }) => {
	const plugin = usePlugin();
	const version = useDatabaseVersion();
	const gaps = useMemo(() => corpusGaps(plugin.references, decisionsOf(plugin), file.path), [plugin, version, file.path]);
	if (gaps.length === 0) return null;
	return (
		<Section id="gaps" title="Décisions à envisager" count={gaps.reduce((n, gap) => n + gap.decisions.length, 0)} defaultOpen={false}>
			<div className="setting-item-description">Décisions de votre base qui appliquent les articles de cette note sans y être citées.</div>
			{gaps.slice(0, 5).map((gap) => (
				<div key={gap.key}>
					<a onClick={() => void plugin.activateJurisprudenceView({ tab: "articles", articleKey: gap.key })}>{gap.label}</a>
					<div className="setting-item-description">{gap.decisions.slice(0, 4).map((r) => r.name ?? r.title ?? r.label).join(" · ")}{gap.decisions.length > 4 ? ` · +${gap.decisions.length - 4}` : ""}</div>
				</div>
			))}
			{gaps.length > 5 && <div className="setting-item-description">+ {gaps.length - 5} autres articles (onglet Lacunes de l'analyse).</div>}
		</Section>
	);
};
