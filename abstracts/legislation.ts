/**
 * Lecture des codes et des textes consolidés : table des matières, contexte d'un article, liste des codes. Les réponses
 * (volumineuses : celle du Code pénal fait plusieurs centaines de Ko) ne sont gardées qu'en mémoire, le temps de la
 * session, jamais dans la base ni dans le coffre. Lecture du contenu dans `toc.ts`.
 */
import type { LegifranceApi } from "api/legifrance";
import { legifranceUrl } from "api/urls";
import { cleanTitle } from "lib/tools";
import { assembleHtml, readRoot } from "./consult";
import type { LegalDocument } from "./document";
import { ArticleContext, Toc, TocArticle, parseArticleContext, parseToc } from "./toc";

/** Identifiant d'un texte consolidé : seul ce que l'on a vérifié part dans une requête (l'état d'un onglet restauré n'est pas sûr). */
export const isTextId = (id: unknown): id is string => typeof id === "string" && /^LEGITEXT\d{12}$/.test(id);
export const isArticleId = (id: unknown): id is string => typeof id === "string" && /^LEGIARTI\d{12}$/.test(id);

/** Petit cache en mémoire : les `limit` dernières entrées (les plus anciennes sortent d'abord). */
function memo<T>(limit: number) {
	const entries = new Map<string, T>();
	return {
		get: (key: string) => entries.get(key),
		set(key: string, value: T) {
			entries.delete(key);
			entries.set(key, value);
			if (entries.size > limit) entries.delete(entries.keys().next().value as string);
		},
	};
}

const tocs = memo<Toc>(4);
const contexts = memo<ArticleContext | null>(60);

/** AAAA-MM-JJ du jour (heure locale). */
export const todayIso = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * Table des matières d'un texte consolidé à un jour donné (aujourd'hui par défaut).
 * @throws Error si l'identifiant ou la date sont invalides, ou si la réponse est illisible ; ApiError si l'API refuse.
 */
export async function loadToc(api: LegifranceApi, textId: string, day = todayIso()): Promise<Toc> {
	if (!isTextId(textId)) throw new Error("Identifiant de texte invalide.");
	const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T12:00:00Z`) : NaN;
	if (Number.isNaN(date)) throw new Error("Date invalide.");
	const key = `${textId}|${day}`;
	const known = tocs.get(key);
	if (known) return known;
	const toc = parseToc(await api.consultTableOfContents(textId, date));
	if (!toc) throw new Error("Table des matières illisible.");
	tocs.set(key, toc);
	return toc;
}

/** Retient la réponse de `getArticle` déjà obtenue par la lecture d'un article : le contexte n'est pas redemandé. */
export function rememberArticleResponse(id: string, response: unknown) {
	contexts.set(id, parseArticleContext(response));
}

/** Contexte d'un article (texte, chemin, versions), `null` s'il est introuvable. */
export async function loadArticleContext(api: LegifranceApi, id: string): Promise<ArticleContext | null> {
	if (!isArticleId(id)) return null;
	const known = contexts.get(id);
	if (known !== undefined) return known;
	const context = parseArticleContext(await api.consultArticle(id));
	contexts.set(id, context);
	return context;
}

/** Code que propose la liste. */
export interface CodeEntry {
	id: string;
	title: string;
}

let codes: CodeEntry[] | undefined;

/** Codes en vigueur (une requête, gardée pour la session). */
export async function loadCodes(api: LegifranceApi): Promise<CodeEntry[]> {
	if (codes) return codes;
	const response = await api.listCodes<{ results?: { id?: string; titre?: string }[] }>();
	const list = (response.results ?? []).flatMap((entry) => (isTextId(entry.id) && entry.titre ? [{ id: entry.id, title: entry.titre }] : []));
	if (list.length > 0) codes = list;
	return list;
}

/** Document que le lecteur sait ouvrir pour un article de la table des matières. */
export function articleDocument(textTitle: string, article: Pick<TocArticle, "id" | "num">): LegalDocument {
	return {
		id: article.id,
		fond: "LEGI",
		origin: "LEGI",
		type: "document",
		titre: [textTitle, article.num && `article ${article.num}`].filter(Boolean).join(" — ") || "Article",
		texte: "",
		lien: legifranceUrl(article.id),
		titreNote: "",
	};
}

/** Au-delà, une section n'est pas lue d'un seul tenant : la page serait trop longue (ouvrir un titre ou un chapitre). */
export const MAX_READ_ARTICLES = 600;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** La section `id` dans l'arbre d'un texte, en profondeur d'abord. */
function findSection(node: Json, id: string): Json | undefined {
	for (const section of list(node.sections)) {
		if (section.id === id) return section;
		const found = findSection(section, id);
		if (found) return found;
	}
	return undefined;
}

const countArticles = (node: Json): number => list(node.articles).length + list(node.sections).reduce((total, section) => total + countArticles(section), 0);

/** Réponse de `legiPart` (tout le texte avec ses articles : lourde pour un grand code) : la dernière seulement est gardée. */
const parts = memo<unknown>(1);

/** Texte lu d'un seul tenant : titre, HTML (intertitres et articles dans l'ordre) et nombre d'articles. */
export interface SectionText {
	title: string;
	html: string;
	articles: number;
}

/**
 * Tous les articles d'une section (ou du texte entier si `sectionId` est vide) à un jour donné, en HTML. Une seule requête
 * (`legiPart` rend le texte entier : les sections suivantes du même code ne coûtent rien tant que la date ne change pas).
 * @throws Error si la section n'existe pas à cette date, ou compte plus de `MAX_READ_ARTICLES` articles.
 */
export async function loadSectionText(api: LegifranceApi, textId: string, sectionId?: string, day = todayIso()): Promise<SectionText> {
	if (!isTextId(textId)) throw new Error("Identifiant de texte invalide.");
	const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T12:00:00Z`) : NaN;
	if (Number.isNaN(date)) throw new Error("Date invalide.");
	const key = `${textId}|${day}`;
	let response = parts.get(key);
	if (!response) {
		response = await api.consult("/consult/legiPart", { textId, date });
		parts.set(key, response);
	}
	if (!isObject(response)) throw new Error("Texte illisible.");
	const root = readRoot(response);
	const node = sectionId ? findSection(root, sectionId) : root;
	if (!node) throw new Error("Cette section n'existe pas à cette date.");
	const articles = countArticles(node);
	if (articles > MAX_READ_ARTICLES) throw new Error(`Section trop vaste (${articles} articles) : ouvrez un titre ou un chapitre.`);
	const title = cleanTitle(typeof node.title === "string" ? node.title : "") || "Texte";
	// Le titre de la section ouvre la page ; ce qu'elle contient descend d'un niveau.
	const html = sectionId ? `<h2>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</h2>${assembleHtml(node, 3)}` : assembleHtml(node, 2);
	return { title, html, articles };
}
