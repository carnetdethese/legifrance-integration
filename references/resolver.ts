/**
 * Retrouve sur Légifrance (via l'API PISTE) le document d'une référence. Les
 * requêtes (fonds, champs, filtres) et la lecture des réponses sont celles de
 * Marginalia, vérifiées sur le service : un fond ou un champ erroné donne un
 * 400, et une recherche approchée renvoie parfois un autre document, d'où le
 * contrôle du numéro dans le titre.
 */
import { htmlToMarkdown } from "obsidian";
import { ApiError } from "api/client";
import { agentSearch } from "api/utilities";
import { findAriaDecision } from "./ariane";
import { LEGIFRANCE_TEXTS } from "./codes";
import { FULL_DATE_PATTERN, isoDay, matchesDate, parseCitedDate, plain, significantWords, titleDates } from "./dates";
import { LegalRef } from "./parser";

const BASE_URL = "https://www.legifrance.gouv.fr";

/** Longueur maximale du texte d'un article conservé dans le cache. */
const MAX_TEXT_LENGTH = 20000;

/** Document Légifrance retrouvé pour une référence. */
export interface ResolvedLink {
	url: string;
	/** Titre du document trouvé, affiché pour que l'utilisateur vérifie la correspondance. */
	titre: string;
	/** Texte (Markdown) d'un article, pour l'aperçu. */
	texte?: string;
}

/** Requête à l'API : chemin et corps JSON. */
interface Query {
	path: string;
	body: object;
}

/** Réponse de `/search`, réduite à ce que l'on lit. */
interface SearchResponse {
	totalResultNumber?: number;
	results?: SearchResult[];
}

interface SearchResult {
	text?: string;
	titles?: { id?: string; cid?: string; title?: string }[];
	sections?: { extracts?: { id?: string; num?: string; legalStatus?: string; values?: string[] }[] }[];
}

/** Ce que l'on tire d'une réponse : adresse, titre, identifiant d'article éventuel. */
type Match = { url: string; titre: string; articleId?: string };

/** Requêtes à essayer dans l'ordre, et lecture de leurs réponses. */
interface Resolution {
	queries: Query[];
	read: (response: unknown) => Match | null;
	/** Résumé lisible d'une réponse, pour le journal de débogage. */
	describe?: (response: unknown) => string;
	/** Recherche de dernier recours (autre service), si aucune requête n'a abouti. */
	fallback?: () => Promise<Match | null>;
}

/** Fond, page Légifrance, préfixe d'identifiant et champs essayés (dans l'ordre) par juridiction. */
const COURTS: Record<string, { fond: string; page: string; prefix: string; fields: [string, "number" | "bare"][] }> = {
	cassation: { fond: "JURI", page: "juri", prefix: "JURITEXT", fields: [["NUM_AFFAIRE", "number"], ["ALL", "number"]] },
	ce: { fond: "CETAT", page: "ceta", prefix: "CETATEXT", fields: [["NUM_AFFAIRE", "number"], ["NUM_DEC", "number"], ["ALL", "number"]] },
	// Le fond du Conseil constitutionnel n'indexe pas le suffixe (« DC ») du numéro.
	cc: { fond: "CONSTIT", page: "cons", prefix: "CONSTEXT", fields: [["NUM_DEC", "number"], ["NUM_DEC", "bare"], ["ALL", "number"]] },
};

// Le Tribunal des conflits est jugé avec le Conseil d'État (même fond, mêmes pages).
COURTS.tc = COURTS.ce;

/** Nature d'un texte → valeur de la facette `NATURE`. */
const LAW_NATURES: Record<string, string> = {
	loi: "LOI",
	"loi organique": "LOI_ORGANIQUE",
	"loi constitutionnelle": "LOI_CONSTIT",
	"loi de finances": "LOI",
	ordonnance: "ORDONNANCE",
	décret: "DECRET",
	"décret-loi": "DECRET_LOI",
	arrêté: "ARRETE",
};

function field(typeChamp: string, valeur: string) {
	return { typeChamp, operateur: "ET", criteres: [{ typeRecherche: "EXACTE", valeur, operateur: "ET" }] };
}

/** Requête `POST /search` sur un fond. */
function searchQuery(fond: string, champs: object[], filtres: object[] = []): Query {
	return {
		path: "/search",
		body: {
			fond,
			recherche: { champs, filtres, pageNumber: 1, pageSize: 5, operateur: "ET", sort: "PERTINENCE", typePagination: "DEFAUT" },
		},
	};
}

