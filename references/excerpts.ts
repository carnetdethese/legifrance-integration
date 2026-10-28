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

/** Combien de caractères autour de la citation on examine pour trouver les limites de la phrase (bien plus que ce qui est gardé). */
const SEARCH_RADIUS = 600;

/** Les indices (début, fin) de la phrase qui contient la plage `[start, end)`. */
function sentenceBounds(text: string, start: number, end: number) {
	const lo = Math.max(0, start - SEARCH_RADIUS);
	const hi = Math.min(text.length, end + SEARCH_RADIUS);
	const region = text.slice(lo, hi);
	let from = lo;
	let to = hi;
	for (const match of region.matchAll(SENTENCE_END)) {
		const at = lo + match.index! + match[0].length;
		if (match[1]) {
			const word = /(\p{L}+)$/u.exec(region.slice(Math.max(0, match.index! - 12), match.index!))?.[1] ?? "";
			if (word.length <= 3 || ABBREVIATIONS.has(word.toLowerCase())) continue;
		}
		if (at <= start) from = at;
		else if (lo + match.index! >= end) {
			to = lo + match.index! + (match[1] ? 1 : 0);
			break;
		}
	}
	return { from, to };
}

const collapse = (text: string) => text.replace(/\s+/g, " ");

/** Écart examiné avant et après un numéro d'article pour y reconnaître sa citation (« l'article », puis le nom du code). */
const WINDOW_BEFORE = 40;
const WINDOW_AFTER = 160;
/** Au-delà, un numéro trop courant (« 1 ») ferait examiner tout le texte : on l'analyse en entier. */
const MIN_NEEDLE = 2;
const MAX_WINDOWS = 60;

/** Plage de la première citation de `articleKey` dans `text`, en n'analysant que les passages qui contiennent son numéro. */
function findSpan(text: string, articleKey: string) {
	const number = /(?:^|\|)number=([^|]*)/.exec(articleKey)?.[1] ?? "";
	// « L. 121-1 », « 1240 », « 61-1 » : le cœur numérique, qui figure tel quel dans le texte (« L121-1 », « article 61-1 »).
	const needle = /\d[\d-]*\d|\d/.exec(number)?.[0] ?? "";
	if (needle.length >= MIN_NEEDLE) {
		let at = text.indexOf(needle);
		for (let tried = 0; at >= 0 && tried < MAX_WINDOWS; tried++, at = text.indexOf(needle, at + needle.length)) {
			let from = Math.max(0, at - WINDOW_BEFORE);
			// Ne pas couper un mot en deux : le motif de « article » exige une limite de mot.
			while (from > 0 && /\S/.test(text[from - 1])) from--;
			const found = citationSpans(text.slice(from, at + needle.length + WINDOW_AFTER)).find((span) => span.ref.key === articleKey);
			if (found) return { ...found, start: found.start + from, end: found.end + from };
		}
	}
	// Numéro introuvable tel quel (alinéa écrit en toutes lettres…) : analyse du texte entier.
	return citationSpans(text).find((span) => span.ref.key === articleKey);
}

/**
 * Première phrase de `text` qui cite l'article de clef `articleKey` (la clef de `parseCitations`,
 * « article|code=code civil|number=1240 »), ou `undefined` si le texte ne le cite pas.
 */
export function citingSentence(text: string, articleKey: string): Excerpt | undefined {
	const span = findSpan(text, articleKey);
	if (!span) return undefined;
	const { from, to } = sentenceBounds(text, span.start, span.end);
	let before = collapse(text.slice(from, span.start)).trimStart();
	let after = collapse(text.slice(span.end, to)).trimEnd();
	if (before.length > CONTEXT_BEFORE) before = `…${before.slice(-CONTEXT_BEFORE).replace(/^\S*\s/, "")}`;
	if (after.length > CONTEXT_AFTER) after = `${after.slice(0, CONTEXT_AFTER).replace(/\s\S*$/, "")}…`;
	return { before, cited: collapse(text.slice(span.start, span.end)), after };
}
