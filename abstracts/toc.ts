/**
 * Table des matières d'un texte consolidé (code, loi) et contexte d'un article, d'après les réponses de
 * l'API (`/consult/legi/tableMatieres`, `/consult/getArticle`). Modules purs : les appels et le cache sont
 * dans `legislation.ts`.
 */
import { cleanTitle } from "lib/tools";
import { plain } from "references/dates";
import { ArticleVersion, parseVersions } from "references/versions";

/** Un article de la table des matières (sans texte : on le lit à la demande). */
export interface TocArticle {
	kind: "article";
	/** Identifiant de la version de l'article à la date demandée (`LEGIARTI…`). */
	id: string;
	/** Identifiant commun à toutes ses versions : il retrouve l'article d'une date à l'autre. */
	cid: string;
	num: string;
	status: string;
}

/** Une section (livre, titre, chapitre…) et ce qu'elle contient, dans l'ordre du texte. */
export interface TocSection {
	kind: "section";
	id: string;
	title: string;
	status: string;
	children: TocNode[];
}

export type TocNode = TocSection | TocArticle;

export interface Toc {
	/** Identifiant du texte (`LEGITEXT…`). */
	id: string;
	title: string;
	/** Nature du texte (`CODE`, `LOI`, `CONSTITUTION`…). */
	nature: string;
	status: string;
	root: TocSection;
	/** Tous les articles, dans l'ordre de lecture (sert à passer à l'article suivant ou précédent). */
	articles: TocArticle[];
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const objects = (value: unknown) => (Array.isArray(value) ? value.filter(isObject) : []);

/** Un identifiant de l'API sans le suffixe de date (`LEGITEXT…_10-03-2024`). */
const bare = (id: string) => id.replace(/_\d{2}-\d{2}-\d{4}$/, "");

/** Nœuds d'une section (articles et sous-sections) dans l'ordre du texte (`intOrdre`). */
function childrenOf(node: Json): TocNode[] {
	const items: { order: number; node: TocNode }[] = [];
	for (const article of objects(node.articles)) {
		const id = text(article.id);
		if (!id) continue;
		items.push({ order: Number(article.intOrdre ?? 0), node: { kind: "article", id, cid: text(article.cid) || id, num: text(article.num), status: text(article.etat) } });
	}
	for (const section of objects(node.sections)) {
		items.push({ order: Number(section.intOrdre ?? 0), node: sectionOf(section) });
	}
	return items.sort((a, b) => a.order - b.order).map((item) => item.node);
}

function sectionOf(node: Json): TocSection {
	return { kind: "section", id: text(node.id), title: cleanTitle(text(node.title)) || "Sans titre", status: text(node.etat), children: childrenOf(node) };
}

/** Articles d'une section, en profondeur d'abord (l'ordre de lecture). */
export function articlesOf(section: TocSection): TocArticle[] {
	return section.children.flatMap((child) => (child.kind === "article" ? [child] : articlesOf(child)));
}

/** Articles d'une section en deux mots : leur nombre et l'étendue des numéros (« art. 82 à 102 »), vide s'il n'y en a pas. */
export function articleSpan(section: TocSection): { count: number; range: string } {
	const articles = articlesOf(section).filter((article) => article.num);
	const all = articlesOf(section).length;
	if (articles.length === 0) return { count: all, range: "" };
	const first = articles[0].num;
	const last = articles[articles.length - 1].num;
	return { count: all, range: first === last ? `art. ${first}` : `art. ${first} à ${last}` };
}

/** Table des matières d'après la réponse de l'API ; `null` si elle n'a pas la forme attendue. */
export function parseToc(response: unknown): Toc | null {
	if (!isObject(response)) return null;
	const id = bare(text(response.id) || text(response.cid));
	if (!id) return null;
	const root = sectionOf({ ...response, id, title: text(response.title) });
	return { id, title: root.title, nature: text(response.nature), status: text(response.etat), root, articles: articlesOf(root) };
}

/** Sections qui contiennent l'article `cid` (de la racine à la plus profonde), ou `[]` s'il n'y figure pas. */
export function ancestorsOf(section: TocSection, cid: string): string[] {
	for (const child of section.children) {
		if (child.kind === "article") {
			if (child.cid === cid || child.id === cid) return [section.id];
		} else {
			const found = ancestorsOf(child, cid);
			if (found.length) return [section.id, ...found];
		}
	}
	return [];
}

/** Sections que l'on traverse en suivant `path` (identifiants, sans la racine), ou `null` si le chemin n'existe plus (autre date, autre version du texte). */
export function follow(root: TocSection, path: string[]): TocSection[] | null {
	const trail: TocSection[] = [];
	let current = root;
	for (const id of path) {
		const next = current.children.find((child): child is TocSection => child.kind === "section" && child.id === id);
		if (!next) return null;
		trail.push(next);
		current = next;
	}
	return trail;
}

/** Chemin (identifiants, sans la racine) qui mène à la section `id`, ou `null` si elle n'est pas dans le texte. */
export function pathToSection(root: TocSection, id: string): string[] | null {
	for (const child of root.children) {
		if (child.kind !== "section") continue;
		if (child.id === id) return [id];
		const found = pathToSection(child, id);
		if (found) return [child.id, ...found];
	}
	return null;
}

/** Numéro d'article comparé sans espaces, points ni casse : « L. 121-6 » et « l121-6 » sont le même. */
export const normalizeNumber = (num: string) => num.replace(/[\s.]+/g, "").toUpperCase();

/** Table réduite à ce qui répond au filtre. */
export interface FilteredToc {
	root: TocSection;
	/** Articles gardés. */
	count: number;
	/** Des articles ont été écartés pour ne pas dépasser la limite. */
	truncated: boolean;
}

/**
 * Sections et articles qui répondent à `query` : un article dont le numéro commence par ce qui est tapé, une section dont
 * le titre le contient (elle est gardée avec tout ce qu'elle contient). Au plus `limit` articles sont gardés, pour que
 * l'affichage reste léger sur les grands codes.
 */
export function filterToc(root: TocSection, query: string, limit = 300): FilteredToc {
	const words = plain(query).split(/\s+/).filter(Boolean);
	const number = normalizeNumber(query);
	let count = 0;
	let truncated = false;

	const keepAll = (node: TocNode): TocNode | null => {
		if (node.kind === "article") {
			if (count >= limit) {
				truncated = true;
				return null;
			}
			count++;
			return node;
		}
		const children = node.children.map(keepAll).filter((child): child is TocNode => !!child);
		return children.length ? { ...node, children } : null;
	};

	const walk = (node: TocNode): TocNode | null => {
		if (node.kind === "article") return normalizeNumber(node.num).startsWith(number) ? keepAll(node) : null;
		const title = plain(node.title);
		if (words.length && words.every((word) => title.includes(word))) return keepAll(node);
		const children = node.children.map(walk).filter((child): child is TocNode => !!child);
		return children.length ? { ...node, children } : null;
	};

	const kept = number ? (walk(root) as TocSection | null) : null;
	return { root: kept ?? { ...root, children: [] }, count, truncated };
}

/** Ce que l'on retient de la réponse de `getArticle` pour situer un article dans son texte. */
export interface ArticleContext {
	/** Identifiant du texte qui contient l'article (`LEGITEXT…`), s'il est consolidé. */
	textId?: string;
	textTitle?: string;
	/** Sections qui contiennent l'article, de la plus large à la plus fine (identifiant `LEGISCTA…` et titre). */
	sections: { id: string; title: string }[];
	cid?: string;
	num?: string;
	status?: string;
	versions: ArticleVersion[];
}

/** Contexte d'un article d'après la réponse de `getArticle` ; `null` si elle n'a pas la forme attendue. */
export function parseArticleContext(response: unknown): ArticleContext | null {
	const article = isObject(response) ? (isObject(response.article) ? response.article : response) : null;
	if (!article || !text(article.id)) return null;
	const context = isObject(article.context) ? article.context : {};
	const title = objects(context.titreTxt)[0] ?? objects(article.textTitles)[0];
	const textId = text(title?.cid) || text(title?.id);
	return {
		...(/^LEGITEXT\d{12}$/.test(textId) && { textId }),
		textTitle: cleanTitle(text(title?.titre)) || undefined,
		sections: objects(context.titresTM).flatMap((section) => {
			const id = text(section.id) || text(section.cid);
			const name = cleanTitle(text(section.titre));
			return id && name ? [{ id, title: name }] : [];
		}),
		cid: text(article.cid) || undefined,
		num: text(article.num) || undefined,
		status: text(article.etat) || undefined,
		versions: parseVersions(article),
	};
}
