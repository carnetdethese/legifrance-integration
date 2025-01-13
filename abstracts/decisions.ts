import { legalDocument, resumeDocument } from "./document";
import { reponseDocument } from "./searches";
import { agentSearch } from "api/utilities";
import { removeTags } from "lib/tools";
import { htmlToMarkdown } from "obsidian";

export const urlFond = new Map<string, string>([
	["CETAT", "/ceta/id/"],
	["CONSTIT", "/cons/id/"],
	["JURI", "/juri/id/"],
	["LEGI", "/legi/id/"],
	["JORF", "/jorf/id"],
	["ACCO", "/acco/id/"],
	["CIRC", "/circulaire/id/"],
	["KALI", "/conv_coll/id/"]
]);

export const codeJuridiction = new Map<string, string>([
	["CONSEIL_ETAT", "Conseil d'État"],
	["Conseil constitutionnel", "Conseil constitutionnel"],
	["Cour de cassation", "Cour de cassation"],
	["COURS_APPEL", "Cour d'appel"]
]);

const baseUrl = "https://www.legifrance.gouv.fr"

export function findLink(origine:string, id:string) {
	return baseUrl + urlFond.get(origine) + id	
}

export async function getDecisionInfo(document:legalDocument, valeurRecherche:string, apiClient:agentSearch):Promise<legalDocument | undefined> {
	// objet Document qui récupère une copie de l'objet passé en argument
	const infoDocument:legalDocument = document;

	// Variable qui contient la réponse de la requête 
	const response:reponseDocument = await apiClient.fetchText(document, valeurRecherche) as reponseDocument; // requête à l'API


	infoDocument.titre = removeTags(document.titre);
	// Texte intégral au format markdown

	if (!response.text) return;

	if (response.text.texteHtml) infoDocument.texteIntegral = htmlToMarkdown(response.text.texteHtml);
	infoDocument.texteIntegralHTML = response.text.texteHtml;

	// Date au format YYYY-MM-DD
	if (response.text.dateTexte) {
		const dateDec = new Date(response.text.dateTexte)
		const formattedDate = dateDec.toISOString().split('T')[0];
		infoDocument.date = formattedDate;
		infoDocument.annee = dateDec.getFullYear();
	}

	// Juridiction - je passe par une variable Map parce que certaines juridiction ne sont pas formattées comme je le veux !
	if (response.text.natureJuridiction != null) {
		infoDocument.juridiction = codeJuridiction.get(response.text.natureJuridiction);
	}

	// La formation de la juridiction
	if (response.text.formation != null) {
		infoDocument.formation = response.text.formation;
	}

	if (infoDocument.sommaires !== undefined) {
		if (response.text.sommaire !== undefined) {
			response.text.sommaire.forEach((elt: resumeDocument) => {
				if (elt.resumePrincipal) {
					const content = elt.resumePrincipal;
					infoDocument.sommaires?.push({ resume: content });
				}});
			}
	}

	// Numéro de la décision. Si c'est le Conseil constitutionnel - on affiche "numéro natureContrôle".
	if (document.origin == "CONSTIT") {
		if (response.text.num) infoDocument.numero = `${removeTags(response.text.num)} ${response.text.nature}`;
		infoDocument.urlCC = response.text.urlCC;
	}
	else {
		if (response.text.num) infoDocument.numero = removeTags(response.text.num);
	}

	return infoDocument;
}