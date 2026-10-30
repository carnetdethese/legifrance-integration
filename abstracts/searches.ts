import { LegalDocument, StatuteArticle } from "abstracts/document";
import { isCaselawOrigin } from "./fonds";
import { DateFormat } from "lib/dateHandler";
import { baseId, legifranceUrl } from "api/urls";

/**
 * Les requêtes `POST /search` du formulaire de recherche et leurs réponses. Le corps de la requête est construit par
 * `DocumentSearch` (`searchHandler.ts`) d'après le fond choisi (`fonds.ts`) ; la réponse est mise en forme
 * en `LegalDocument` par `SearchResults`.
 */

/** Corps d'une recherche : le fond et la recherche proprement dite. */
export interface SearchRequest {
	/** Code du fond (`CETAT`, `JORF`, `LODA_DATE`…). */
	fond: string;
	recherche: AdvancedSearch | SingleDateSearch;
}

/** Requête d'un fond « à une date » : le filtre porte une date de version unique. */
export type SingleDateSearch = Omit<AdvancedSearch, "filtres"> & {
	filtres: { facette: string; singleDate: number }[];
};

/** Recherche : champs interrogés, filtres de date, tri et pagination. */
export interface AdvancedSearch {
	/** Opérateur entre les champs (`ET` / `OU`). */
	operateur?: string;
	pageSize: number;
	/** Critère de tri (`PERTINENCE`, `DATE_DESC`… : propre au fond). */
	sort: string;
	typePagination: string;
	pageNumber: number;
	/** Un champ de l'API (titre, texte, numéro…) et les critères qui s'y appliquent. */
	champs: {
		operateur?: string;
		criteres: SearchCriterion[];
		/** Champ interrogé (`ALL`, `TITLE`, `NUM_ARTICLE`…). */
		typeChamp: string;
	}[];
	/** Filtres par période : une facette de date (`DATE_DECISION`, `DATE_SIGNATURE`…) et ses bornes. */
	filtres: {
		facette: string;
		dates: {
			start: DateFormat | string;
			end: DateFormat | string;
		};
	}[];
}

/** Un critère de recherche dans un champ : un mot ou une expression, et la façon de la chercher. */
export interface SearchCriterion {
	/** Opérateur avec le critère voisin (`ET` / `OU`). */
	operateur: string;
	criteres?: SearchCriterion;
	valeur: string;
	/** Écart maximal entre les mots (recherche par proximité). */
	proximite: number;
	/** `EXACTE`, `UN_DES_MOTS`, `TOUS_LES_MOTS_DANS_UN_CHAMP`… (voir `api/constants.ts`). */
	typeRecherche: string;
}

/** Entrée d'un document dans un résultat de recherche. */
interface Title {
	id?: string | null;
	cid?: string | null;
	title: string;
}

/** Réponse de `POST /search`. */
export interface SearchResultsResponse {
	/** Un résultat regroupe des documents (`titles`) qui partagent le même extrait. */
	results: {
		titles?: Title[];
		nature?: string;
		/** Extrait (HTML, termes surlignés). */
		text: string;
		origin: string;
		date?: string;
		/** État juridique du texte (`VIGUEUR`, `ABROGE`…). */
		etat?: string;
		sections?: ResultSection[];
	}[];
	totalResultNumber: number;
	/** Effectifs par facette (nature, état, code…) : de quoi affiner la recherche. */
	facets?: { facetElem: string; values?: Record<string, number> }[];
	fond?: string;
}

/** Réponse d'une consultation : le document est sous `text` (textes, décisions) ou `circulaire`. */
export interface DocumentResponse {
	text?: LegalDocument;
	circulaire?: LegalDocument;
}

// Les deux interfaces qui suivent servent à récupérer les différents extraits dans lesquels se trouvent les résultats à la recherche (dans le cas d'un code, texte législatif, etc.). Le premier contient le deuxième
export interface ResultSection {
	articles?: StatuteArticle[];
	dateVersion: string;
	id: string;
	title: string;
	legalStatus: string;
	extracts: ResultExtract[];
}

export interface ResultExtract {
	id: string;
	/** Rubrique où le terme a été trouvé quand ce n'est pas un article (« Visas », « Travaux préparatoires »). */
	searchFieldName?: string;
	/** Début de validité de cette version de l'article (ISO). */
	dateDebut?: string;
	/** Nombre d'autres versions du même article, regroupées sous celle-ci (ajouté par `SearchResults`). */
	otherVersions?: number;
	legalStatus: string;
	num: number;
	type: string;
	values: string[];
}

