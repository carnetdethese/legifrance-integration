import { resumeDecision } from "./decisions"

export interface resultatsRecherche {
	results: {
        titles?: {
            id?:string,
            title?:string
        }
        nature?:string,
		text: string,
		origin:string,
        date?:string
	}
}

export interface reponseDocument {
    text: {
        texteHtml:string,
        nature:string,
        dateTexte:string,
        natureJuridiction:string,
        formation:string,
        sommaire:resumeDecision[],
        num:string,
        urlCC:string
    }
}