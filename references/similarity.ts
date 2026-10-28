/**
 * Décisions proches : une décision est proche d'une autre quand elles visent les mêmes articles, ont
 * le même thème, un vocabulaire voisin ou sont citées ensemble dans vos notes. Pas de modèle
 * d'embeddings (trop lourd pour tourner dans Obsidian) : le vocabulaire est comparé par TF-IDF, ce qui
 * sert à repérer des décisions de même sujet, pas de simples synonymes. Module pur.
 */
import { plain } from "./dates";
import { THEME_SEPARATOR } from "./themes";

/** Fréquence de chaque terme significatif d'un texte (les plus fréquents seulement). */
export type Terms = Record<string, number>;

/** Mots vides et formules de procédure, présents dans toutes les décisions. */
const STOP = new Set(
	`dans pour avec sans sous sont etre avoir fait fait cette cette ainsi alors dont donc mais comme entre apres avant contre selon vers tout tous toute toutes plus moins tres aussi leur leurs elle elles ils nous vous
	 ledit ladite lesdits lesdites celui celle ceux celles qui que quoi quand lorsque puisque parce lequel laquelle lesquels lesquelles
	 article articles alinea code decision arret ordonnance jugement requete pourvoi moyen moyens considerant attendu vise visa vu`.split(/\s+/)
);

/** Termes d'un texte : minuscules sans accents, mots d'au moins 4 lettres, sans mots vides ni pluriels simples. */
export function termCounts(text: string, max = 120): Terms {
	const counts = new Map<string, number>();
	for (const raw of plain(text).split(/[^a-z0-9]+/)) {
		if (raw.length < 4 || /^\d+$/.test(raw) || STOP.has(raw)) continue;
		const word = raw.length > 5 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max));
}

/** Ce que l'on sait d'une décision pour la comparer aux autres. */
export interface DecisionFeatures {
	id: string;
	label: string;
	terms: Terms;
	/** Articles visés : clef → libellé. */
	articles: Record<string, string>;
	/** Chemins de thèmes (« Responsabilité > Producteur »). */
	themes: string[];
	/** Notes qui citent la décision. */
	notes: string[];
}

/** Une décision proche, avec ce qui les rapproche. */
export interface RelatedDecision {
	id: string;
	label: string;
	score: number;
	reasons: string[];
}

/** idf d'un élément : rare = informatif (« art. 761-1 CJA » est partout, sans intérêt). */
const idf = (total: number, df: number) => Math.log((total + 1) / (df + 1)) + 1;

/** Similarité pondérée (type Jaccard) de deux ensembles : les éléments rares comptent plus. */
function weightedOverlap(a: string[], b: string[], weight: (key: string) => number) {
	const setB = new Set(b);
	const shared = a.filter((key) => setB.has(key));
	const union = new Set([...a, ...b]);
	const total = [...union].reduce((sum, key) => sum + weight(key), 0);
	return { shared, score: total ? shared.reduce((sum, key) => sum + weight(key), 0) / total : 0 };
}

/** Proximité de deux chemins de thème : part du chemin commun (« A > B » et « A > C » : 0,5). */
function themeOverlap(a: string[], b: string[]) {
	let best = 0;
	let reason: string | undefined;
	for (const x of a) {
		for (const y of b) {
			const px = x.split(THEME_SEPARATOR);
			const py = y.split(THEME_SEPARATOR);
			let common = 0;
			while (common < Math.min(px.length, py.length) && plain(px[common]) === plain(py[common])) common++;
			const score = common / Math.max(px.length, py.length);
			if (score > best) {
				best = score;
				reason = px.slice(0, common).join(THEME_SEPARATOR);
			}
		}
	}
	return { score: best, reason };
}

/** Poids de chaque signal dans le score final. */
const WEIGHTS = { articles: 0.35, text: 0.35, themes: 0.2, notes: 0.1 };
/** En dessous, une décision n'est pas jugée proche. */
const MIN_SCORE = 0.08;

/**
 * Décisions de `corpus` les plus proches de `target` (qui peut en faire partie : il est écarté),
 * de la plus proche à la moins proche.
 */
export function relatedDecisions(target: DecisionFeatures, corpus: DecisionFeatures[], limit = 8): RelatedDecision[] {
	const others = corpus.filter((d) => d.id !== target.id);
	const all = [target, ...others];
	const df = new Map<string, number>();
	const dfArticle = new Map<string, number>();
	for (const d of all) {
		for (const term of Object.keys(d.terms)) df.set(term, (df.get(term) ?? 0) + 1);
		for (const key of Object.keys(d.articles)) dfArticle.set(key, (dfArticle.get(key) ?? 0) + 1);
	}
	const termWeight = (term: string) => idf(all.length, df.get(term) ?? 0);
	const vector = (terms: Terms) => Object.entries(terms).map(([term, count]) => [term, (1 + Math.log(count)) * termWeight(term)] as const);
	const norm = (v: (readonly [string, number])[]) => Math.sqrt(v.reduce((sum, [, w]) => sum + w * w, 0));
	const targetVector = new Map(vector(target.terms));
	const targetNorm = norm([...targetVector]);

	const results: RelatedDecision[] = [];
	for (const other of others) {
		const reasons: string[] = [];

		const articles = weightedOverlap(Object.keys(target.articles), Object.keys(other.articles), (key) => idf(all.length, dfArticle.get(key) ?? 0));
		if (articles.shared.length) reasons.push(`articles communs : ${articles.shared.slice(0, 3).map((key) => target.articles[key]).join(", ")}${articles.shared.length > 3 ? "…" : ""}`);

		const otherVector = vector(other.terms);
		const dot = otherVector.reduce((sum, [term, w]) => sum + w * (targetVector.get(term) ?? 0), 0);
		const denominator = targetNorm * norm(otherVector);
		const text = denominator ? dot / denominator : 0;
		if (text >= 0.15) reasons.push(`vocabulaire proche (${Math.round(text * 100)} %)`);

		const themes = themeOverlap(target.themes, other.themes);
		if (themes.reason) reasons.push(`thème : ${themes.reason}`);

		const notes = weightedOverlap(target.notes, other.notes, () => 1);
		if (notes.shared.length) reasons.push(`citées ensemble dans ${notes.shared.length} note${notes.shared.length > 1 ? "s" : ""}`);

		const score = WEIGHTS.articles * articles.score + WEIGHTS.text * text + WEIGHTS.themes * themes.score + WEIGHTS.notes * notes.score;
		if (score >= MIN_SCORE) results.push({ id: other.id, label: other.label, score, reasons });
	}
	return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
