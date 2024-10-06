import { DilaApiClient } from 'api/client'
import { LegifranceSettings } from 'settings/settings';
import { listRouteConsult } from './constants';
import { Decision } from 'abstracts/decisions';
import {ficheArretChamp, noteDocumentChamp, rechercheAvStructure } from 'abstracts/searches'
import { legalDocument } from 'abstracts/document';
import { legalStatute } from 'abstracts/loi';

export interface dataFiche extends ficheArretChamp, noteDocumentChamp, Decision, legalDocument, legalStatute {}

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

  async fetchText(texte:legalDocument | Decision | legalStatute, valeurRecherche:string) {
    const path = this.getPathID(texte.origin) as string;

    let parametres = this.defineParamConsult(valeurRecherche, texte, texte.date);

    const requestOptions = {
      path: path,
      method: "POST",
      params: parametres
    }
      return await this.dilaApi.fetch(requestOptions);
  }

  getPathID(origin:string) {
    const path = listRouteConsult.get(origin.substring(0,4));
    return path;
  }

  defineParamConsult(valeurRecherche:string, document:legalDocument | Decision | legalStatute, date?:string) {
    let result;
    // console.log(document.fond);

    if (document.nature == "CODE") {
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
    else {
      result = {
        "textId": document.id,
        "searchedString": valeurRecherche
      }}
  
    return result;
  }

}  