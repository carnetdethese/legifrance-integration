import type { LegifranceApi } from "api/legifrance";
import { sectionsResultats } from "./searches";
import { getDecisionInfo } from "./decisions";
import { consultDocument } from "./consult";
import { isCaselawOrigin } from "./fonds";

export interface resumeDocument {
	resumePrincipal:string;
}

export interface noteChampsPersonnalises {
	titreChamp: string;
	valeurChamp: string;
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
	titreNote:string;
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
	/** Solution de la décision (« Non conformité partielle », « Rejet »…) ; `abstract` la porte aussi pour les décisions issues d'une recherche. */
	solution?: string;
	auteur?:string;
	motsCles?:string[];
	motsClesLibres?:string;
	attachment?: Attachment;
	notes?: noteChampsPersonnalises[];
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

/**
 * Complète la fiche d'un document trouvé par une recherche (texte, métadonnées) : décisions de
 * justice par `getDecisionInfo`, tous les autres fonds par `consultDocument`.
 */
export async function getDocumentInfo(document: legalDocument, valeurRecherche: string, api: LegifranceApi) {
	if (isCaselawOrigin(document.origin)) return getDecisionInfo(document, valeurRecherche, api);
	return consultDocument(document, valeurRecherche, api);
}