const IN_FORCE = ["VIGUEUR", "VIGUEUR_DIFF"];

/** Version à garder parmi celles d'un même article : celle en vigueur, sinon la plus récente. */
function betterVersion(a: ResultExtract, b: ResultExtract) {
	const force = (e: ResultExtract) => (IN_FORCE.includes(e.legalStatus) ? 1 : 0);
	if (force(a) !== force(b)) return force(a) > force(b) ? a : b;
	return (a.dateDebut ?? "") >= (b.dateDebut ?? "") ? a : b;
}

/**
 * Sections d'un résultat sans redite : un article qui y figure en plusieurs versions (la recherche dans « tous les états »
 * les renvoie toutes) n'apparaît qu'une fois, sous sa version en vigueur ou la plus récente, avec le nombre des autres.
 */
export function mergeSections(sections: ResultSection[]): ResultSection[] {
	const best = new Map<string, ResultExtract>();
	const versions = new Map<string, Set<string>>();
	const keyOf = (extract: ResultExtract) => (extract.type === "articles" && extract.num ? `articles:${extract.num}` : `${extract.type}:${extract.id}`);
	for (const section of sections)
		for (const extract of section.extracts ?? []) {
			const key = keyOf(extract);
			const known = best.get(key);
			if (!known) best.set(key, extract);
			else if (known.id !== extract.id) best.set(key, betterVersion(known, extract));
			versions.set(key, (versions.get(key) ?? new Set()).add(extract.id));
		}
	const placed = new Set<string>();
	const merged = new Map<string, ResultSection>();
	for (const section of sections) {
		const extracts: ResultExtract[] = [];
		for (const extract of section.extracts ?? []) {
			const key = keyOf(extract);
			if (placed.has(key)) continue;
			placed.add(key);
			const chosen = best.get(key)!;
			extracts.push({ ...chosen, otherVersions: versions.get(key)!.size - 1 || undefined });
		}
		if (extracts.length === 0) continue;
		const target = merged.get(section.id);
		if (target) target.extracts.push(...extracts);
		else merged.set(section.id, { ...section, extracts });
	}
	return [...merged.values()];
}

/** Transforme la réponse brute de `/search` en liste de documents affichables. */
export class SearchResults {
	resultats: SearchResultsResponse;

	constructor(data: SearchResultsResponse) {
		this.resultats = data;
	}

	listeResultats(): LegalDocument[] {
		if (!this.resultats?.results) {
			console.error("Réponse invalide ou manquante à la requête.");
			return [];
		}

		// Un même texte peut revenir plusieurs fois (une fois par version consultée) : ses extraits sont réunis.
		const documents = new Map<string, LegalDocument>();
		for (const result of this.resultats.results) {
			const origine = result.origin;
			const type = isCaselawOrigin(origine) ? "jurisprudence" : "document";

			// Un résultat peut regrouper plusieurs documents (`titles`) partageant le même extrait.
			// Les titres de sections trouvées (`LEGISCTA…`) accompagnent celui du texte : ce ne sont pas des documents à ouvrir.
			const titles = Array.isArray(result.titles) ? result.titles : [];
			const documentsOnly = titles.filter((entree) => !/^(?:LEGISCTA|JORFSCTA)/.test(entree.id ?? ""));
			for (const entree of documentsOnly.length > 0 ? documentsOnly : titles) {
				// Certains résultats (lois anciennes) n'ont pas d'identifiant de version, seulement l'identifiant du texte.
				const id = baseId(entree.id ?? entree.cid);
				const key = id || entree.title;
				const known = documents.get(key);
				if (known) {
					if (result.sections) known.sections = [...(known.sections ?? []), ...result.sections];
					continue;
				}
				documents.set(key, {
					fond: origine,
					type,
					titre: entree.title,
					id,
					texte: result.text,
					lien: legifranceUrl(id, result.nature),
					origin: origine,
					nature: result.nature ?? "",
					date: result.date,
					status: result.etat,
					cid: entree.cid ?? undefined,
					sections: result.sections,
					titreNote: "",
				});
			}
		}
		return [...documents.values()].map((document) => (document.sections ? { ...document, sections: mergeSections(document.sections) } : document));
	}
}
