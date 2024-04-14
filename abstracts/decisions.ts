import { fetchText } from "api/utilities";
import { htmlToMarkdown } from "obsidian";
import { upperFirst, lowerCase } from "lodash";

export interface Decision {
	titre: string;
	id: string;
	texte: string;
	lien: string;
	origin: string;
	texteIntegral?: string;
	numero?: string;
	date?: string;
	annee?:number;
	juridiction?:string;
	formation?: string;
	solution?: string; // solution de la décision
	urlCC?: string; // Lien vers le site du Conseil constitutionnel
	sommaires?: Sommaire[];
}

interface Sommaire {
	resume:string;
}

const codeFond = new Map<string, string>([
	["CETAT", "/ceta/id/"],
	["CONSTIT", "/cons/id/"],
	["JURI", "/juri/id/"]
]);

export const codeJuridiction = new Map<string, string>([
	["CONSEIL_ETAT", "Conseil d'État"],
	["Conseil constitutionnel", "Conseil constitutionnel"],
	["Cour de cassation", "Cour de cassation"],
	["COURS_APPEL", "Cour d'appel"]
]);

const baseUrl = "https://www.legifrance.gouv.fr"

export function findLink(origine:string, id:string) {
	return baseUrl + codeFond.get(origine) + id	
}

export async function getDecisionInfo(decision:Decision, valeurRecherche:string) {
	// objet Decision qui récupère une copie de l'objet passé en argument
	const infoDecision:Decision = decision;

	// Variable qui contient la réponse de la requête 
	const response = await fetchText(decision.id, valeurRecherche); // requête à l'API

	console.log(response);

	// Texte intégral au format markdown
	infoDecision.texteIntegral = htmlToMarkdown(response.text.texteHtml);

	// Date au format YYYY-MM-DD
	const dateDec = new Date(response.text.dateTexte)
	const formattedDate = dateDec.toISOString().split('T')[0];
	infoDecision.date = formattedDate;
	infoDecision.annee = dateDec.getFullYear();

	// Juridiction - je passe par une variable Map parce que certaines juridiction ne sont pas formattées comme je le veux !
	infoDecision.juridiction = upperFirst(lowerCase(response.text.natureJuridiction.replace("_", " ")));

	// La formation de la juridiction
	infoDecision.formation = upperFirst(lowerCase(response.text.formation.replace("_", " ")));

	// La solution 
	infoDecision.solution = response.text.solution;

	// Tentative d'implantation des sommaires
	infoDecision.sommaires = [];

	response.text.sommaire.forEach(elt => {
	if (elt.resumePrincipal) {
		const content = elt.resumePrincipal;
		infoDecision.sommaires.push({
			resume: content
		});
	}});

	// Numéro de la décision. Si c'est le Conseil constitutionnel - on affiche "numéro natureContrôle".
	if (decision.origin == "CONSTIT") {
		infoDecision.numero = `${response.text.num} ${response.text.nature}`;
		infoDecision.urlCC = response.text.urlCC;
	}
	else {
		infoDecision.numero = response.text.num;
	}

	return infoDecision
}