import { DilaApiClient } from 'api/client'
import { LegifranceSettings } from 'main';

export interface expressionRechercheForm {
  valeur?:string;
  type?:string;
  operateur?:string;
}

export interface RechercheForm {
  expressionRechercheForm: expressionRechercheForm[];
  fond:string;
  operateurGeneral:string;
}

export interface rechercheAvStructure { // Base
  recherche:champsRechercheAvancees,
  fond:string
}

export interface champsRechercheAvancees { // Interface pour le champ : recherche
  operateur:string,
  pageSize:number,
  sort:string,
  typePagination:string,
  pageNumber:number,
  champs:Champs
}

export interface Champs { // Interface pour le champ : Champs
  operateur:string,
  criteres:Criteres,
  typeChamp:string
}

export interface Criteres { // interface pour le champ : criteres. Peut y en avoir plusieurs.
  operateur:string,
  criteres?:Criteres,
  valeur:string,
  proximite:number,
  typeRecherche:string
}



export class agentSearch {
  settings:LegifranceSettings;
  dilaApi:DilaApiClient;

  constructor(settings:LegifranceSettings) {
    this.settings = settings;
    this.dilaApi = new DilaApiClient(this.settings.clientId, this.settings.clientSecret, this.settings.apiHost, this.settings.tokenHost);
  }


  rechercheAvancee(champsRecherche:expressionRechercheForm, nbResult:number) {

  }

  rechercheSimple(valeur:string, fond:string, nbResultat:number) {
    return {
      "recherche": {
          "pageSize":nbResultat,
          "sort": "PERTINENCE",
          "pageNumber": 1,
          "champs": [
              {
                  "typeChamp": "ALL",
                  "criteres": [
                      {
                          "typeRecherche": "UN_DES_MOTS",
                          "valeur": valeur,
                          "operateur": "ET"
                      }
                  ],
                  "operateur": "ET"
              }
          ],
          "typePagination": "DEFAUT"
      },
    "fond": fond
    }
  }

  async searchText(search:string, fond:string, maxResults:number) {
    const requestOptions = {
      path: "/search",
      method: "POST",
      params: this.rechercheSimple(search, fond, maxResults)
    }

    return await this.dilaApi.fetch(requestOptions);
  }

  async fetchText(id:string, valeurRecherche:string) {
    const requestOptions = {
      path: "/consult/juri",
      method: "POST",
      params: {
        "textId": id,
        "searchedString": valeurRecherche
      }};
      return await this.dilaApi.fetch(requestOptions);se
  }

}