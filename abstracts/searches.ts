import { Sommaire, resumeDocument } from "abstracts/document"
import {  } from "abstracts/document";
import * as constants from "api/constants";
import { ResearchTextView } from "views/researchText";
import { getTodaysDate, startDateBeforeEndDate } from "lib/utils";
import { PopUpModal } from "modals/popUp";
import { App } from "obsidian";
import { dateFormat } from "lib/dateHandler";
import { statuteArticles, statuteSections } from "./loi";

// Création des interfaces pour construire une recherche avancée.

export interface RechercheForm {
  fond:string;
  operateurGeneral:string;
}

export interface rechercheAvStructure { // Base
  recherche:champsRechercheAvancees,
  fond:string
}

export interface champsRechercheAvancees { // Interface pour le champ : recherche
  operateur?:string,
  pageSize:number,
  sort:string,
  typePagination:string,
  pageNumber:number,
  champs:Champs[],
  filtres: Filtres[]
}

export interface Filtres {
  facette:string,
  dates: champDate
}

export interface champDate {
  start: dateFormat | string,
  end: dateFormat | string
}

export interface Champs { // Interface pour le champ : Champs
  operateur?:string,
  criteres:Criteres[],
  typeChamp:string
}

export interface Criteres { // interface pour le champ : criteres. Peut y en avoir plusieurs.
  operateur:string,
  criteres?:Criteres,
  valeur:string,
  proximite:number,
  typeRecherche:string
}


export interface noteDocumentChamp {
  [key:string]:string | undefined | number | Sommaire[] | statuteArticles[] | statuteSections[ ],
  notes:string,
  interet: string,
  connexes:string
}

export interface ficheArretChamp {
  [key:string]:string | undefined | number | Sommaire[] | statuteArticles[] | statuteSections[ ], 
  faits:string,
  procedure:string,
  moyens:string,
  question:string,
  solution:string
}


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
        sommaire:resumeDocument[],
        num:string,
        urlCC:string
    }
}

// Classes et fonctions pour mieux intégrer les recherches avancées dans les fonds. Les classes devraient disposer :
// - D'une fonction de mise à jour automatique des champs en fonction des fonds selectionnées (donc renvoyer, par exemple, une liste avec les critères de tri applicables à chaque collection).

export class documentHandler {
  app:App;
  view:ResearchTextView;
  recherche:champsRechercheAvancees;
  fond:string;

  constructor(app:App, view:ResearchTextView) {
    this.app = app;
    this.view = view;
    this.recherche = {
      filtres: [],
      pageSize: view.plugin.settings.maxResults,
      sort: "",
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
    };
    this.fond = constants.codeFond.keys().next().value;
  }

  toObject() {
    if (this.recherche.filtres[0]){
      this.recherche.filtres[0].dates.end = this.recherche.filtres[0].dates.end.toString();
      this.recherche.filtres[0].dates.start = this.recherche.filtres[0].dates.start.toString();
    }

    return {
      recherche: this.recherche,
      fond: this.fond
      };
  }


  toString() {
    if (this.recherche.filtres[0]){
      this.recherche.filtres[0].dates.end = this.recherche.filtres[0].dates.end.toString();
      this.recherche.filtres[0].dates.start = this.recherche.filtres[0].dates.start.toString();
    }

    return {
      recherche: this.recherche,
      fond: this.fond
      };
  }

  updatingFond(selection:string) {
    this.fond = selection;

    if (selection == "ALL" || selection == "CODE_ETAT") {
      this.resetDate();
    }

    else if (selection == "CETAT" || selection == "JURI" || selection == "CONSTIT") {
      this.updateDate(this.view.plugin.settings.critereTriSetting, 'DATE_DECISION');
    }

    else if (selection == "JORF") {
      this.updateDate("PUBLICATION_DATE_ASC", 'DATE_PUBLICATION');
    }

    this.view.onOpen();
  }

  resetDate() {
    if (this.recherche.filtres[0]) {
      this.recherche.filtres[0].facette = "";
      this.recherche.sort = "PERTINENCE";
      this.recherche.filtres = [];
    }
  }

  updateDate(critereTri:string, facette:string) {
    this.recherche.sort = this.view.plugin.settings.critereTriSetting;
    this.recherche.filtres[0] = {'dates':{'start': new dateFormat(), 'end': new dateFormat()}, 'facette':'DATE_DECISION'};
  }

  showSearch() {
    console.log(this.toString());
    return
  }

  async checkBeforeSearch() {
    let today = getTodaysDate();
    let start = new dateFormat("1800", "1", "1");

    if (this.fond != "ALL" && this.fond != "CODE_ETAT") {
      if (!this.recherche.filtres[0].dates.end.toString()) this.recherche.filtres[0].dates.end = today;
      if (!this.recherche.filtres[0].dates.start.toString()) this.recherche.filtres[0].dates.start = start.toString();
      
      if (!startDateBeforeEndDate(this.recherche.filtres[0].dates.start as dateFormat, this.recherche.filtres[0].dates.end as dateFormat)) {
        new PopUpModal(this.app, "Vous devez entrer une date de début antérieure à la date de fin !").open();
        return 'false';
      }
    }
    return 'true';
  }


}