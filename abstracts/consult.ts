/**
 * Lecture d'un document de tout fond hors jurisprudence (textes, codes, articles, conventions
 * collectives, accords, circulaires) : la route de consultation se choisit d'après le préfixe de
 * l'identifiant, et la réponse est lue sans présumer de sa structure exacte (arbre de sections et
 * d'articles, texte unique, pièce jointe), comme le fait déjà le lecteur de décisions.
 */
import { htmlToMarkdown } from "obsidian";
import { ApiError } from "api/client";
import type { LegifranceApi } from "api/legifrance";
import { idPrefix } from "api/urls";
import { removeTags } from "lib/tools";
import { legalDocument } from "./document";

/** Une route de consultation et le corps de sa requête. */
interface Route {
	path: string;
	params: Record<string, unknown>;
}

/**
 * Routes à essayer, dans l'ordre, pour un identifiant. `search` est le terme recherché (l'API
 * surligne ses occurrences dans le texte) ; un identifiant sans préfixe est une circulaire.
 */
export function routesFor(id: string, search: string, date = Date.now()): Route[] {
	const withSearch = (params: Record<string, unknown>) => (search ? { ...params, searchedString: search } : params);
	switch (idPrefix(id)) {
		case "LEGIARTI":
		case "JORFARTI":
			return [{ path: "/consult/getArticle", params: withSearch({ id }) }];
		case "LEGITEXT":
			return [{ path: "/consult/legiPart", params: withSearch({ textId: id, date }) }];
		case "JORFTEXT":
			return [
				{ path: "/consult/jorf", params: withSearch({ textCid: id }) },
				{ path: "/consult/lawDecree", params: { textId: id, date } },
			];
		case "KALITEXT":
			return [{ path: "/consult/kaliText", params: withSearch({ id }) }];
		case "KALICONT":
			return [{ path: "/consult/kaliCont", params: withSearch({ id }) }];
		case "KALIARTI":
			return [{ path: "/consult/kaliArticle", params: { id } }];
		case "ACCOTEXT":
			return [{ path: "/consult/acco", params: withSearch({ id }) }];
		default:
			return [{ path: "/consult/circulaire", params: withSearch({ id }) }];
	}
}

/** Réponse JSON brute de l'API. */
type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

/** Échappe le texte brut pour l'insérer dans du HTML. */
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Texte brut (retours à la ligne) en paragraphes HTML ; le HTML reçu est conservé tel quel. */
export function toHtml(text: string) {
	if (/<(p|div|br|table|ul|ol|h[1-6])\b/i.test(text)) return text;
	return text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
		.join("");
}

/** Éléments d'un tableau de l'API, dans l'ordre voulu (`intOrdre`) quand il est donné. */
function ordered(value: unknown): Json[] {
	const items = Array.isArray(value) ? value.filter(isObject) : [];
	return items.some((item) => typeof item.intOrdre === "number")
		? [...items].sort((a, b) => Number(a.intOrdre ?? 0) - Number(b.intOrdre ?? 0))
		: items;
}

/** Corps d'un article : HTML (`content`, `texteHtml`) ou texte brut (`texte`). */
const articleBody = (article: Json) => asString(article.content) ?? asString(article.texteHtml) ?? asString(article.texte);

/** HTML d'un article : son numéro (titre) et son texte. */
function articleHtml(article: Json, level: number) {
	const num = asString(article.num);
	const body = articleBody(article);
	return (num ? `<h${level}>Article ${escapeHtml(num)}</h${level}>` : "") + (body ? toHtml(body) : "");
}

/** Profondeur maximale des titres de section (h2 à h5). */
const MAX_HEADING = 5;

/**
 * Assemble le texte d'un nœud : articles directs puis sections, chacune avec son titre, en
 * descendant l'arbre (les titres s'enfoncent d'un niveau à chaque section).
 */
