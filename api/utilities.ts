import { DilaApiClient } from 'api/client'
import { LegifranceSettings } from 'main';
import { listRouteConsult } from './constants';
import { Decision } from 'abstracts/decisions';
import * as interfaces from 'abstracts/searches'

export interface dataFiche extends interfaces.ficheArretChamp, Decision {}

export class agentSearch {
  
  settings:LegifranceSettings;
  dilaApi:DilaApiClient;

  constructor(settings:LegifranceSettings) {
    this.settings = settings;
    this.dilaApi = new DilaApiClient(this.settings.clientId, this.settings.clientSecret, this.settings.apiHost, this.settings.tokenHost);
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

  async advanceSearchText(search:interfaces.rechercheAvStructure) {
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