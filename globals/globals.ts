import { resultatsRecherche } from "abstracts/searches";
import { agentSearch } from "api/utilities";
import { LegifranceSettings } from "settings/settings";
import { documentDataStorage } from "views/viewsData";


// Defining global variables
export let globalSettings:LegifranceSettings, agentChercheur:agentSearch, documentsListe:Array<documentDataStorage>, resultats: resultatsRecherche, valeurRecherche: string;

export function getDocumentsListe() {
	return documentsListe;
}

export function setDocumentsListe(value:Array<documentDataStorage>) {
	documentsListe = value;
}

export function pushDocumentsList(value:documentDataStorage) {
	documentsListe.push(value);
}

export function popDocumentsList() {
	documentsListe.pop();
}

export function removeDocumentsList(doc:documentDataStorage) {
	documentsListe.remove(doc);
}

export function getGlobalSettings() {
	return globalSettings;
}

export function setGlobalSettings(value:LegifranceSettings) {
	globalSettings = value;
}

export function getAgentChercheur() {
	return agentChercheur;
}

export function setAgentChercheur(value:agentSearch) {
	agentChercheur = value;
}

export function getResultatsVariable() {
	return resultats;
}

export function setResultatsVariable(value:resultatsRecherche) {
	resultats = value;
	console.log(resultats);
}

export function getValeurRecherche() {
	return valeurRecherche
}

export function setValeurRecherche(value:string) {
	valeurRecherche = value;
}