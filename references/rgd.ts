/**
 * Revue générale du droit (revuegeneraledudroit.eu) : texte de nombreux grands arrêts, jusqu'aux plus
 * anciens, que Légifrance et ArianeWeb n'ont pas. Le site est un WordPress dont on utilise la
 * recherche publique (API WordPress.com) et l'API REST. Sans identifiants.
 */
import { htmlToMarkdown, requestUrl } from "obsidian";
import { plain, significantWords } from "./dates";
import { RGD_SITE, rgdKey, rgdSlug } from "./ids";
import { RgdTitle, bareCaseNumber, parseRgdTitle } from "./rgdTitle";

const SEARCH_URL = "https://public-api.wordpress.com/rest/v1.3/sites/176034720/search";

/** Décision de la Revue, telle que la recherche la présente. */
export interface RgdMatch extends RgdTitle {
	/** Adresse canonique (`rgdKey`), qui sert de clef. */
	key: string;
	title: string;
}

interface SearchResponse {
	results?: { fields?: Record<string, string> }[];
}

/**
 * Décisions de la Revue (pas ses articles) qui répondent à `query` : un nom de parties ou un numéro.
 * @throws Error si la Revue est injoignable.
 */
async function search(query: string): Promise<RgdMatch[]> {
	const params = new URLSearchParams({ query, size: "20", sort: "score_default" });
	["title.default", "permalink.url.raw", "date"].forEach((field, i) => params.append(`fields[${i}]`, field));
	params.append("filter[bool][must][0][term][post_type]", "decisions");
	const response = await requestUrl({ url: `${SEARCH_URL}?${params}`, throw: false });
	if (response.status !== 200) throw new Error(`Revue générale du droit : erreur HTTP ${response.status}`);

	const found: RgdMatch[] = [];
	for (const { fields } of (response.json as SearchResponse).results ?? []) {
		const title = fields?.["title.default"];
		const slug = rgdSlug(fields?.["permalink.url.raw"] ?? "");
		const parsed = title && parseRgdTitle(title);
		if (title && slug && parsed) found.push({ ...parsed, key: rgdKey(slug), title });
	}
	return found;
}

/** Décisions de la Revue portant ce numéro de requête ou de pourvoi. */
export async function findRgdByNumber(number: string, court?: string): Promise<RgdMatch[]> {
	const wanted = bareCaseNumber(number);
	return (await search(number)).filter((m) => m.number && bareCaseNumber(m.number) === wanted && (!court || !m.courtCode || m.courtCode === court));
}

/**
 * Décisions de la Revue dont le titre porte le nom des parties (tous leurs mots significatifs), à la
 * date citée si elle est donnée (jour exact, ou année si seule l'année l'est).
 */
export async function findRgdByName(name: string, court?: string, date?: string): Promise<RgdMatch[]> {
	const words = significantWords(name);
	if (words.length === 0) return [];
	return (await search(name)).filter((m) => {
		if (court && m.courtCode && m.courtCode !== court) return false;
		if (date && m.date && !(date.length >= 10 ? m.date === date.slice(0, 10) : m.date.startsWith(date.slice(0, 4)))) return false;
		const title = plain(`${m.name} ${m.title}`);
		return words.every((word) => title.includes(word));
	});
}

/** Décision de la Revue lue en entier. */
export interface RgdDecision extends RgdTitle {
	title: string;
	html: string;
	markdown: string;
}

/**
 * Titre et texte d'une décision de la Revue (`/wp-json/wp/v2/decisions?slug=`).
 * @throws Error si la Revue est injoignable ou ne connaît pas la décision.
 */
export async function readRgdDecision(key: string): Promise<RgdDecision> {
	const slug = rgdSlug(key);
	if (!slug) throw new Error("Adresse de la Revue générale du droit non reconnue.");
	const response = await requestUrl({ url: `${RGD_SITE}/wp-json/wp/v2/decisions?slug=${encodeURIComponent(slug)}&_fields=title,content`, throw: false });
	if (response.status !== 200) throw new Error(`Revue générale du droit : erreur HTTP ${response.status}`);
	const post = (response.json as { title?: { rendered?: string }; content?: { rendered?: string } }[])[0];
	const rendered = post?.title?.rendered;
	const parsed = rendered && parseRgdTitle(htmlToMarkdown(rendered).trim());
	if (!post || !parsed || !rendered) throw new Error("Décision introuvable sur la Revue générale du droit.");
	const html = post.content?.rendered ?? "";
	return { ...parsed, title: htmlToMarkdown(rendered).trim(), html, markdown: htmlToMarkdown(html).trim() };
}
