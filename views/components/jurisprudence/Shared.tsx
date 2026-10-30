/**
 * Briques communes aux onglets de l'analyse de la jurisprudence et au panneau des références : `Card` (une rubrique),
 * `Row` (une ligne), `DecisionRow` (une décision avec ses actions), `DecisionInfo`, `RelatedList` et `Genealogy`
 * (décisions proches, relations entre décisions), `SourceBadge` (pastille d'état d'une source), `useOpenNote`.
 */
import { BookOpen, ExternalLink, FileText, Info, Sparkles } from "lucide-react";
import { Fragment, ReactNode, useMemo, useState } from "react";
import { relatedTo } from "references/corpus";
import type { Excerpt } from "references/excerpts";
import { sourceState } from "references/lifecycle";
import { RELATION_LABELS, RELATION_ORDER, RelationItem, relationsFor } from "references/genealogy";
import { DecisionRecord, displayDate } from "references/timeline";
import { topTheme } from "references/themes";
import { openExternal } from "lib/links";
import { usePlugin } from "views/hooks";

/** Ouvre une note du coffre dans l'onglet courant. */
export function useOpenNote() {
	const plugin = usePlugin();
	return (path: string) => {
		const file = plugin.app.vault.getFileByPath(path);
		if (file) void plugin.app.workspace.getLeaf(false).openFile(file);
	};
}

/** Nom d'une note, sans dossier ni extension, pour l'affichage (le chemin complet rend les listes illisibles). */
export const noteName = (path: string) => path.split("/").pop()!.replace(/\.md$/, "");

/** Carte d'une rubrique : titre, effectif (en relief s'il y a quelque chose à faire), aide, contenu. */
export const Card = ({ title, count, alert = false, hint, children }: { title: string; count?: number; alert?: boolean; hint?: string; children?: ReactNode }) => (
	<section className="legifrance-card">
		<div className="legifrance-card-head">
			<h5>{title}</h5>
			{count !== undefined && <span className={`legifrance-badge ${alert && count > 0 ? "is-alert" : ""}`}>{count}</span>}
		</div>
		{hint && <p className="legifrance-card-hint">{hint}</p>}
		<div className="legifrance-rows">{children}</div>
	</section>
);

/**
 * Ligne commune à toutes les listes : repère à gauche (date), titre et détails au centre, actions à
 * droite. Sans repère, la ligne n'a que deux colonnes.
 */
export const Row = ({ lead, title, meta, actions, children }: { lead?: ReactNode; title: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode }) => (
	<div className={`legifrance-row ${lead === undefined ? "is-plain" : ""}`}>
		{lead !== undefined && <div className="legifrance-row-lead">{lead || "—"}</div>}
		<div>
			<div className="legifrance-row-title">{title}</div>
			{meta && <div className="legifrance-row-meta">{meta}</div>}
			{children}
		</div>
		{actions && <div className="legifrance-row-actions">{actions}</div>}
	</div>
);

/** Pastille d'état d'une source : verte si elle est fichée, jaune si elle n'est que citée, grise si la fiche n'est citée nulle part. */
export const SourceBadge = ({ fiche, notes }: { fiche: boolean; notes: number }) => {
	const state = sourceState({ fiche, notes });
	return <span className={`legifrance-source legifrance-source-${state.tone}`} title={state.hint}>{state.label}</span>;
};

/** Ligne d'une décision : date, intitulé, juridiction, thèmes, et liens vers la fiche et Légifrance. */
export const DecisionRow = ({
	record,
	records = [],
	withRelated = false,
	withDate = true,
	extra,
}: {
	record: DecisionRecord;
	records?: DecisionRecord[];
	withRelated?: boolean;
	withDate?: boolean;
	/** Action supplémentaire (par exemple « Créer la fiche »). */
	extra?: ReactNode;
}) => {
	const plugin = usePlugin();
	const openNote = useOpenNote();
	const [showRelated, setShowRelated] = useState(false);
	const [showInfo, setShowInfo] = useState(false);
	const themes = [...new Set(record.themes.map(topTheme))].slice(0, 3);
	const details = [record.court, record.formation, record.solution].filter(Boolean).join(" — ");

	return (
		<Row
			lead={withDate ? displayDate(record.date) : undefined}
			title={
				<>
					{record.name ?? record.title ?? record.label}
					<SourceBadge fiche={!!record.fichePath} notes={record.notes.length} />
				</>
			}
			meta={
				<>
					{record.name && <div>{record.title ?? record.label}</div>}
					{details}
					{details && record.notes.length > 0 && " — "}
					{record.notes.length > 0 && `${record.notes.length} note${record.notes.length > 1 ? "s" : ""}`}
					{themes.length > 0 && (
						<div>
							{themes.map((t) => <span key={t} className="legifrance-chip">{t}</span>)}
						</div>
					)}
				</>
			}
			actions={
				<>
					{extra}
					<button className={`clickable-icon ${showInfo ? "is-active" : ""}`} aria-label="Plus d'informations" onClick={() => setShowInfo(!showInfo)}>
						<Info size={16} />
					</button>
					{/* Une case par action, vide si elle ne s'applique pas : les icônes restent alignées d'une ligne à l'autre. */}
					{record.complete ? (
						<button className="clickable-icon" aria-label="Lire le texte de la décision" onClick={() => void plugin.openStoredDocument(record.id)}>
							<BookOpen size={16} />
						</button>
					) : record.url && plugin.hasCredentials ? (
						// Texte pas encore en base : le lecteur le demande à l'API.
						<button className="clickable-icon" aria-label="Lire la décision (récupérée via l'API)" onClick={() => void plugin.openLegifrance(record.url!)}>
							<BookOpen size={16} />
						</button>
					) : (
						<span className="legifrance-row-slot" />
					)}
					{withRelated && (
						<button className={`clickable-icon ${showRelated ? "is-active" : ""}`} aria-label="Décisions proches" onClick={() => setShowRelated(!showRelated)}>
							<Sparkles size={16} />
						</button>
					)}
					{record.fichePath ? (
						<button className="clickable-icon" aria-label="Ouvrir la fiche" onClick={() => openNote(record.fichePath!)}>
							<FileText size={16} />
						</button>
					) : (
						<span className="legifrance-row-slot" />
					)}
					{record.url ? (
						<a className="clickable-icon" aria-label="Ouvrir la décision sur Légifrance" data-site="" href={record.url}>
							<ExternalLink size={16} />
						</a>
					) : (
						<span className="legifrance-row-slot" />
					)}
				</>
			}
		>
			{showInfo && <DecisionInfo record={record} records={records} />}
			{showRelated && <RelatedList record={record} records={records} />}
		</Row>
	);
};

