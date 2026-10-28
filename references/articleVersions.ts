/**
 * Version d'un article en vigueur le jour d'une décision. Les versions d'un article (identifiant, état,
 * dates) sont relevées sur l'API à la demande, une fois par article, puis gardées en base ; le choix de la
 * version selon la date est dans `versions.ts`.
 */
import type { Lane } from "api/rateLimiter";
import { legifranceUrl } from "api/urls";
import type LegifrancePlugin from "main";
import { LegalRef } from "./parser";
import { fetchArticleText, resolveReference } from "./resolver";
import { storedLegalDocument } from "./stored";
import { ArticleVersion, parseVersions } from "./versions";

/** Identifiant d'un article Légifrance dans une adresse. */
const ARTICLE_ID = /(?:LEGIARTI|JORFARTI|KALIARTI)\d{12}/;

/**
 * Référence d'un article d'après sa clef et son libellé (« Code civil, art. 1240 ») : la base ne garde,
 * pour les articles visés par une décision, que ces deux informations. Les articles du droit de l'Union
 * (clef `eu|…`) n'ont pas de versions sur Légifrance.
 */
export function articleRef(key: string, label: string): LegalRef | null {
	if (!key.startsWith("article|")) return null;
	const at = label.lastIndexOf(", art. ");
	if (at < 0) return null;
	return { key, kind: "article", label, query: "", data: { code: label.slice(0, at), number: label.slice(at + ", art. ".length) } };
}

/**
 * Versions de l'article `key`, relues en base ou, la première fois, demandées à l'API (l'article est
 * d'abord retrouvé s'il n'est cité dans aucune note). Une liste vide veut dire « article introuvable ».
 * @returns `undefined` si l'article n'a pas de versions sur Légifrance (droit de l'Union, libellé inconnu).
 * @throws ApiError si l'API refuse la requête (identifiants, quota, service).
 */
export async function loadArticleVersions(plugin: LegifrancePlugin, key: string, label: string, lane?: Lane): Promise<ArticleVersion[] | undefined> {
	const known = plugin.references.articleVersions(key);
	if (known) return known;
	const ref = articleRef(key, label);
	if (!ref) return undefined;

	const link = plugin.references.linkFor(ref) ?? (await resolveReference(plugin.agent, ref, undefined, lane, plugin.settings.ficheUseRgd));
	const id = link && ARTICLE_ID.exec(link.url)?.[0];
	if (!id) {
		plugin.references.saveArticleVersions(key, []);
		return [];
	}
	const response = await plugin.agent.dilaApi.fetch<object>({ path: "/consult/getArticle", params: { id }, lane });
	const versions = parseVersions(response);
	plugin.references.saveArticleVersions(key, versions);
	return versions;
}

/**
 * Rend lisible une version d'un article (`openStoredDocument`) : son texte est demandé à l'API s'il n'est
 * pas déjà en base.
 * @returns `false` si le texte n'a pas pu être obtenu.
 */
export async function storeArticleVersion(plugin: LegifrancePlugin, version: ArticleVersion, label: string, lane?: Lane) {
	if (storedLegalDocument(plugin, version.id)) return true;
	const text = await fetchArticleText(plugin.agent, version.id, lane);
	if (!text) return false;
	const period = `${version.start ?? "origine"} → ${version.end ?? "aujourd'hui"}`;
	plugin.references.saveDocument({
		id: version.id,
		origin: "LEGI",
		title: `${label} (version du ${period})`,
		date: version.start,
		number: null,
		court: null,
		formation: null,
		solution: null,
		url: legifranceUrl(version.id),
		text_html: null,
		text_markdown: text,
	});
	return true;
}
