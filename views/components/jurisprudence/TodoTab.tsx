/**
 * Vue Base de données, onglet « À faire » : ce qui demande une action de l'utilisateur. Une `Card` par rubrique, dont
 * les lignes portent leur action : décisions citées sans fiche (créer la fiche), décisions introuvables (préciser),
 * articles modifiés, citations à vérifier (date ou numéro écrits qui diffèrent de la décision), écarts entre une fiche
 * et Légifrance (corriger), articles cités qui ne sont plus en vigueur, fiches jamais citées, fiches sans identifiant.
 */
import { Notice } from "obsidian";
import { REFERENCES_EVENT } from "lib/events";
import { refineUnresolved } from "references/refine";
import { useMemo, useState } from "react";
import { citationIssues } from "references/checks";
import { loadCitationChecks, staleArticles, statusLabel } from "references/corpus";
import { FicheDiscrepancy, createFiche, ficheDiscrepancies, fixFiche, missingFiches, orphanFiches } from "references/insights";
import { FICHE_FIELDS } from "references/fiches";
import { DecisionRecord } from "references/timeline";
import { RESOLVED_ID } from "references/merge";
import { usePlugin } from "views/hooks";
import { Card, DecisionRow, Row, noteName, useOpenNote } from "./Shared";

/** Identifiant Légifrance d'une décision (la fiche ne peut être créée que s'il est connu). */
const hasLegifranceId = (id: string) => RESOLVED_ID.test(id);

