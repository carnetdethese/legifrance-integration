import { LegalDocument, StatuteArticle } from "abstracts/document";
import { isCaselawOrigin } from "./fonds";
import { DateFormat } from "lib/dateHandler";
import { legifranceUrl } from "api/urls";

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
	id: string;
	cid?: string;
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
		sections?: ResultSection[];
	}[];
	totalResultNumber: number;
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
	legalStatus: string;
	num: number;
	type: string;
	values: string[];
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

		return this.resultats.results.flatMap((result) => {
			const origine = result.origin;
			const type = isCaselawOrigin(origine)
				? "jurisprudence"
				: "document";

			// Un résultat peut regrouper plusieurs documents (`titles`) partageant le même extrait.
			return (Array.isArray(result.titles) ? result.titles : []).map(
				(entree): LegalDocument => ({
					fond: origine,
					type,
					titre: entree.title,
					id: entree.id,
					texte: result.text,
					lien: legifranceUrl(entree.id, result.nature),
					origin: origine,
					nature: result.nature ?? "",
					date: result.date,
					cid: entree.cid,
					sections: result.sections,
					titreNote: "",
				})
			);
		});
	}
}
