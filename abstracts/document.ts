import { agentSearch } from "api/utilities";
import { reponseDocument } from "./searches";
import { getDecisionInfo } from "./decisions";
import { getStatuteInfo } from "./loi";
import { codeJurisprudence, codeLegalStatute } from "api/constants";

export interface resumeDocument {
	resumePrincipal:string;
}

export interface legalDocument {
	fond:string;
	titre: string;
	id: string;
	texte: string;
	lien: string;
	origin: string;
	type:string,
	numero?:string;
	nature?:string;
	cid?:string;
    date?: string;
	texteIntegral?:string;
	texteIntegralHTML?:string;
	titreNote?:string;
	contributionNote?:string;
}

export interface Sommaire {
	resume:string;
}

export async function getDocumentInfo(document:legalDocument, valeurRecherche:string, apiClient:agentSearch) {
	// objet Document qui récupère une copie de l'objet passé en argument
	const infoDocument:legalDocument = document;

	console.log(valeurRecherche);

	if (codeJurisprudence.includes(document.origin)) {
		return getDecisionInfo(document, valeurRecherche, apiClient);
	}
	if (codeLegalStatute.includes(document.origin)) {
		return getStatuteInfo(document, valeurRecherche, apiClient);
	}

	// if (document.cid) document.id = document.cid;

	// Variable qui contient la réponse de la requête
	const response:reponseDocument = await apiClient.fetchText(document, valeurRecherche) as reponseDocument; // requête à l'API

	console.log(response);
	
	return infoDocument
}