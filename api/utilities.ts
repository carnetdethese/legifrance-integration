import { DilaApiClient } from 'api/client'
import { LegifranceSettings } from 'main';
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
    const path = this.getPathID(texte.fond) as string;
    let id = texte.id;

    // console.log(id);
    // if (texte.origin == "JORF" || texte.origin == "LEGI") id = texte.cid as string;
    // console.log(id);

    let parametres = this.defineParamConsult(id, valeurRecherche, texte, texte.date);

    const requestOptions = {
      path: path,
      method: "POST",
      params: parametres
    }
      return await this.dilaApi.fetch(requestOptions);
  }

  getPathID(fond:string) {
    const path = listRouteConsult.get(fond.substring(0,4));
    return path;
  }

  defineParamConsult(id:string, valeurRecherche:string, document:legalDocument | Decision | legalStatute, date?:string) {
    let result;
    console.log(document.fond);

    if (document.fond == "ALL") {
      result = {
        "textId": id,
        "searchedString": valeurRecherche,
        "date": date
      }}

    else if (document.fond == "CODE_ETAT" || document.fond == "CODE_DATE") {
      result = {
        "id": id,
      }
    }
    
    else if (id.startsWith("JORF")) {
      result = {
        "textCid": id,
        "searchedString": valeurRecherche
      }}  

    else {
      result = {
        "textId": id,
        "searchedString": valeurRecherche
      }}
  
    return result;
  }

}  