/** Résumé générique d'une réponse de `/search` : nombre de résultats et premiers titres. */
function describeSearch(response: SearchResponse) {
	const results = response.results ?? [];
	const titles = results.flatMap((r) => (r.titles ?? []).map((t) => t.title ?? t.id ?? "?")).slice(0, 3);
	return `${results.length} résultat(s)${titles.length ? ` : ${titles.join(" | ")}` : ""}`;
}

/** Numéro d'article sans point ni espace : « L. 121-1 » et « L121-1 » se comparent égaux. */
const compact = (number: string) => number.replace(/[.\s]/g, "");

/** Le titre d'une décision porte-t-il ce numéro ? (écarte les résultats approchés) */
const cites = (title: string, number: string) =>
	new RegExp(`(?<![\\w.-])${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(title.replace(/\s+/g, " "));

/** Le résultat mentionne-t-il toutes les parties citées (titre, texte ou extraits surlignés) ? */
function mentionsParties(result: SearchResult, name: string) {
	const extracts = (result.sections ?? []).flatMap((s) => (s.extracts ?? []).flatMap((e) => e.values ?? []));
	const haystack = plain([result.text ?? "", ...extracts, ...(result.titles ?? []).map((t) => t.title ?? "")].join(" "));
	return significantWords(name).every((word) => haystack.includes(word));
}

/**
 * Décision citée par ses parties et sa date : recherche plein texte du nom (d'abord limitée à la
 * date si elle est complète) ; un résultat n'est retenu que si la date de son titre est celle de la
 * citation et s'il mentionne les parties. Au Conseil d'État, ArianeWeb prend le relais : Légifrance
 * n'a pas les décisions anciennes.
 */
function buildNamed(ref: LegalRef): Resolution | null {
	const court = COURTS[ref.data.court];
	const cited = parseCitedDate(ref.data.decided);
	if (!court || !cited) return null;

	const fields = [field("ALL", ref.data.name)];
	const day = isoDay(cited);
	const queries = [
		...(day ? [searchQuery(court.fond, fields, [{ facette: "DATE_DECISION", dates: { start: day, end: day } }])] : []),
		searchQuery(court.fond, fields),
	];
	return {
		queries,
		read: (raw) => {
			const response = raw as SearchResponse;
			for (const result of response.results ?? []) {
				for (const title of result.titles ?? []) {
					if (
						title.id?.startsWith(court.prefix) &&
						titleDates(title.title ?? "").some((d) => matchesDate(cited, d)) &&
						mentionsParties(result, ref.data.name)
					) {
						return { url: `${BASE_URL}/${court.page}/id/${title.id}`, titre: title.title ?? ref.label };
					}
				}
			}
			return null;
		},
		fallback: ["ce", "tc"].includes(ref.data.court) ? () => findAriaDecision(ref.data.court, ref.data.name, cited) : undefined,
	};
}

/**
 * Loi, ordonnance ou décret cité par sa seule date (« la loi du 6 janvier 1978 ») : recherche
 * filtrée sur la nature, d'abord limitée à la date de signature, puis en texte libre ; le titre du
 * résultat doit commencer par la nature et porter la date citée.
 */
function buildDated(ref: LegalRef): Resolution | null {
	const cited = parseCitedDate(ref.data.date);
	if (!cited?.day) return null;
	const nature = LAW_NATURES[ref.data.nature];
	const natureFilter = nature ? [{ facette: "NATURE", valeurs: [nature] }] : [];
	const day = isoDay(cited)!;
	const text = ref.data.date.match(new RegExp(FULL_DATE_PATTERN))?.[0] ?? ref.data.date;
	return {
		queries: [
			searchQuery("LODA_DATE", [field("ALL", `${ref.data.nature} du ${text}`)], [...natureFilter, { facette: "DATE_SIGNATURE", dates: { start: day, end: day } }]),
			searchQuery("LODA_DATE", [field("ALL", `du ${text}`)], natureFilter),
		],
		read: (raw) => {
			const response = raw as SearchResponse;
			for (const result of response.results ?? []) {
				for (const title of result.titles ?? []) {
					const label = title.title ?? "";
					const id = title.cid || title.id;
					if (id && plain(label).startsWith(ref.data.nature) && titleDates(label).some((d) => matchesDate(cited, d))) {
						return { url: `${BASE_URL}/loda/id/${id}`, titre: label };
					}
				}
			}
			return null;
		},
	};
}

/** Identifiant `LEGIARTI` de l'article `number` dans l'arbre de sections et d'articles d'un texte consolidé. */
function findArticleId(node: unknown, number: string): string | null {
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findArticleId(item, number);
			if (found) return found;
		}
		return null;
	}
	if (!node || typeof node !== "object") return null;
	const record = node as Record<string, unknown>;
	const id = typeof record.id === "string" ? record.id : "";
	const status = record.etat ?? record.legalStatus;
	if (id.startsWith("LEGIARTI") && compact(String(record.num ?? "")) === number && [undefined, null, "VIGUEUR", "VIGUEUR_DIFF"].includes(status as string)) {
		return id;
	}
	return findArticleId(Object.values(record), number);
}

/**
 * Article d'un texte qui n'est pas un code (Constitution, Déclaration de 1789) : le texte entier
 * est consulté, dont on tire l'article. Le titre reçu doit être celui attendu.
 */
function buildTextArticle(ref: LegalRef): Resolution {
	const [path, textId, expectedTitle] = LEGIFRANCE_TEXTS[ref.data.code];
	const number = compact(ref.data.number);
	return {
		queries: [{ path, body: { textId, date: Date.now() } }],
		read: (raw) => {
			const title = String((raw as { title?: string }).title ?? "");
			if (!title.toLowerCase().includes(expectedTitle.toLowerCase())) return null;
			const id = findArticleId(raw, number);
			return id ? { url: `${BASE_URL}/loda/article_lc/${id}`, titre: ref.label, articleId: id } : null;
		},
	};
}

function build(ref: LegalRef): Resolution | null {
	const { data } = ref;

	if (ref.kind === "article") {
		if (LEGIFRANCE_TEXTS[data.code]) return buildTextArticle(ref);
		if (!data.code.startsWith("Code ")) return null;
		const number = compact(data.number);
		const codeFilter = { facette: "NOM_CODE", valeurs: [data.code] };
		/** Extraits (articles) de la réponse, à plat. */
		const extractsOf = (response: SearchResponse) =>
			(response.results ?? []).flatMap((r) => (r.sections ?? []).flatMap((sec) => sec.extracts ?? []));
		/** Articles de la réponse : extraits (cas habituel) ou titres `LEGIARTI…` (autre forme de réponse). */
		const articlesOf = (response: SearchResponse) => [
			...extractsOf(response),
			...(response.results ?? []).flatMap((r) =>
				(r.titles ?? [])
					.filter((t) => t.id?.startsWith("LEGIARTI"))
					.map((t) => ({ id: t.id, num: /(\d[\w.-]*)\s*$/.exec(t.title ?? "")?.[1] ?? "", legalStatus: undefined as string | undefined }))
			),
		];
		return {
			queries: [
				// 1. Version en vigueur aujourd'hui (requête vérifiée par Marginalia).
				searchQuery("CODE_DATE", [field("NUM_ARTICLE", number)], [codeFilter, { facette: "DATE_VERSION", singleDate: Date.now() }]),
				// 2. Sans filtre de date, au cas où celui-ci écarte l'article.
				searchQuery("CODE_DATE", [field("NUM_ARTICLE", number)], [codeFilter]),
				// 3. Recherche libre du numéro dans le code, si le champ NUM_ARTICLE ne donne rien.
				searchQuery("CODE_DATE", [field("ALL", number)], [codeFilter]),
			],
			// On préfère la version en vigueur ; à défaut, n'importe quelle version (article abrogé, toujours citable).
			read: (raw) => {
				const candidates = articlesOf(raw as SearchResponse).filter(
					(e) => compact(e.num ?? "") === number && e.id?.startsWith("LEGIARTI")
				);
				const best = candidates.find((e) => !e.legalStatus || e.legalStatus === "VIGUEUR") ?? candidates[0];
				return best ? { url: `${BASE_URL}/codes/article_lc/${best.id}`, titre: ref.label, articleId: best.id } : null;
			},
			describe: (raw) => {
				const response = raw as SearchResponse;
				const articles = articlesOf(response);
				const seen = articles.slice(0, 8).map((e) => `${e.num || "?"} [${e.legalStatus ?? "?"}]`).join(", ");
				const codes = (response.results ?? []).flatMap((r) => (r.titles ?? []).map((t) => t.title ?? t.id ?? "?")).slice(0, 3).join(" | ");
				return `${response.results?.length ?? 0} résultat(s) (total API : ${response.totalResultNumber ?? "?"}), ${articles.length} article(s) lisible(s)${seen ? ` : ${seen}` : ""}${codes ? ` ; titres : ${codes}` : ""}`;
			},
		};
	}

	if (ref.kind === "texte") {
		if (!data.number) return buildDated(ref);
		const nature = LAW_NATURES[data.nature];
		return {
			queries: [searchQuery("LODA_DATE", [field("NUM", data.number)], nature ? [{ facette: "NATURE", valeurs: [nature] }] : [])],
			read: (raw) => {
			const response = raw as SearchResponse;
				for (const result of response.results ?? []) {
					for (const title of result.titles ?? []) {
						const id = title.cid || title.id;
						if (id) return { url: `${BASE_URL}/loda/id/${id}`, titre: title.title ?? ref.label };
					}
				}
				return null;
			},
		};
	}

	if (ref.kind === "decision") {
		if (!data.number) return buildNamed(ref);
		const court = COURTS[data.court];
		if (!court) return null;
		const values = { number: data.number, bare: data.number.split(" ")[0] };
		return {
			queries: court.fields.map(([typeChamp, value]) => searchQuery(court.fond, [field(typeChamp, values[value])])),
			read: (raw) => {
			const response = raw as SearchResponse;
				for (const result of response.results ?? []) {
					for (const title of result.titles ?? []) {
						if (title.id?.startsWith(court.prefix) && cites(title.title ?? "", data.number)) {
							return { url: `${BASE_URL}/${court.page}/id/${title.id}`, titre: title.title ?? ref.label };
						}
					}
				}
				return null;
			},
		};
	}
	return null;
}

/** L'API peut-elle retrouver cette référence ? (Pas les identifiants, déjà directs.) */
export const canResolve = (ref: LegalRef) => !ref.url && build(ref) !== null;

/** Texte Markdown d'un article (`POST /consult/getArticle`), borné. */
async function fetchArticleText(agent: agentSearch, id: string) {
	const response = await agent.dilaApi.fetch<{ article?: ArticleBody } & ArticleBody>({
		path: "/consult/getArticle",
		params: { id },
	});
	const article = response.article ?? response;
	const html = article.texteHtml ?? article.texte;
	return html ? htmlToMarkdown(html).trim().slice(0, MAX_TEXT_LENGTH) : undefined;
}

interface ArticleBody {
	texteHtml?: string;
	texte?: string;
}

/**
 * Retrouve via l'API le document de `ref` (premières requêtes qui aboutissent),
 * avec le texte de l'article le cas échéant.
 *
 * @returns `null` si la référence n'est pas résoluble ou sans correspondance.
 * @throws ApiError si les identifiants sont refusés, le quota dépassé ou le service injoignable.
 */
export async function resolveReference(
	agent: agentSearch,
	ref: LegalRef,
	trace: (line: string) => void = () => undefined
): Promise<ResolvedLink | null> {
	const resolution = build(ref);
	if (!resolution) {
		trace("Référence non résoluble par l'API.");
		return null;
	}

	let match: Match | null = null;
	let failure: ApiError | undefined;
	let answered = false;
	for (const query of resolution.queries) {
		trace(`→ POST ${query.path} ${JSON.stringify(query.body)}`);
		try {
			const response = await agent.dilaApi.fetch<SearchResponse>({ path: query.path, params: query.body });
			match = resolution.read(response);
			answered = true;
			trace(`← ${resolution.describe?.(response) ?? describeSearch(response)}${match ? " → correspondance trouvée" : " → aucune correspondance"}`);
		} catch (error) {
			trace(`← erreur : ${error instanceof Error ? error.message : String(error)}`);
			// 400 (requête refusée) ou 404 : on passe à la requête suivante.
			if (!(error instanceof ApiError) || ![400, 404].includes(error.status ?? 0)) throw error;
			failure = error;
		}
		if (match) break;
	}
	// Aucune requête n'a abouti : service de dernier recours (ArianeWeb), jamais bloquant.
	if (!match && resolution.fallback) {
		trace("→ recours à ArianeWeb");
		match = await resolution.fallback().catch((error) => {
			trace(`← erreur ArianeWeb : ${error instanceof Error ? error.message : String(error)}`);
			return null;
		});
		if (match) trace(`← ArianeWeb : ${match.titre}`);
	}
	if (!match) {
		if (failure && !answered) throw failure;
		return null;
	}

	const texte = match.articleId ? await fetchArticleText(agent, match.articleId).catch(() => undefined) : undefined;
	trace(`✔ ${match.url}${texte ? " (texte récupéré)" : match.articleId ? " (texte de l'article indisponible)" : ""}`);
	return { url: match.url, titre: match.titre, texte };
}
