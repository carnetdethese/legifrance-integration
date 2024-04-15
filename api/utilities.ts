import { DilaApiClient } from 'api/client'
import { LegifranceIntegrationSettings } from 'main';

export class agentSearch {
  settings:LegifranceIntegrationSettings;
  dilaApi:DilaApiClient;

  constructor(settings:LegifranceIntegrationSettings) {
    this.settings = settings;
    this.dilaApi = new DilaApiClient(this.settings.clientId, this.settings.clientSecret, this.settings.apiHost, this.settings.tokenHost);
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
    return await this.dilaApi.fetch(requestOptions)
  }

  async fetchText(id:string, valeurRecherche:string) {
    const requestOptions = {
      path: "/consult/juri",
      method: "POST",
      params: {
        "textId": id,
        "searchedString": valeurRecherche
      }};
      
    return await this.dilaApi.fetch(requestOptions)
  }

}