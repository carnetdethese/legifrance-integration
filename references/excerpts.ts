/**
 * Phrase d'une décision où un article est cité (« Il résulte de l'article 1240 du code civil que… »),
 * pour montrer comment une décision applique un article sans ouvrir son texte. Module pur : le texte
 * (Markdown) est fourni, jamais lu ici.
 */
import { citationSpans } from "./parser";

/** Phrase citante, découpée autour de la citation pour la mettre en relief. */
export interface Excerpt {
	before: string;
	/** La citation de l'article, telle qu'écrite dans la décision. */
	cited: string;
	after: string;
}

/** Longueur maximale conservée avant et après la citation (les phrases d'une décision sont parfois très longues). */
const CONTEXT_BEFORE = 180;
const CONTEXT_AFTER = 220;

/** Mots qui précèdent un point sans finir la phrase (« Cass. », « Cons. const. »). Les mots de trois lettres ou moins sont déjà écartés. */
const ABBREVIATIONS = new Set(["cass", "sect", "const", "plén", "mlle", "mmes", "cons", "crim", "civ", "soc", "com", "cour", "mgr", "sarl", "etc"]);

/** Fin de phrase : ponctuation forte suivie d'un espace et d'une majuscule, d'un guillemet ou d'un tiret de liste. */
const SENTENCE_END = /([.!?])\s+(?=[\p{Lu}«"(\-–])|\n\s*\n/gu;

/** Les indices (début, fin) de la phrase qui contient la plage `[start, end)`. */
function sentenceBounds(text: string, start: number, end: number) {
	let from = 0;
	let to = text.length;
	for (const match of text.matchAll(SENTENCE_END)) {
		const at = match.index! + match[0].length;
		if (match[1]) {
			const word = /(\p{L}+)$/u.exec(text.slice(0, match.index!))?.[1] ?? "";
			if (word.length <= 3 || ABBREVIATIONS.has(word.toLowerCase())) continue;
		}
		if (at <= start) from = at;
		else if (match.index! >= end) {
			to = match.index! + (match[1] ? 1 : 0);
			break;
		}
	}
	return { from, to };
}

const collapse = (text: string) => text.replace(/\s+/g, " ");

/**
 * Première phrase de `text` qui cite l'article de clef `articleKey` (la clef de `parseCitations`,
 * « article|code=code civil|number=1240 »), ou `undefined` si le texte ne le cite pas.
 */
export function citingSentence(text: string, articleKey: string): Excerpt | undefined {
	const span = citationSpans(text).find((s) => s.ref.key === articleKey);
	if (!span) return undefined;
	const { from, to } = sentenceBounds(text, span.start, span.end);
	let before = collapse(text.slice(from, span.start)).trimStart();
	let after = collapse(text.slice(span.end, to)).trimEnd();
	if (before.length > CONTEXT_BEFORE) before = `…${before.slice(-CONTEXT_BEFORE).replace(/^\S*\s/, "")}`;
	if (after.length > CONTEXT_AFTER) after = `${after.slice(0, CONTEXT_AFTER).replace(/\s\S*$/, "")}…`;
	return { before, cited: collapse(text.slice(span.start, span.end)), after };
}
