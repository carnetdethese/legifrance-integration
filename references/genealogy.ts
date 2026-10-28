/**
 * Généalogie de la jurisprudence : les décisions qu'une décision cite dans son texte, avec la façon
 * dont elle les cite (« revient sur », « précise », « confirme »). Module pur.
 */
import { LegalRef, citationSpans } from "./parser";
import { plain } from "./dates";
import { DecisionRecord, courtGroup, numberSignature } from "./timeline";

/** Rapport d'une décision à une autre, du plus fort au plus neutre. */
export type RelationKind = "renverse" | "precise" | "confirme" | "cite";

export const RELATION_ORDER: RelationKind[] = ["renverse", "precise", "confirme", "cite"];

/** Libellés : ce que fait la décision citante, et ce que subit la décision citée. */
export const RELATION_LABELS: Record<RelationKind, { active: string; passive: string }> = {
	renverse: { active: "Revient sur", passive: "Écartée ou renversée par" },
	precise: { active: "Précise", passive: "Précisée par" },
	confirme: { active: "Confirme", passive: "Confirmée par" },
	cite: { active: "Cite", passive: "Citée par" },
};

/** Formules (sans accents) qui qualifient la façon dont une décision en cite une autre. */
const FORMULAS: [RelationKind, RegExp][] = [
	["renverse", /revenir sur|revient sur|reviennent sur|abandon|renvers|inflech|contrairement a ce qu|ne peut plus etre maintenue?|cesse d'etre applicable/],
	["precise", /\bpreci(?:se|sant|sons|ser)\b|completant|dans les conditions? (?:definies?|posees?|enoncees?)/],
	["confirme", /confirm|ainsi que (?:l'a|l'ont) juge|comme (?:l'a|l'ont|il a|elle a) (?:deja )?juge|jurisprudence constante|conformement a (?:la decision|l'arret|la jurisprudence)|en application de la decision/],
];

/** Décision citée dans le texte d'une autre. */
export interface Relation {
	ref: LegalRef;
	kind: RelationKind;
	/** Phrase où la décision est citée. */
	extract: string;
}

const MAX_EXTRACT = 280;

/** Façon dont une phrase qualifie les décisions qu'elle cite. */
const kindOf = (sentence: string): RelationKind => FORMULAS.find(([, formula]) => formula.test(plain(sentence)))?.[0] ?? "cite";

/** Décisions citées par un texte, chacune avec la formule la plus forte parmi ses citations. */
export function decisionRelations(markdown: string): Relation[] {
	const found = new Map<string, Relation>();
	for (const raw of markdown.split(/(?<=[.;!?])\s+/)) {
		const sentence = raw.replace(/\s+/g, " ").trim();
		if (sentence.length < 20) continue;
		const refs = citationSpans(sentence).map((s) => s.ref).filter((ref) => ref.kind === "decision");
		if (refs.length === 0) continue;
		const kind = kindOf(sentence);
		for (const ref of refs) {
			const known = found.get(ref.key);
			if (!known || RELATION_ORDER.indexOf(kind) < RELATION_ORDER.indexOf(known.kind)) {
				found.set(ref.key, { ref, kind, extract: sentence.length > MAX_EXTRACT ? `${sentence.slice(0, MAX_EXTRACT)}…` : sentence });
			}
		}
	}
	return [...found.values()];
}

/** Ligne de la table `decision_relations`. */
export interface RelationRow {
	from_id: string;
	to_key: string;
	to_label: string;
	to_court: string | null;
	to_number: string | null;
	kind: RelationKind;
	extract: string;
}

/** Une relation vue depuis une décision : l'autre décision (connue ou non) et la façon dont elles se rattachent. */
export interface RelationItem {
	kind: RelationKind;
	label: string;
	extract: string;
	record?: DecisionRecord;
}

/** La relation désigne-t-elle cette décision ? (même référence, ou même numéro dans la même juridiction) */
function targets(row: RelationRow, record: DecisionRecord) {
	if (record.refKeys?.includes(row.to_key)) return true;
	const group = courtGroup(row.to_court ?? undefined);
	return !!group && !!row.to_number && !!record.signs?.numbers.includes(numberSignature(group, row.to_number));
}

/**
 * Relations d'une décision : celles qu'elle établit (`outgoing`) et celles dont elle est l'objet
 * (`incoming`), la décision en face étant retrouvée parmi `records` quand elle y est.
 */
export function relationsFor(record: DecisionRecord, rows: RelationRow[], records: DecisionRecord[]) {
	const own = new Set(record.members ?? [record.id]);
	const byMember = new Map(records.flatMap((r) => (r.members ?? [r.id]).map((id): [string, DecisionRecord] => [id, r])));
	const outgoing: RelationItem[] = [];
	const incoming: RelationItem[] = [];

	for (const row of rows) {
		if (own.has(row.from_id)) {
			const other = records.find((r) => r !== record && targets(row, r));
			if (!targets(row, record)) outgoing.push({ kind: row.kind, label: other?.name ?? other?.title ?? row.to_label, extract: row.extract, record: other });
		} else if (targets(row, record)) {
			const other = byMember.get(row.from_id);
			if (other !== record) incoming.push({ kind: row.kind, label: other?.name ?? other?.title ?? row.from_id, extract: row.extract, record: other });
		}
	}
	const order = (a: RelationItem, b: RelationItem) => RELATION_ORDER.indexOf(a.kind) - RELATION_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label);
	return { outgoing: outgoing.sort(order), incoming: incoming.sort(order) };
}
