/**
 * Recherche dans le texte des décisions, des articles et des documents consultés que la base contient.
 * Insensible à la casse et aux accents (« Responsabilité » trouve « RESPONSABILITE »), tous les mots
 * demandés doivent figurer dans le texte, une expression entre guillemets se cherche telle quelle.
 *
 * Le filtrage se fait dans SQLite, par la fonction `fold` que `LegalDatabase` y déclare : seuls les
 * textes retenus (une page) sont relus en JavaScript pour en tirer les extraits.
 */
import type { ReferenceIndex } from ".";

/**
 * Texte réduit pour la comparaison : minuscules, sans accents, apostrophes et espaces insécables
 * ordinaires. La longueur est conservée (un caractère pour un caractère), de sorte qu'une position
 * trouvée dans le texte réduit est valable dans le texte d'origine.
 */
export function foldText(text: string) {
	return text.toLowerCase().replace(/[\u00c0-\u024f\u2018\u2019\u00a0\u202f]/g, (c) => {
		if (c === "\u2018" || c === "\u2019") return "'";
		if (c === "\u00a0" || c === "\u202f") return " ";
		const base = c.normalize("NFD")[0];
		return base.length === 1 ? base : c;
	});
}

/** Mots (ou expressions entre guillemets) d'une recherche, réduits ; les mots d'une lettre sont ignorés. */
export function searchTerms(query: string) {
	const terms: string[] = [];
	for (const match of query.matchAll(/"([^"]+)"|(\S+)/g)) {
		const term = foldText((match[1] ?? match[2]).trim().replace(/\s+/g, " "));
		if (term.length >= 2 && !terms.includes(term)) terms.push(term);
	}
	return terms;
}

/** Un morceau d'extrait, surligné s'il correspond à un mot cherché. */
export interface SnippetPart {
	text: string;
	hit: boolean;
}

/** Longueur du contexte gardé de chaque côté d'un mot trouvé. */
const CONTEXT = 90;

/**
 * Extraits d'un texte autour des mots cherchés : au plus `max`, chacun autour d'une occurrence, sans que
 * deux extraits se recouvrent. Les retours à la ligne et la mise en forme Markdown sont aplatis.
 */
