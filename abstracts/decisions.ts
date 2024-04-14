import DilaApiClient from "@socialgouv/dila-api-client";

export interface Decisions {
	titre: string;
	id: string;
	texte: string;
	lien: string;
	origin: string;
}

const codeFond = new Map<string, string>([
	["CETAT", "/ceta/id/"],
	["CONSTIT", "/cons/id/"],
	["JURI", "/juri/id/"]
]);

const baseUrl = "https://www.legifrance.gouv.fr"

export function findLink(origine:string, id:string) {
	return baseUrl + codeFond.get(origine) + id	
}

export function fetchText(decision:Decisions) {
	
}