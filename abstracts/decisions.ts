import { agentSearch } from "api/utilities";
import { removeTags } from "lib/tools";
import { htmlToMarkdown } from "obsidian";
import { reponseDocument } from "./resultatRecherche";

export interface resumeDecision {
	resumePrincipal:string;
}

export interface Decision {
	titre: string;
	id: string;
	texte: string;
	lien: string;
	origin: string;
	texteIntegral?: string;
	texteIntegralHTML?:string;
	numero?: string;
	date?: string;
	annee?:number;
	juridiction?:string;
	formation?: string;
	urlCC?: string; // Lien vers le site du Conseil constitutionnel
	sommaires?: Sommaire[];
	abstract?:string;
	titreNote?:string;
	contributionNote?:string;

}

export interface Sommaire {
	resume:string;
}

const urlFond = new Map<string, string>([
	["CETAT", "/ceta/id/"],
	["CONSTIT", "/cons/id/"],
	["JURI", "/juri/id/"]
]);

const codeJuridiction = new Map<string, string>([
	["CONSEIL_ETAT", "Conseil d'État"],
	["Conseil constitutionnel", "Conseil constitutionnel"],
	["Cour de cassation", "Cour de cassation"],
	["COURS_APPEL", "Cour d'appel"]
]);

const baseUrl = "https://www.legifrance.gouv.fr"

export function findLink(origine:string, id:string) {
	return baseUrl + urlFond.get(origine) + id	
}

export async function getDecisionInfo(decision:Decision, valeurRecherche:string, apiClient:agentSearch) {
	// objet Decision qui récupère une copie de l'objet passé en argument
	const infoDecision:Decision = decision;

	// Variable qui contient la réponse de la requête 
	const response:reponseDocument = await apiClient.fetchText(decision, valeurRecherche) as reponseDocument; // requête à l'API

	console.log(response);
		
	infoDecision.titre = removeTags(decision.titre);
	// Texte intégral au format markdown

	infoDecision.texteIntegral = htmlToMarkdown(response.text.texteHtml);
	infoDecision.texteIntegralHTML = response.text.texteHtml;


	// Date au format YYYY-MM-DD
	const dateDec = new Date(response.text.dateTexte)
	const formattedDate = dateDec.toISOString().split('T')[0];
	infoDecision.date = formattedDate;
	infoDecision.annee = dateDec.getFullYear();

	// Juridiction - je passe par une variable Map parce que certaines juridiction ne sont pas formattées comme je le veux !
	if (response.text.natureJuridiction != null) {
		infoDecision.juridiction = codeJuridiction.get(response.text.natureJuridiction);
	}

	// La formation de la juridiction
	if (response.text.formation != null) {
		infoDecision.formation = response.text.formation;
	}

	if (infoDecision.sommaires !== undefined) {
		if (response.text.sommaire !== undefined) {
			response.text.sommaire.forEach((elt: resumeDecision) => {
				if (elt.resumePrincipal) {
					const content = elt.resumePrincipal;
					infoDecision.sommaires?.push({ resume: content });
				}});
			}
	}

	// Numéro de la décision. Si c'est le Conseil constitutionnel - on affiche "numéro natureContrôle".
	if (decision.origin == "CONSTIT") {
		infoDecision.numero = `${removeTags(response.text.num)} ${response.text.nature}`;
		infoDecision.urlCC = response.text.urlCC;
	}
	else {
		infoDecision.numero = removeTags(response.text.num);
	}

	return infoDecision
}