export function snippetsFor(text: string, terms: string[], max = 3): SnippetPart[][] {
	const folded = foldText(text);
	if (folded.length !== text.length) return []; // caractère dont la réduction change la longueur : pas d'extraits
	const found: { start: number; end: number }[] = [];
	for (const term of terms) {
		let from = 0;
		for (let n = 0; n < max; n++) {
			const at = folded.indexOf(term, from);
			if (at < 0) break;
			found.push({ start: at, end: at + term.length });
			from = at + term.length;
		}
	}
	found.sort((a, b) => a.start - b.start);

	const snippets: SnippetPart[][] = [];
	let lastEnd = -1;
	for (const first of found) {
		if (snippets.length >= max) break;
		if (first.start < lastEnd) continue;
		const from = Math.max(0, first.start - CONTEXT);
		const to = Math.min(text.length, first.end + CONTEXT);
		const inside = found.filter((f) => f.start >= from && f.end <= to);
		const parts: SnippetPart[] = [];
		let cursor = from;
		for (const hit of inside) {
			if (hit.start < cursor) continue;
			if (hit.start > cursor) parts.push({ text: text.slice(cursor, hit.start), hit: false });
			parts.push({ text: text.slice(hit.start, hit.end), hit: true });
			cursor = hit.end;
		}
		if (cursor < to) parts.push({ text: text.slice(cursor, to), hit: false });
		const flat = parts.map((p) => ({ ...p, text: p.text.replace(/[*_#>`]+/g, "").replace(/\s+/g, " ") }));
		if (from > 0) flat.unshift({ text: "… ", hit: false });
		if (to < text.length) flat.push({ text: " …", hit: false });
		snippets.push(flat);
		lastEnd = to;
	}
	return snippets;
}

export type SearchScope = "all" | "decisions" | "articles" | "documents";

/** Un texte qui contient les mots cherchés. */
export interface SearchHit {
	kind: "decision" | "article" | "document";
	/** Identifiant du document pour le lire (`openStoredDocument`). */
	id: string;
	title: string;
	/** Juridiction, numéro, statut… */
	detail: string;
	/** AAAA-MM-JJ (décisions), pour le tri. */
	date?: string;
	url?: string;
	snippets: SnippetPart[][];
}

/** Identifiant Légifrance contenu dans une adresse d'article ou de texte. */
const documentIdOf = (url: string) => /(?:LEGIARTI|LEGITEXT|JORFTEXT|JORFARTI|KALIARTI|KALITEXT)\d{12}/.exec(url)?.[0] ?? url;

/** Conditions « contient tous les mots », sur la colonne réduite `f`. */
const containsAll = (terms: string[]) => terms.map(() => "instr(f, ?) > 0").join(" AND ");

interface Match {
	id: string;
	title: string;
	detail: string;
	date?: string;
	url?: string;
	kind: SearchHit["kind"];
}

function matches(index: ReferenceIndex, scope: SearchScope, terms: string[]): Match[] {
	const where = containsAll(terms);
	const found: Match[] = [];

	if (scope === "all" || scope === "decisions") {
		for (const row of index.db.all<{ id: string; title: string | null; court: string | null; number: string | null; date: string | null }>(
			`WITH t AS MATERIALIZED (
				SELECT legifrance_id AS id, title, court, number, date, fold(COALESCE(title, '') || ' ' || text_markdown) AS f
				FROM decisions WHERE rowid IN (
					SELECT MIN(rowid) FROM decisions WHERE status = 'complete' AND text_markdown IS NOT NULL AND legifrance_id IS NOT NULL GROUP BY legifrance_id))
			SELECT id, title, court, number, date FROM t WHERE ${where}`,
			terms
		)) {
			found.push({ kind: "decision", id: row.id, title: row.title ?? row.id, detail: [row.court, row.number && `n° ${row.number}`].filter(Boolean).join(" — "), date: row.date ?? undefined });
		}
	}

	if (scope === "all" || scope === "articles") {
		for (const row of index.db.all<{ url: string; title: string; status: string | null }>(
			`WITH t AS MATERIALIZED (SELECT url, title, status, fold(title || ' ' || text) AS f FROM links WHERE text IS NOT NULL)
			SELECT url, title, status FROM t WHERE ${where} ORDER BY title`,
			terms
		)) {
			found.push({ kind: "article", id: documentIdOf(row.url), title: row.title, detail: row.status ?? "", url: row.url });
		}
	}

	if (scope === "all" || scope === "documents") {
		for (const row of index.db.all<{ id: string; title: string; court: string | null; date: string | null; url: string | null }>(
			`WITH t AS MATERIALIZED (SELECT id, title, court, date, url, fold(title || ' ' || text_markdown) AS f FROM documents WHERE text_markdown IS NOT NULL)
			SELECT id, title, court, date, url FROM t WHERE ${where}`,
			terms
		)) {
			// Une décision déjà trouvée dans ses fiches complétées n'est pas listée deux fois.
			if (found.some((m) => m.id === row.id)) continue;
			found.push({ kind: "document", id: row.id, title: row.title, detail: row.court ?? "", date: row.date ?? undefined, url: row.url ?? undefined });
		}
	}
	return found;
}

/** Texte brut (Markdown) d'un résultat, pour en tirer les extraits. */
function textOf(index: ReferenceIndex, hit: Match): string {
	const db = index.db;
	if (hit.kind === "decision") return db.get<{ t: string }>("SELECT text_markdown AS t FROM decisions WHERE legifrance_id = ? AND status = 'complete' AND text_markdown IS NOT NULL LIMIT 1", [hit.id])?.t ?? "";
	if (hit.kind === "article") return db.get<{ t: string }>("SELECT text AS t FROM links WHERE url = ? LIMIT 1", [hit.url ?? ""])?.t ?? "";
	return db.get<{ t: string }>("SELECT text_markdown AS t FROM documents WHERE id = ?", [hit.id])?.t ?? "";
}

/**
 * Textes qui contiennent tous les mots de `query`, une page à la fois (les décisions les plus récentes
 * d'abord, puis les articles, puis les autres documents), avec le nombre total de textes trouvés.
 */
export function searchTexts(index: ReferenceIndex, query: string, { scope = "all", limit = 30, offset = 0 }: { scope?: SearchScope; limit?: number; offset?: number } = {}) {
	const terms = searchTerms(query);
	if (terms.length === 0) return { hits: [] as SearchHit[], total: 0, terms };
	const all = matches(index, scope, terms);
	const order = { decision: 0, article: 1, document: 2 };
	all.sort((a, b) => order[a.kind] - order[b.kind] || (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title));
	const hits = all.slice(offset, offset + limit).map((m) => ({ ...m, snippets: snippetsFor(textOf(index, m), terms) }));
	return { hits, total: all.length, terms };
}
