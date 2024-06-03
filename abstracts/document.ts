import { agentSearch } from "api/utilities";
import { removeTags } from "lib/tools";
import { htmlToMarkdown } from "obsidian";
import { reponseDocument } from "./searches";

export interface resumeDocument {
	resumePrincipal:string;
}

export interface legalDocument {
	titre: string;
	id: string;
	texte: string;
	lien: string;
	origin: string;
    date?: string;
}

export interface Sommaire {
	resume:string;
}


export async function getDocumentInfo(document:legalDocument, valeurRecherche:string, apiClient:agentSearch) {
	// objet Document qui récupère une copie de l'objet passé en argument
	const infoDocument:legalDocument = document;

	// Variable qui contient la réponse de la requête 
	const response:reponseDocument = await apiClient.fetchText(document, valeurRecherche) as reponseDocument; // requête à l'API

	console.log(response);
	
	return infoDocument
}