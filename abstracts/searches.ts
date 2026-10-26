import { legalDocument, statuteArticles } from "abstracts/document";
import { isCaselawOrigin } from "./fonds";
import { dateFormat } from "lib/dateHandler";
import { findLink } from "./decisions";

export interface rechercheAvStructure {
	// Base
	recherche: champsRechercheAvancees | requeteDateUnique;
	fond: string;
}

/** Requête d'un fond « à une date » : le filtre porte une date de version unique. */
export type requeteDateUnique = Omit<champsRechercheAvancees, "filtres"> & {
	filtres: { facette: string; singleDate: number }[];
};

export interface champsRechercheAvancees {
	operateur?: string;
	pageSize: number;
	sort: string;
	typePagination: string;
	pageNumber: number;
	champs: {
		operateur?: string;
		criteres: Criteres[];
		typeChamp: string;
	}[];
	filtres: {
		facette: string;
		dates: {
			start: dateFormat | string;
			end: dateFormat | string;
		};
	}[];
}

export interface Criteres {
	// interface pour le champ : criteres. Peut y en avoir plusieurs.
	operateur: string;
	criteres?: Criteres;
	valeur: string;
	proximite: number;
	typeRecherche: string;
}

/** Entrée d'un document dans un résultat de recherche. */
interface Title {
	id: string;
	cid?: string;
	title: string;
}

export interface resultatsRecherche {
	results: {
		titles?: Title[];
		nature?: string;
		text: string;
		origin: string;
		date?: string;
		sections?: sectionsResultats[];
	}[];
	totalResultNumber: number;
	fond?: string;
}

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
					lien: findLink(origine, entree.id, result.nature),
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