/** Ce qui reste à faire : fiches à créer, fiches inutilisées, écarts avec Légifrance, articles abrogés. */
export const TodoTab = ({ records }: { records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const openNote = useOpenNote();
	const [limit, setLimit] = useState(30);
	/** Fiches corrigées pendant cet affichage (la base ne change qu'au prochain recensement). */
	const [fixed, setFixed] = useState<Set<string>>(new Set());
	const missing = useMemo(() => missingFiches(records), [records]);
	const orphans = useMemo(() => orphanFiches(plugin, records), [plugin, records]);
	const stale = useMemo(() => staleArticles(plugin.references), [plugin, records]);
	const all = useMemo(() => ficheDiscrepancies(plugin), [plugin, records]);
	const discrepancies = all.filter((d) => !fixed.has(d.path));

	async function create(record: DecisionRecord) {
		const file = await createFiche(plugin, record);
		if (file) new Notice(`Fiche créée : ${file.path}`);
	}

	async function fix(item: FicheDiscrepancy) {
		await fixFiche(plugin, item.path, item.differences);
		setFixed(new Set([...fixed, item.path]));
		new Notice(`Fiche corrigée : ${item.title}`);
	}

	const changed = useMemo(() => plugin.references.changedArticles(), [plugin, records]);
	const issues = useMemo(() => citationIssues(loadCitationChecks(plugin.references)), [plugin, records]);
	const [issuesLimit, setIssuesLimit] = useState(20);
	const unresolved = useMemo(() => plugin.references.unresolvedDecisions(), [plugin, records]);
	const [unresolvedLimit, setUnresolvedLimit] = useState(30);

	async function refine(ref: (typeof unresolved)[number]) {
		if (await refineUnresolved(plugin, ref)) plugin.events.trigger(REFERENCES_EVENT);
	}

	const none = <p className="legifrance-empty">Rien à signaler.</p>;
	return (
		<div>
			<Card title="Décisions citées sans fiche" count={missing.length} alert hint="Les plus citées d'abord. « Créer la fiche » en ouvre une avec l'identifiant de la décision ; le bouton de la fiche la complète ensuite.">
				{missing.length === 0 && none}
				{missing.slice(0, limit).map((record) => (
					<DecisionRow
						key={record.id}
						record={record}
						extra={
							hasLegifranceId(record.id) ? (
								<button onClick={() => create(record)}>Créer la fiche</button>
							) : (
								<span className="legifrance-row-meta" title="L'identifiant Légifrance sera connu une fois la décision retrouvée par l'API">identifiant inconnu</span>
							)
						}
					/>
				))}
				{missing.length > limit && <button onClick={() => setLimit(limit + 30)}>Afficher la suite ({missing.length - limit})</button>}
			</Card>

			<Card title="Décisions introuvables" count={unresolved.length} alert hint="Citées dans vos notes mais non retrouvées sur Légifrance ni ArianeWeb. « Préciser » relance la recherche avec le nom, la date et le numéro que vous donnez, ou avec un lien.">
				{unresolved.length === 0 && none}
				{unresolved.slice(0, unresolvedLimit).map((ref) => (
					<Row
						key={ref.key}
						title={ref.data.name ?? ref.label}
						meta={
							<>
								{ref.label}
								<div>
									{ref.citations} citation{ref.citations > 1 ? "s" : ""}
									{ref.notes.slice(0, 3).map((path) => <a key={path} onClick={() => openNote(path)}> · {noteName(path)}</a>)}
									{ref.notes.length > 3 && ` · +${ref.notes.length - 3}`}
								</div>
							</>
						}
						actions={<button onClick={() => void refine(ref)}>Préciser</button>}
					/>
				))}
				{unresolved.length > unresolvedLimit && <button onClick={() => setUnresolvedLimit(unresolvedLimit + 30)}>Afficher la suite ({unresolved.length - unresolvedLimit})</button>}
			</Card>

			<Card title="Articles modifiés" count={changed.length} alert hint="Statut de vigueur ou texte qui a changé à la dernière actualisation (réglages → « Actualiser les articles »). « Vu » retire l'article de la liste.">
				{changed.length === 0 && none}
				{changed.map((article) => (
					<Row
						key={article.key}
						title={<a href={article.url}>{article.label}</a>}
						meta={
							<>
								<div>{article.previousStatus !== article.status ? `statut : ${statusLabel(article.previousStatus)} → ${statusLabel(article.status)}` : "texte modifié"} · {new Date(article.changedAt).toLocaleDateString("fr-FR")}</div>
								<div>{article.notes.slice(0, 3).map((path) => <a key={path} onClick={() => openNote(path)}>{noteName(path)} · </a>)}{article.notes.length > 3 && `+${article.notes.length - 3}`}</div>
							</>
						}
						actions={<button onClick={() => { plugin.references.acknowledgeChange(article.key); plugin.events.trigger(REFERENCES_EVENT); }}>Vu</button>}
					/>
				))}
			</Card>

			<Card title="Citations à vérifier" count={issues.length} alert hint="Date ou numéro écrits dans une note qui ne sont pas ceux de la décision retrouvée : faute de frappe, ou mauvaise décision rapprochée. Seules les décisions déjà complétées sont contrôlées.">
				{issues.length === 0 && none}
				{issues.slice(0, issuesLimit).map((issue) => (
					<Row
						key={issue.key}
						title={issue.label}
						meta={
							<>
								{issue.problems.map((problem) => <div key={problem}>{problem}</div>)}
								<div>{issue.notes.slice(0, 3).map((path) => <a key={path} onClick={() => openNote(path)}>{noteName(path)} · </a>)}{issue.notes.length > 3 && `+${issue.notes.length - 3}`}</div>
							</>
						}
					/>
				))}
				{issues.length > issuesLimit && <button onClick={() => setIssuesLimit(issuesLimit + 20)}>Afficher la suite ({issues.length - issuesLimit})</button>}
			</Card>

			<Card title="Écarts avec Légifrance" count={discrepancies.length} alert hint="Propriétés d'une fiche qui diffèrent de la décision enregistrée dans la base (date décalée, numéro inexact…). Seules les décisions déjà complétées sont comparées.">
				{discrepancies.length === 0 && none}
				{discrepancies.map((item) => (
					<Row
						key={item.path}
						title={<a onClick={() => openNote(item.path)}>{item.title}</a>}
						actions={<button onClick={() => fix(item)}>Corriger</button>}
					>
						{item.differences.map((d) => (
							<div key={d.property} className="legifrance-diff">
								<span className="legifrance-row-meta">{FICHE_FIELDS[d.field]} (« {d.property} ») : </span>
								<s>{d.current}</s> → {d.expected}
							</div>
						))}
					</Row>
				))}
			</Card>

			<Card title="Articles cités qui ne sont plus en vigueur" count={stale.length} alert hint="Version en vigueur introuvable sur Légifrance. Le statut est relevé quand le lien de l'article est (re)trouvé.">
				{stale.length === 0 && none}
				{stale.map((article) => (
					<Row
						key={article.key}
						title={<a href={article.url}>{article.label}</a>}
						meta={article.notes.map((path) => <a key={path} onClick={() => openNote(path)}>{noteName(path)} </a>)}
						actions={<span className="legifrance-chip">{statusLabel(article.status)}</span>}
					/>
				))}
			</Card>

			<Card title="Fiches jamais citées" count={orphans.unused.length} hint="Fiches dont la décision n'apparaît dans aucune de vos notes.">
				{orphans.unused.length === 0 && none}
				{orphans.unused.map((path) => <Row key={path} title={<a onClick={() => openNote(path)}>{noteName(path)}</a>} />)}
			</Card>

			<Card title="Fiches sans identifiant" count={orphans.unidentified.length} hint="Impossible de les relier aux citations. Le bouton en haut de la fiche cherche la décision.">
				{orphans.unidentified.length === 0 && none}
				{orphans.unidentified.slice(0, 50).map((path) => <Row key={path} title={<a onClick={() => openNote(path)}>{noteName(path)}</a>} />)}
				{orphans.unidentified.length > 50 && <p className="legifrance-row-meta">… et {orphans.unidentified.length - 50} autres.</p>}
			</Card>
		</div>
	);
};
