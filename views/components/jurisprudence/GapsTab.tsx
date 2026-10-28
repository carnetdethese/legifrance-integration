/**
 * Lacunes du corpus : pour chaque article que vos notes citent, les décisions de la base qui l'appliquent et
 * que ces notes ne citent pas. Aucune requête à l'API (seules les décisions que le coffre connaît sont proposées).
 */
import { useMemo, useState } from "react";
import { CorpusGap, corpusGaps, notesCitingArticles, statusLabel } from "references/corpus";
import { DecisionRecord } from "references/timeline";
import { usePlugin } from "views/hooks";
import { Card, DecisionRow, noteName, useOpenNote } from "./Shared";

/** Nombre d'articles ajoutés par « Afficher la suite ». */
const PAGE_SIZE = 15;

export const GapsTab = ({ records }: { records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const openNote = useOpenNote();
	const [note, setNote] = useState("");
	const [limit, setLimit] = useState(PAGE_SIZE);
	const notes = useMemo(() => notesCitingArticles(plugin.references), [plugin, records]);
	const gaps = useMemo(() => corpusGaps(plugin.references, records, note || undefined), [plugin, records, note]);

	return (
		<div>
			<Card
				title="Lacunes du corpus"
				count={gaps.length}
				hint="Pour chaque article cité dans vos notes (les plus cités d'abord), les décisions de votre base qui l'appliquent et que ces notes ne citent pas. Seules les décisions déjà dans la base, dont le texte est récupéré, sont proposées."
			>
				<select value={note} onChange={(e) => { setNote(e.target.value); setLimit(PAGE_SIZE); }} className="dropdown" aria-label="Note">
					<option value="">Toutes les notes</option>
					{notes.map((path) => <option key={path} value={path}>{noteName(path)}</option>)}
				</select>
				{gaps.length === 0 && <p className="legifrance-empty">Aucune lacune : les décisions de la base qui appliquent vos articles sont déjà citées{note ? " dans cette note" : ""}.</p>}
				{gaps.slice(0, limit).map((gap) => <Gap key={gap.key} gap={gap} records={records} openNote={openNote} />)}
				{gaps.length > limit && <button onClick={() => setLimit(limit + PAGE_SIZE)}>Afficher la suite ({gaps.length - limit})</button>}
			</Card>
		</div>
	);
};

const Gap = ({ gap, records, openNote }: { gap: CorpusGap; records: DecisionRecord[]; openNote: (path: string) => void }) => {
	const plugin = usePlugin();
	const [open, setOpen] = useState(false);
	return (
		<div className="legifrance-gap">
			<div className="legifrance-article" onClick={() => setOpen(!open)}>
				<span>
					{gap.label}
					{gap.status && !["VIGUEUR", "VIGUEUR_DIFF"].includes(gap.status) && <span className="legifrance-chip">{statusLabel(gap.status)}</span>}
					<span className="legifrance-row-meta">
						{" "}cité {gap.citations} fois dans {gap.citedIn.slice(0, 3).map((path) => <a key={path} onClick={(e) => { e.stopPropagation(); openNote(path); }}>{noteName(path)} </a>)}
						{gap.citedIn.length > 3 && `+${gap.citedIn.length - 3}`}
					</span>
				</span>
				<span className="legifrance-article-count" title="Décisions qui l'appliquent sans être citées">{gap.decisions.length}</span>
			</div>
			{open && (
				<>
					{gap.decisions.map((record) => <DecisionRow key={record.id} record={record} records={records} />)}
					<a className="legifrance-row-meta" onClick={() => void plugin.activateJurisprudenceView({ tab: "articles", articleKey: gap.key })}>Voir l'article et ses extraits →</a>
				</>
			)}
		</div>
	);
};
