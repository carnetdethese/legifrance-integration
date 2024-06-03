import { rechercheAvStructure } from "api/utilities"
import { resumeDecision } from "./decisions"
import * as constants from "api/constants";

export interface resultatsRecherche {
	results: {
        titles?: {
            id?:string,
            title?:string
        }
        nature?:string,
		text: string,
		origin:string,
        date?:string
	}
}

export interface reponseDocument {
    text: {
        texteHtml:string,
        nature:string,
        dateTexte:string,
        natureJuridiction:string,
        formation:string,
        sommaire:resumeDecision[],
        num:string,
        urlCC:string
    }
}


// Classes et fonctions pour mieux intégrer les recherches avancées dans les fonds. Les classes devraient disposer :
// - D'une fonction de mise à jour automatique des champs en fonction des fonds selectionnées (donc renvoyer, par exemple, une liste avec les critères de tri applicables à chaque collection).






export class documentHandler {
    recherche:rechercheAvStructure;

    constructor() {
        this.recherche = {
            recherche:
         {
            filtres: [{
              facette: "",
              dates: {
                start: "",
                end: ""
              }
            }],
            pageSize: this.plugin.settings.maxResults,
            sort: this.plugin.settings.critereTriSetting,
            // operateur: operateursRecherche.keys().next().value,
            typePagination: "DEFAUT",
            pageNumber: 1,
            champs: [{
              typeChamp: "ALL",
              operateur: constants.operateursRecherche.keys().next().value,
              criteres: [{
                valeur: "", 
                typeRecherche:constants.typeRecherche.keys().next().value, 
                proximite: 2,
                operateur:constants.operateursRecherche.keys().next().value
              }],
            }]
          },
          fond: constants.codeFond.keys().next().value,
        }
    }


}