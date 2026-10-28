/**
 * Analyse de la jurisprudence, onglet « Articles » : les articles cités ou appliqués, lus en SQL page par page
 * (filtres par texte et par vigueur, deux tris), les décisions qui appliquent chacun, et ses versions : la version
 * applicable à la date de chaque décision se demande à l'API par un bouton (`loadArticleVersions`).
 */
import { Notice } from "obsidian";
import { useEffect, useMemo, useState } from "react";
import { legifranceUrl } from "api/urls";
import { loadArticleVersions, storeArticleVersion } from "references/articleVersions";
import { ArticleVersion, VersionAtDate, versionAt } from "references/versions";
import { ArticleSort, ArticleVigor, articleByKey, articlePage, articleTexts, decisionsApplying, excerptFor, statusLabel } from "references/corpus";
import { openArticleNote } from "references/articleNotes";
import { DecisionRecord, byDate } from "references/timeline";
import { usePlugin } from "views/hooks";
import { Card, DecisionRow, ExcerptQuote } from "./Shared";

const frenchDate = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "");

/** Période de vigueur d'une version : « du 01/10/2016 à aujourd'hui ». */
export const period = (v: ArticleVersion) => `${v.start ? `du ${frenchDate(v.start)}` : "depuis l'origine"} ${v.end ? `au ${frenchDate(v.end)} (exclu)` : "à aujourd'hui"}`;