export function assembleHtml(node: Json, level = 2): string {
	let html = "";
	for (const article of ordered(node.articles)) html += articleHtml(article, Math.min(level, MAX_HEADING + 1));
	for (const section of ordered(node.sections)) {
		const title = asString(section.title);
		if (title) html += `<h${Math.min(level, MAX_HEADING)}>${escapeHtml(removeTags(title))}</h${Math.min(level, MAX_HEADING)}>`;
		html += assembleHtml(section, level + 1);
	}
	return html;
}

/** Première chaîne trouvée sous l'une des `keys`, en parcourant l'arbre en largeur. */
function findString(root: unknown, keys: string[]) {
	const queue: unknown[] = [root];
	while (queue.length) {
		const node = queue.shift();
		if (Array.isArray(node)) queue.push(...node);
		else if (isObject(node)) {
			for (const key of keys) {
				const found = asString(node[key]);
				if (found) return found;
			}
			queue.push(...Object.values(node));
		}
	}
	return undefined;
}

/** Date lue dans la réponse (millisecondes ou texte ISO), au format AAAA-MM-JJ. */
function toDate(value: unknown) {
	const date = typeof value === "number" ? new Date(value) : typeof value === "string" ? new Date(value.slice(0, 10)) : undefined;
	return date && !isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}

/** Ce que l'on retient de la réponse de consultation. */
export interface Consultation {
	title?: string;
	date?: string;
	number?: string;
	html: string;
}

/** Corps d'un document : pièce jointe (circulaire, accord), arbre de sections, ou texte unique. */
export function readConsultation(response: Json): Consultation {
	// Les routes enveloppent parfois le document (`article`, `circulaire`, `acco`, `text`).
	const root = ["article", "circulaire", "acco", "text"].map((key) => response[key]).find(isObject) ?? response;

	let html = (asString(root.visa) ? toHtml(asString(root.visa)!) : "") + assembleHtml(root);

	if (!html) {
		const body = articleBody(root);
		if (body) html = toHtml(body);
	}
	if (!html) {
		// Circulaires et accords : le texte est dans la pièce jointe.
		const attachment = findString(root, ["content"]) ?? findString(root, ["texte", "texteHtml"]);
		if (attachment) html = toHtml(attachment);
	}

	const nota = asString(root.nota);
	if (nota) html += `<h3>Nota</h3>${toHtml(nota)}`;

	return {
		title: asString(root.title) ?? asString(root.titre) ?? asString(root.titrefull) ?? findString(root, ["title", "titre"]),
		date: toDate(root.dateTexte ?? root.dateDebut ?? root.date ?? root.jurisDate ?? root.dateDebutVersion),
		number: asString(root.jorfText) ?? asString(root.num) ?? asString(root.nor),
		html,
	};
}

/**
 * Consulte le document sur l'API et en complète la fiche (titre, date, numéro, texte). Les routes
 * sont essayées l'une après l'autre : une requête refusée (400/404) passe à la suivante, avec puis
 * sans le terme recherché.
 *
 * @throws Error si aucune route ne donne le document.
 */
export async function consultDocument(document: legalDocument, search: string, api: LegifranceApi): Promise<legalDocument> {
	let failure: unknown;
	for (const route of routesFor(document.id, search)) {
		const attempts = "searchedString" in route.params ? [route.params, { ...route.params, searchedString: undefined }] : [route.params];
		for (const params of attempts) {
			try {
				const response = await api.consult<Json>(route.path, params);
				applyConsultation(document, readConsultation(response));
				return document;
			} catch (error) {
				if (!(error instanceof ApiError) || ![400, 404].includes(error.status ?? 0)) throw error;
				failure = error;
			}
		}
	}
	throw failure instanceof Error ? failure : new Error("Document introuvable.");
}

/** Reporte une consultation sur la fiche du document. */
function applyConsultation(document: legalDocument, consultation: Consultation) {
	if (consultation.title) document.titre = removeTags(consultation.title);
	if (consultation.date) {
		document.date = consultation.date;
		document.annee = Number(consultation.date.slice(0, 4));
	}
	if (consultation.number) document.numero = consultation.number;
	document.texteIntegralHTML = consultation.html;
	document.texteIntegral = htmlToMarkdown(consultation.html).trim();
}
