import { Attachment, Sommaire, legalDocument, resumeDocument, statuteArticles, statuteSections } from "abstracts/document"
import * as constants from "api/constants";
import { dateFormat } from "lib/dateHandler";
import { entreeDocument } from "modals/ShowModal";
import { findLink } from "./decisions";

export interface rechercheAvStructure { // Base
	recherche: champsRechercheAvancees,
	fond: string
}

export interface champsRechercheAvancees {
	operateur?: string,
	pageSize: number,
	sort: string,
	typePagination: string,
	pageNumber: number,
	champs: { 
		operateur?: string,
		criteres: Criteres[],
		typeChamp: string
	}[],
	filtres: {
		facette: string,
		dates: {
			start: dateFormat | string,
			end: dateFormat | string
		}
	}[]
}

export interface Criteres { 
	// interface pour le champ : criteres. Peut y en avoir plusieurs.
	operateur: string,
	criteres?: Criteres,
	valeur: string,
	proximite: number,
	typeRecherche: string
}

export interface noteDocumentChamp {
	[key: string]: string | undefined | number | Sommaire[] | statuteArticles[] | statuteSections[] | sectionsResultats[] | string[] | resumeDocument[] | Attachment,
	notes: string,
	interet: string,
	connexes: string
}

export interface ficheArretChamp {
	[key: string]: string | undefined | number | Sommaire[] | statuteArticles[] | statuteSections[] | sectionsResultats[] | string[] | resumeDocument[] | Attachment,
	faits: string,
	procedure: string,
	moyens: string,
	question: string,
	solution: string
}

export interface resultatsRecherche {
	results: {
		titles?: {
			id?: string,
			title?: string
		}
		nature?: string,
		text: string,
		origin: string,
		date?: string,
		sections?: sectionsResultats[];
	},
	totalResultNumber: number,
	fond?: string
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


export class resultatsRechercheClass {
	resultats: resultatsRecherche;
	fond: string;

	constructor(data: resultatsRecherche) {
		this.resultats = data;
		this.fond = "";
	}

	listeResultats() {
		const resultsDic: legalDocument[] = [];

		let contenuTexte: string, origine: string, date: string, cid: string, nature: string, type: string;

		if (this.resultats && this.resultats.results && Array.isArray(this.resultats.results)) {

			this.resultats.results.forEach(result => {
				// Process each search result here

				contenuTexte = result.text;
				origine = result.origin;
				nature = result.nature;
				type = constants.codeJurisprudence.includes(origine) ? "jurisprudence" : "document";
				if (result.date) { date = result.date }
				result.titles.forEach((entree: entreeDocument) => {
					if (entree.cid) cid = entree.cid;
					resultsDic.push({
						fond: origine,
						type: type,
						titre: entree.title,
						id: entree.id,
						texte: contenuTexte,
						lien: findLink(origine, entree.id),
						origin: origine,
						nature: nature,
						date: date,
						cid: cid,
						sections: result.sections
					});
				});
			});
		} else {
			console.error('Réponse invalide ou manquante à la requête.');
		}

		console.log(resultsDic);
		return resultsDic;
	}

}