/** Détail d'une décision : intitulé, numéro, formation, solution, résumé et notes qui la citent. */
export const DecisionInfo = ({ record, records }: { record: DecisionRecord; records?: DecisionRecord[] }) => {
	const openNote = useOpenNote();
	const facts: [string, string | undefined][] = [
		["Intitulé", record.title ?? record.label],
		["Date", displayDate(record.date) || undefined],
		["Juridiction", record.court],
		["Numéro", record.number],
		["Formation", record.formation],
		["Solution", record.solution],
		["Fiche", record.fichePath ? noteName(record.fichePath) : undefined],
		["Cité comme", record.cited?.length ? record.cited.slice(0, 6).join(" — ") + (record.cited.length > 6 ? ` — +${record.cited.length - 6}` : "") : undefined],
		["Identifiant", record.id.startsWith("fiche:") ? undefined : record.id],
	];
	return (
		<div className="legifrance-info">
			<dl>
				{facts.filter(([, value]) => value).map(([name, value]) => (
					<Fragment key={name}><dt>{name}</dt><dd>{value}</dd></Fragment>
				))}
			</dl>
			{record.summary && <p>{record.summary.length > 400 ? `${record.summary.slice(0, 400)}…` : record.summary}</p>}
			{record.notes.length > 0 && (
				<ul>
					{record.notes.map((path) => <li key={path}><a onClick={() => openNote(path)}>{noteName(path)}</a></li>)}
				</ul>
			)}
			{records && <Genealogy record={record} records={records} />}
		</div>
	);
};

/** Décisions proches de `record`, avec ce qui les rapproche. */
export const RelatedList = ({ record, records }: { record: DecisionRecord; records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const openNote = useOpenNote();
	const related = useMemo(() => relatedTo(plugin.references, records, record.id), [plugin, records, record.id]);
	const byId = new Map(records.map((r) => [r.id, r]));

	if (!record.complete) return <p className="legifrance-empty">Le texte de cette décision n'est pas encore analysé (tâche « Compléter les fiches de décisions »).</p>;
	if (related.length === 0) return <p className="legifrance-empty">Aucune décision proche parmi celles dont le texte est analysé.</p>;
	return (
		<ul className="legifrance-related">
			{related.map((item) => {
				const other = byId.get(item.id);
				return (
					<li key={item.id}>
						<a onClick={() => (other?.fichePath ? openNote(other.fichePath) : other?.url && void plugin.openLegifrance(other.url).then((opened) => !opened && openExternal(other.url!)))}>{other?.title ?? item.label}</a>
						<div className="legifrance-row-meta">{Math.round(item.score * 100)} % — {item.reasons.join(" — ")}</div>
					</li>
				);
			})}
		</ul>
	);
};

/** Généalogie d'une décision : ce qu'elle cite (revirements, précisions, confirmations) et par qui elle est citée. */
export const Genealogy = ({ record, records }: { record: DecisionRecord; records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const openNote = useOpenNote();
	const { outgoing, incoming } = useMemo(() => relationsFor(record, plugin.references.allRelations(), records), [plugin, record, records]);
	if (outgoing.length === 0 && incoming.length === 0) return null;

	const open = (item: RelationItem) => {
		if (item.record?.fichePath) openNote(item.record.fichePath);
		else if (item.record?.complete) void plugin.openStoredDocument(item.record.id);
	};
	const groups = (items: RelationItem[], passive: boolean) =>
		RELATION_ORDER.map((kind) => {
			const list = items.filter((item) => item.kind === kind);
			if (list.length === 0) return null;
			const chips = list.map((item, i) => (
				<a key={i} className="legifrance-chip" title={item.extract} onClick={() => open(item)}>{item.label}</a>
			));
			const label = RELATION_LABELS[kind][passive ? "passive" : "active"];
			// Les simples citations sont nombreuses : repliées.
			return kind === "cite" ? (
				<details key={kind}><summary>{label} ({list.length})</summary>{chips}</details>
			) : (
				<div key={kind}><strong>{label} :</strong> {chips}</div>
			);
		});

	return (
		<div className="legifrance-genealogy">
			<h6>Généalogie</h6>
			{groups(outgoing, false)}
			{groups(incoming, true)}
		</div>
	);
};

/** Phrase d'une décision où un article est cité, la citation en relief. */
export const ExcerptQuote = ({ excerpt }: { excerpt: Excerpt }) => (
	<blockquote className="legifrance-quote">
		{excerpt.before} <mark>{excerpt.cited}</mark> {excerpt.after}
	</blockquote>
);
