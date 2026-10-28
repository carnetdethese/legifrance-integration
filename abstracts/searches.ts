import { legalDocument, statuteArticles } from "abstracts/document";
import { isCaselawOrigin } from "./fonds";
import { dateFormat } from "lib/dateHandler";
import { legifranceUrl } from "api/urls";

/**
 * Les requêtes `POST /search` du formulaire de recherche et leurs réponses. Le corps de la requête est construit par
 * `documentSearchFieldsClass` (`searchHandler.ts`) d'après le fond choisi (`fonds.ts`) ; la réponse est mise en forme
 * en `legalDocument` par `resultatsRechercheClass`.
 */

/** Corps d'une recherche : le fond et la recherche proprement dite. */
export interface rechercheAvStructure {
	/** Code du fond (`CETAT`, `JORF`, `LODA_DATE`…). */
	fond: string;
	recherche: champsRechercheAvancees | requeteDateUnique;
}

/** Requête d'un fond « à une date » : le filtre porte une date de version unique. */
export type requeteDateUnique = Omit<champsRechercheAvancees, "filtres"> & {
	filtres: { facette: string; singleDate: number }[];
};

/** Recherche : champs interrogés, filtres de date, tri et pagination. */
export interface champsRechercheAvancees {
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
		criteres: Criteres[];
		/** Champ interrogé (`ALL`, `TITLE`, `NUM_ARTICLE`…). */
		typeChamp: string;
	}[];
	/** Filtres par période : une facette de date (`DATE_DECISION`, `DATE_SIGNATURE`…) et ses bornes. */
	filtres: {
		facette: string;
		dates: {
			start: dateFormat | string;
			end: dateFormat | string;
		};
	}[];
}

/** Un critère de recherche dans un champ : un mot ou une expression, et la façon de la chercher. */
export interface Criteres {
	/** Opérateur avec le critère voisin (`ET` / `OU`). */
	operateur: string;
	criteres?: Criteres;
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
export interface resultatsRecherche {
	/** Un résultat regroupe des documents (`titles`) qui partagent le même extrait. */
	results: {
		titles?: Title[];
		nature?: string;
		/** Extrait (HTML, termes surlignés). */
		text: string;
		origin: string;
		date?: string;
		sections?: sectionsResultats[];
	}[];
	totalResultNumber: number;
	fond?: string;
}

/** Réponse d'une consultation : le document est sous `text` (textes, décisions) ou `circulaire`. */
export interface reponseDocument {
	text?: legalDocument;
	circulaire?: legalDocument;
}

// Les deux interfaces qui suivent servent à récupérer les différents extraits dans lesquels se trouvent les résultats à la recherche (dans le cas d'un code, texte législatif, etc.). Le premier contient le deuxième
export interface sectionsResultats {
	articles?: statuteArticles[];
	dateVersion: string;
	id: string;
	title: string;
	legalStatus: string;
	extracts: extractsResultats[];
}

export interface extractsResultats {
	id: string;
	legalStatus: string;
	num: number;
	type: string;
	values: string[];
}

/** Transforme la réponse brute de `/search` en liste de documents affichables. */
export class resultatsRechercheClass {
	resultats: resultatsRecherche;

	constructor(data: resultatsRecherche) {
		this.resultats = data;
	}

	listeResultats(): legalDocument[] {
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
				(entree): legalDocument => ({
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
