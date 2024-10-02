import { Sommaire, resumeDocument } from "abstracts/document"
import {  } from "abstracts/document";
import * as constants from "api/constants";
import { ResearchTextView } from "views/researchText";
import { getTodaysDate, startDateBeforeEndDate } from "lib/utils";
import { PopUpModal } from "modals/popUp";
import { App, Notice } from "obsidian";
import { dateFormat } from "lib/dateHandler";
import { statuteArticles, statuteSections } from "./loi";
import { codeJuridiction } from "./decisions";
import { MontrerResultatsModal } from "modals/ShowModal";
import { agentSearch } from "api/utilities";
import LegifrancePlugin, { agentChercheur, globalSettings } from "main";
import { WaitModal } from "modals/WaitModal";

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

export class documentHandlerBase {
  recherche:champsRechercheAvancees;
  fond:string;
  criteresTri:Record<string, string>;

  constructor() {
    this.recherche = {
      filtres: [],
      pageSize: globalSettings.maxResults,
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
          operateur:constants.operateursRecherche.keys().next().value,
        }],
      }]
    };

    this.fond = constants.codeFond.keys().next().value;
    this.updatingFond(this.fond);
  }

  // TODO : fonction permettant de mettre à jour la valeur du champ concerné. Permet d'éviter des appels directs aux propriétés de la classe. A terme, serait bien de rendre privées toutes les variables de document pour simplifier le code.

  updateValue(champ:number, critere:number, valeur:string) {
    // Champ et critere commencent à 0 - correspondent au rang dans l'Array correspondant.
    this.recherche.champs[champ].criteres[critere].valeur = valeur;
    return this.recherche.champs[champ].criteres[critere].valeur;
  }

  // Idem pour le numéro de la page demandée. Facilitera l'affichage lorsqu'on fera un moteur de présentation des résultats plus sympathiques.
  updatePageNumber(newPage:number) {
    this.recherche.pageNumber = newPage;
    return this.recherche.pageNumber;
  }

  // Les quatres fonctions qui suivent permettent un meilleur contrôle de l'ajout ou la suppression d'un champ et d'un nouveau critère. Il faudra penser à implanter une logique de contrôle pour éviter que des champs requis soit supprimé, notamment.
  createChamps() {

  }

  deleteChamps(champ:number) {

  }

  createCritere(champ:number) {
    // Le paramètre "champ" correspond à l'index du champ dans lequel se trouve le critère à ajouter.
    // La fonction pousse un nouveau critère en fin de liste.
    // Possibilité d'ajouter jusque 3 critères par champs. 

    if (this.recherche.champs[champ].criteres.length < 3) {
      this.recherche.champs[champ].criteres.push({
        operateur: constants.operateursRecherche.keys().next().value,
        valeur: "",
        proximite: 2,
        typeRecherche: constants.typeRecherche.keys().next().value
     })
    }

    return;
  }

  deleteCritere(champ:number, critere:number) {
    if (critere > -1 && critere < this.recherche.champs[champ].criteres.length)
    {
      this.recherche.champs[champ].criteres.splice(critere, 1) // Remove 1 element at the specified index
    }

    return;
  }

  updateTypeRechercheChamp(champ:number, critere:number, type:string) {
    if (this.recherche.champs[champ].criteres[critere]) {
      this.recherche.champs[champ].criteres[critere].typeRecherche = type;
    }

    return this.recherche.champs[champ].criteres[critere].typeRecherche;
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

    // setting or resetting the date field according to the "fond"
    if (["ALL", "CODE_ETAT", "CNIL"].includes(selection)) this.resetDate();
    else if (["CETAT", "JURI", "CONSTIT"].includes(selection) || constants.codeLegalStatute.includes(selection)) this.updateDate();
    else this.updateDate();


    // setting or resetting the sorting criteria. The variable is used as a Record by the 
    // Obsidian dropdown component to show the criteria in the research view.
    if (selection == "ALL") this.criteresTri = constants.criteresTriGeneraux.pertinence;
    else if (selection == "CNIL") this.criteresTri = constants.criteresTriGeneraux.cnil;
    else if (selection == "CETAT" || selection == "JURI" || selection == "CONSTIT" || selection == "ACCO") this.criteresTri = constants.criteresTriGeneraux.decisionAcco;
    else if (selection == "LODA_ETAT" || selection == "JORF") this.criteresTri = constants.criteresTriGeneraux.jorfLoda;
    else if (selection == "CIRC") this.criteresTri = constants.criteresTriGeneraux.circ;

    this.updateFacette(); // updating the date filter facet.
  }

  resetDate() {
    // Function that resets the date for the "fond" I couldn't yet find a way to implement completely.
    if (this.recherche.filtres[0]) {
      this.recherche.filtres[0].facette = "";
      this.recherche.filtres = [];
    }
  }

  updateFacette(crit?:string) {
    // Function that updates the facet for the date filter according either 
    // to a criterium passed as argument or to the sorting field.

    if (crit) {
      this.recherche.sort = crit;
    }
    else {
      this.recherche.sort = "PERTINENCE"; // always falling to this as it is a default value.
    }

    if (this.recherche.filtres.length > 0) {
      if (constants.codeJurisprudence.includes(this.fond)) this.recherche.filtres[0].facette = "DATE_DECISION";
      else if (this.recherche.sort.toLowerCase().includes("publication")) {
        console.log("publication");
        this.recherche.filtres[0].facette = "DATE_PUBLICATION";
      }
      else if (this.recherche.sort.toLowerCase().includes("signature") || this.fond == "ACCO") {
        console.log("signature");
        this.recherche.filtres[0].facette = "DATE_SIGNATURE";
      }
    }
  }

  updateDate() {
    this.recherche.filtres[0] = {'dates':{'start': new dateFormat(), 'end': new dateFormat()}, 'facette':"DATE_PUBLICATION"};
  }

  showSearch() {
    console.log(this.toString());
    return
  }

  async checkBeforeSearch() {
    const pluginInstance = LegifrancePlugin.instance;
    let today = getTodaysDate();
    let start = new dateFormat("1800", "1", "1");

    if (this.fond != "ALL" && this.fond != "CODE_ETAT" && this.fond != "CNIL") {
      if (!this.recherche.filtres[0].dates.end.toString()) this.recherche.filtres[0].dates.end = today;
      if (!this.recherche.filtres[0].dates.start.toString()) this.recherche.filtres[0].dates.start = start.toString();
      
      if (!startDateBeforeEndDate(this.recherche.filtres[0].dates.start as dateFormat, this.recherche.filtres[0].dates.end as dateFormat)) {
        new PopUpModal(pluginInstance.app, "Vous devez entrer une date de début antérieure à la date de fin !").open();
        return 'false';
      }
    }
    return 'true';
  }

  async searchAndShowModal() {
    const pluginInstance = LegifrancePlugin.instance;
    const pluginApp = pluginInstance.app;
  
    const searchResult = await agentChercheur.advanceSearchText(this.toObject()) as resultatsRecherche;
  
    let valeurRecherche = "";
  
    for (const elt of this.recherche.champs[0].criteres) {
      valeurRecherche += elt.valeur;
    }
  
    new MontrerResultatsModal(pluginApp, pluginInstance, searchResult,valeurRecherche, agentChercheur, false, this.fond).open();
  }

  async launchSearch() {
    const pluginInstance = LegifrancePlugin.instance;

    const check = await this.checkBeforeSearch();
    if (check == 'false') return; 

    const waitingModal = new WaitModal(pluginInstance.app);
    waitingModal.open();

    try {
      this.searchAndShowModal();

    } catch (error) {
        console.error('Error performing search:', error);
        new Notice('Une erreur est survenue durant la requête. Veuillez vérifier vos identifiants et réessayer.');
    } finally {
        waitingModal.close();
    }

  }


}

export class documentHandlerView extends documentHandlerBase {
  view:ResearchTextView;
  recherche:champsRechercheAvancees;
  fond:string;
  criteresTri:Record<string, string>;

  constructor(view:ResearchTextView) {
    super();
  }

  updatingFond(selection:string) {
    super.updatingFond(selection);
  }
}

