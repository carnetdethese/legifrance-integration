/**
 * Liens Markdown des textes que renvoie l'API Légifrance. Module pur.
 *
 * L'API écrit les renvois entre articles à l'ancienne, en liens relatifs avec un titre entre guillemets :
 * `[226-13](/affichCodeArticle.do?cidTexte=LEGITEXT…&idArticle=LEGIARTI…&dateTexte=&categorieLien=cid "Code pénal - art. 226-13 (V)")`.
 * Tels quels, ces liens ne mènent nulle part dans Obsidian et, dans un aperçu en texte brut, noient le texte.
 */
import { LEGIFRANCE_URL, legifranceUrl } from "api/urls";

/** `[texte](adresse "titre")` : le titre, entre guillemets, peut contenir des parenthèses. */
const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+"[^"]*")?\s*\)/g;

/** Adresse absolue d'un lien de l'API : anciennes pages `.do` converties vers les pages actuelles. */
export function absoluteLink(href: string) {
	// Une adresse déjà absolue de Légifrance est traitée comme son chemin : `https://…/affichCodeArticle.do?…` se convertit aussi.
	const path = href.startsWith(LEGIFRANCE_URL) ? href.slice(LEGIFRANCE_URL.length) : href;
	const query = new URLSearchParams(path.split("?")[1] ?? "");
	const article = query.get("idArticle");
	if (/^\/affichCodeArticle\.do/.test(path) && article) return legifranceUrl(article);
	const text = query.get("cidTexte");
	if (/^\/affich(?:Texte|CodeArticle)\.do/.test(path) && text) return legifranceUrl(text);
	return path.startsWith("/") ? `${LEGIFRANCE_URL}${path}` : href;
}

/** Ce qu'un lien de Légifrance désigne : un document (`id`), ou une section d'un texte consolidé (`sectionId`, avec `id` = le texte). */
export interface LegifranceTarget {
	id: string;
	sectionId?: string;
}

const DOCUMENT_ID = /\b(?:LEGIARTI|LEGITEXT|LEGISCTA|JORFARTI|JORFTEXT|JURITEXT|CETATEXT|CONSTEXT|JUFITEXT|CNILTEXT|KALITEXT|KALICONT|KALIARTI|ACCOTEXT)\d{12}\b/g;

/** Document que désigne une adresse de Légifrance (page d'un article, d'un texte, d'une décision, d'une section de code) ; `null` pour tout autre lien. */
export function legifranceTarget(href: string): LegifranceTarget | null {
	let url: URL;
	try {
		url = new URL(absoluteLink(href), LEGIFRANCE_URL);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (!/^(?:www\.)?legifrance\.gouv\.fr$/.test(url.hostname)) return null;
	const ids = `${url.pathname}${url.search}`.match(DOCUMENT_ID) ?? [];
	const text = ids.find((id) => id.startsWith("LEGITEXT"));
	const section = ids.find((id) => id.startsWith("LEGISCTA"));
	if (text && section) return { id: text, sectionId: section };
	const document = ids.find((id) => !id.startsWith("LEGISCTA"));
	return document ? { id: document } : null;
}

/** Texte Markdown dont les liens relatifs de Légifrance sont absolus et sans titre. */
export const fixLinks = (markdown: string) => markdown.replace(MARKDOWN_LINK, (_all, text: string, href: string) => `[${text}](${absoluteLink(href)})`);

/** Texte sans liens (seul reste l'intitulé), pour un aperçu en texte brut. */
export const stripLinks = (markdown: string) => markdown.replace(MARKDOWN_LINK, "$1");

/** Ouvre une adresse web dans le navigateur, si c'en est une (http ou https) : jamais `javascript:`, `file:` ni autre schéma. */
export function openExternal(url: string) {
	if (/^https?:\/\//i.test(url)) window.open(url);
}
