import { DilaApiClient } from 'api/client'
import { LegifranceSettings } from 'main';
import { listRouteConsult } from './constants';
import { Decision, Sommaire } from 'abstracts/decisions';

// Création des interfaces pour construire une recherche avancée.

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
  operateur?:string,
  pageSize:number,
  sort:string,
  typePagination:string,
  pageNumber:number,
  champs:Champs[]
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

export interface ficheArretChamp {
  [key:string]:string | undefined | number | Sommaire[], 
  fait:string,
  procedure:string,
  moyens:string,
  question:string,
  solution:string
}

export interface dataFiche extends ficheArretChamp, Decision {}

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
          "typePagination": "DEFAUT",
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
          ]
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

  async advanceSearchText(search:rechercheAvStructure) {
    const requestOptions = {
      path: "/search",
      method: "POST",
      params: search
    }

    const result = await this.dilaApi.fetch(requestOptions);

    return result;
  }

  async fetchText(texte:Decision, valeurRecherche:string) {
    let parametres;
    const path = getPathID(texte.id) as string;

    if (texte.id.startsWith("LEGI")) {
      parametres = {
        "textId": texte.id,
        "searchedString": valeurRecherche,
        "date": texte.date
      }}
    else {
      parametres = {
        "textId": texte.id,
        "searchedString": valeurRecherche
      }}

    const requestOptions = {
      path: path,
      method: "POST",
      params: parametres
    }
      return await this.dilaApi.fetch(requestOptions);
  }
}

function getPathID(id:string) {
  const path = listRouteConsult.get(id.substring(0,4));
  return path;
}