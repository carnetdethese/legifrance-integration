import { DilaApiClient } from 'api/client'
import { LegifranceSettings } from 'settings/settings';
import { listRouteConsult } from './constants';
import {ficheArretChamp, noteDocumentChamp, rechercheAvStructure } from 'abstracts/searches'
import { legalDocument } from 'abstracts/document';

export interface dataFiche extends ficheArretChamp, noteDocumentChamp, legalDocument {}

export class agentSearch {
  
  settings:LegifranceSettings;
  dilaApi:DilaApiClient;

  constructor(settings:LegifranceSettings) {
    this.settings = settings;
    this.dilaApi = new DilaApiClient(this.settings.clientId, this.settings.clientSecret, this.settings.apiHost, this.settings.tokenHost);
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

  async fetchText(texte:legalDocument, valeurRecherche:string) {
    const path = this.getPathID(texte.origin) as string;
    const parametres = this.defineParamConsult(valeurRecherche, texte, texte.date);
    const requestOptions = {
      path: path,
      method: "POST",
      params: parametres
    }

    const data = await this.dilaApi.fetch(requestOptions);
    console.log(data);

    return data;
  }

  getPathID(origin:string) {
    const path = listRouteConsult.get(origin.substring(0,4));
    return path;
  }

  defineParamConsult(valeurRecherche:string, document:legalDocument, date?:string) {
    let result;
    if (document.nature == "CODE" || document.fond == "ACCO" || document.fond == 'CIRC' || document.fond == "KALI") {
      result = {
        "id": document.id,
        "searchedString": valeurRecherche
      }
    }
    else if (document.origin == "JORF") {
      result = {
        "textCid": document.cid,
        "searchedString": valeurRecherche
      }}
    else if (document.origin == "LEGI") {
      result = {
        "textId": document.id,
        "date": document.date,
        "searchedString": valeurRecherche
      }
    }
    else {
      result = {
        "textId": document.id,
        "searchedString": valeurRecherche
      }}  
    return result;
  }

}  