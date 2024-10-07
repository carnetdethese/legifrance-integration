import { agentSearch } from "api/utilities";
import { reponseDocument, sectionsResultats } from "./searches";
import { getDecisionInfo } from "./decisions";
import { getCirculaireInfo, getConvCollInfo, getStatuteInfo } from "./loi";
import { codeJurisprudence, codeLegalStatute } from "api/constants";

export interface resumeDocument {
	resumePrincipal:string;
}

export interface legalDocument {
	fond:string;
	dateTexte?:string;
	id: string;
	texte: string;
	lien: string;
	origin: string;
	type?:string,
	titre:string,
	numero?:string;
	nature?:string;
	natureJuridiction?:string;
	cid?:string;
    date?: string;
	texteHtml?:string;
	texteIntegral?:string;
	texteIntegralHTML?:string;
	titreNote?:string;
	contributionNote?:string;
	visa?:string;
	sections?:sectionsResultats[];
	jurisDate?:string;
    jorfText?:string;
    articles?:statuteArticles[];
	annee?:number;
	juridiction?:string;
	formation?: string;
	urlCC?: string; // Lien vers le site du Conseil constitutionnel
	num?:string;
	sommaires?: Sommaire[];
	sommaire?:resumeDocument[];
	abstract?:string;
	auteur?:string;
	motsCles?:string[];
	motsClesLibres?:string;
	attachment?: Attachment;
}

export interface Attachment {
	content: string;
	title: string | null;
	name: string | null;
	author: string | null;
	keywords: string | null;
	date: number;
	content_type: string;
	content_length: number;
	language: string;
  }

export interface statuteArticles {
    content:string;
    num:number | string;
    cid:string;
}

export interface statuteSections {
    title:string;
    articles:statuteArticles[];
    sections?:statuteSections[];
}

export interface Sommaire {
	resume:string;
}

export async function getDocumentInfo(document:legalDocument, valeurRecherche:string, apiClient:agentSearch) {

	// objet Document qui récupère une copie de l'objet passé en argument
	const infoDocument:legalDocument = document;

	// console.log(valeurRecherche);

	if (codeJurisprudence.includes(document.origin)) {
		return getDecisionInfo(document, valeurRecherche, apiClient);
	}
	if (codeLegalStatute.includes(document.origin)) {
		return getStatuteInfo(document, valeurRecherche, apiClient);
	}
	if ('CIRC'.includes(document.origin)) {
		return getCirculaireInfo(document, valeurRecherche, apiClient)
	}
	if ('KALI'.includes(document.origin)) {
		return getConvCollInfo(document, valeurRecherche, apiClient);
	}

	// if (document.cid) document.id = document.cid;

	// Variable qui contient la réponse de la requête
	await apiClient.fetchText(document, valeurRecherche) as reponseDocument; // requête à l'API
	
	return infoDocument
}

