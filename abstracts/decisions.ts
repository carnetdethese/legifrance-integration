import { fetchText } from "api/utilities";
import { info } from "console";
import { htmlToMarkdown } from "obsidian";

export interface Decisions {
	titre: string;
	id: string;
	texte: string;
	lien: string;
	origin: string;
	texteIntegral?: string;
	numero?: string;
	date?: string;
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

export async function getDecisionInfo(decision:Decisions, valeurRecherche:string) {
	let infoDecision:Decisions = decision;
	let response:object;

	response = await fetchText(decision.id, valeurRecherche);

	infoDecision.texteIntegral = htmlToMarkdown(response.text.texteHtml);
	infoDecision.numero = htmlToMarkdown(response.)

	return infoDecision
}