/** Version d'un article applicable à la date d'une décision, avec de quoi la lire. */
const VersionLine = ({ label, versions, date }: { label: string; versions: ArticleVersion[]; date?: string }) => {
	const plugin = usePlugin();
	if (!date) return <p className="legifrance-row-meta legifrance-version">Date de la décision inconnue : version non déterminée.</p>;
	const found: VersionAtDate = versionAt(versions, date);
	const current = versions[versions.length - 1];

	async function read(version: ArticleVersion) {
		try {
			if (await storeArticleVersion(plugin, version, label)) await plugin.openStoredDocument(version.id);
			else new Notice("Le texte de cette version est indisponible.");
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	if (found.state === "none") return <p className="legifrance-row-meta legifrance-version legifrance-warning">{found.reason}</p>;
	return (
		<div className="legifrance-row-meta legifrance-version">
			{found.state === "ambiguous" && <span>La date ({date}) couvre {found.candidates.length} versions : </span>}
			{found.candidates.map((version) => (
				<span key={version.id} className="legifrance-version-item">
					{found.state === "exact" ? "Version applicable : " : ""}
					{period(version)} · {statusLabel(version.status)}
					{version.id !== current.id && <span className="legifrance-chip" title="La version en vigueur aujourd'hui est différente">≠ version actuelle</span>}
					<a onClick={() => void read(version)}>Lire</a> · <a href={legifranceUrl(version.id)}>Légifrance</a>
				</span>
			))}
		</div>
	);
};

/** Nombre d'articles ajoutés à la liste par « Afficher la suite ». */
const PAGE_SIZE = 80;

/**
 * Articles appliqués par les décisions de la base, et décisions qui appliquent l'article choisi. La
 * liste est lue dans la base page par page ; les décisions (`getRecords`) ne sont recensées qu'au
 * choix d'un article.
 */
export const ArticlesTab = ({ getRecords, version, focus }: { getRecords: () => DecisionRecord[]; version: number; focus?: string }) => {
	const plugin = usePlugin();
	const [filter, setFilter] = useState("");
	const [text, setText] = useState("");
	const [vigor, setVigor] = useState<ArticleVigor>("");
	const [sort, setSort] = useState<ArticleSort>("applied");
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [selected, setSelected] = useState<string | undefined>(focus);
	useEffect(() => setSelected(focus), [focus]);
	useEffect(() => setLimit(PAGE_SIZE), [filter, text, vigor, sort]);

	const texts = useMemo(() => articleTexts(plugin.references), [plugin, version]);
	const page = useMemo(() => articlePage(plugin.references, { needle: filter, text, vigor, sort, limit }), [plugin, version, filter, text, vigor, sort, limit]);
	const filtered = !!(filter || text || vigor);
	const current = useMemo(() => (selected ? articleByKey(plugin.references, selected) : undefined), [plugin, version, selected]);
	/** Versions de l'article choisi : relevées sur l'API à la demande, puis gardées en base. */
	const [versions, setVersions] = useState<ArticleVersion[]>();
	const [loadingVersions, setLoadingVersions] = useState(false);
	useEffect(() => setVersions(selected ? plugin.references.articleVersions(selected) : undefined), [plugin, selected]);
	async function showVersions(key: string, label: string) {
		if (!plugin.hasCredentials) {
			new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
			return;
		}
		setLoadingVersions(true);
		try {
			const loaded = await loadArticleVersions(plugin, key, label);
			if (!loaded) new Notice("Cet article n'a pas de versions sur Légifrance.");
			setVersions(loaded);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
		setLoadingVersions(false);
	}
	const decisions = useMemo(() => (selected ? decisionsApplying(plugin.references, getRecords(), selected).sort(byDate) : []), [plugin, version, selected]);

	if (page.total === 0 && !filtered) {
		return (
			<Card title="Articles appliqués">
				<p className="legifrance-empty">Aucun article relevé : il faut des décisions dont le texte est récupéré (Réglages → Général → « Compléter les fiches de décisions »).</p>
			</Card>
		);
	}
	return (
		<div className="legifrance-articles">
			<Card title="Articles" count={page.total} hint={sort === "applied" ? "Classés par nombre de décisions qui les appliquent." : "Classés par texte, puis par numéro."}>
				<input type="search" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
				<div className="legifrance-article-filters">
					<select value={text} onChange={(e) => setText(e.target.value)} className="dropdown" aria-label="Texte">
						<option value="">Tous les textes</option>
						{texts.map((t) => <option key={t.text} value={t.text}>{t.text} ({t.n})</option>)}
					</select>
					<select value={vigor} onChange={(e) => setVigor(e.target.value as ArticleVigor)} className="dropdown" aria-label="Vigueur">
						<option value="">Toutes les versions</option>
						<option value="force">En vigueur</option>
						<option value="stale">Plus en vigueur</option>
						<option value="unknown">Statut inconnu</option>
					</select>
					<select value={sort} onChange={(e) => setSort(e.target.value as ArticleSort)} className="dropdown" aria-label="Tri">
						<option value="applied">Plus appliqués</option>
						<option value="text">Par texte et numéro</option>
					</select>
				</div>
				<div className="legifrance-article-list">
					{page.rows.map((article) => (
						<div key={article.key} className={`legifrance-article ${article.key === selected ? "is-selected" : ""}`} onClick={() => setSelected(article.key)}>
							<span>
								{article.label}
								{article.status && !["VIGUEUR", "VIGUEUR_DIFF"].includes(article.status) && <span className="legifrance-chip">{statusLabel(article.status)}</span>}
							</span>
							<span className="legifrance-article-count">{article.n}</span>
						</div>
					))}
					{page.rows.length === 0 && <p className="legifrance-empty">Aucun article ne correspond.</p>}
				</div>
				{page.total > page.rows.length && <button onClick={() => setLimit(limit + PAGE_SIZE)}>Afficher la suite ({page.total - page.rows.length})</button>}
			</Card>
			<Card title={current ? current.label : "Décisions"} count={current ? decisions.length : undefined}>
				{!current && <p className="legifrance-empty">Choisissez un article pour voir les décisions de votre base qui l'appliquent.</p>}
				{current && <button onClick={() => void openArticleNote(plugin, current.key)}>Ouvrir ou créer la note de l'article</button>}
				{current && current.key.startsWith("article|") && decisions.length > 0 && !versions && (
					<button disabled={loadingVersions} onClick={() => void showVersions(current.key, current.label)}>
						{loadingVersions ? "Recherche des versions…" : "Version applicable à la date de chaque décision"}
					</button>
				)}
				{current && versions && versions.length === 0 && <p className="legifrance-empty">Aucune version de cet article n'a été retrouvée sur Légifrance.</p>}
				{current && decisions.length === 0 && <p className="legifrance-empty">Aucune décision de votre base ne cite cet article.</p>}
				{decisions.map((record) => (
					<div key={record.id}>
						<DecisionRow record={record} records={getRecords()} />
						{current && <DecisionExcerpt record={record} articleKey={current.key} />}
						{current && versions && versions.length > 0 && <VersionLine label={current.label} versions={versions} date={record.date} />}
					</div>
				))}
			</Card>
		</div>
	);
};

/** Phrase où la décision cite l'article (lue dans le texte en base, seulement si la décision est complétée). */
const DecisionExcerpt = ({ record, articleKey }: { record: DecisionRecord; articleKey: string }) => {
	const plugin = usePlugin();
	const excerpt = useMemo(() => (record.complete ? excerptFor(plugin.references, record.members ?? [record.id], articleKey) : undefined), [plugin, record, articleKey]);
	return excerpt ? <ExcerptQuote excerpt={excerpt} /> : null;
};
