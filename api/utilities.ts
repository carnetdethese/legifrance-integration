import { DilaApiClient } from 'api/client'
import { LegifranceSettings } from 'main';
import { listRouteConsult } from './constants';
import { Decision } from 'abstracts/decisions';
import * as interfaces from 'abstracts/searches'
import { legalDocument } from 'abstracts/document';
import { legalStatute } from 'abstracts/loi';


export interface dataFiche extends interfaces.ficheArretChamp, Decision, legalDocument, legalStatute {}

export class agentSearch {
  
  settings:LegifranceSettings;
  dilaApi:DilaApiClient;

  constructor(settings:LegifranceSettings) {
    this.settings = settings;
    this.dilaApi = new DilaApiClient(this.settings.clientId, this.settings.clientSecret, this.settings.apiHost, this.settings.tokenHost);
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

  async fetchText(texte:legalDocument | Decision, valeurRecherche:string) {
    const path = this.getPathID(texte.id) as string;

    let parametres = this.defineParamConsult(texte.id, valeurRecherche, texte.date);

    const requestOptions = {
      path: path,
      method: "POST",
      params: parametres
    }
      return await this.dilaApi.fetch(requestOptions);
  }

  getPathID(id:string) {
    const path = listRouteConsult.get(id.substring(0,4));
    return path;
  }

  defineParamConsult(id:string, valeurRecherche:string, date?:string) {
    let result;

    if (id.startsWith("LEGI")) {
      result = {
        "textId": id,
        "searchedString": valeurRecherche,
        "date": date
      }}

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