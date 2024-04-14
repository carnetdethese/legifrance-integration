import { fetchText } from "api/utilities";
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
	juridiction?:string;
	formation?: string;
	solution?: string; // solution de la décision
	urlCC?: string; // Lien vers le site du Conseil constitutionnel
	sommaires?: Sommaire;
}

interface Sommaire {
	resume:string;
}

const codeFond = new Map<string, string>([
	["CETAT", "/ceta/id/"],
	["CONSTIT", "/cons/id/"],
	["JURI", "/juri/id/"]
]);

const codeJuridiction = new Map<string, string>([
	["CONSEIL_ETAT", "Conseil d'État"],
	["Conseil constitutionnel", "Conseil constitutionnel"],
	["Cour de cassation", "Cour de cassation"]
]);

const baseUrl = "https://www.legifrance.gouv.fr"

export function findLink(origine:string, id:string) {
	return baseUrl + codeFond.get(origine) + id	
}

export async function getDecisionInfo(decision:Decisions, valeurRecherche:string) {
	// objet Decision qui récupère une copie de l'objet passé en argument
	let infoDecision:Decisions = decision;

	// Variable qui contient la réponse de la requête 
	let response:object;
	response = await fetchText(decision.id, valeurRecherche); // requête à l'API

	console.log(response);

	// Texte intégral au format markdown
	infoDecision.texteIntegral = htmlToMarkdown(response.text.texteHtml);

	// Date au format YYYY-MM-DD
	const dateDec = new Date(response.text.dateTexte)
	const formattedDate = dateDec.toISOString().split('T')[0];
	infoDecision.date = formattedDate;
	console.log(formattedDate);

	// Juridiction - je passe par une variable Map parce que certaines juridiction ne sont pas formattées comme je le veux !
	infoDecision.juridiction = codeJuridiction.get(response.text.natureJuridiction);

	// La formation de la juridiction
	infoDecision.formation = response.text.formation;

	// La solution 
	infoDecision.solution = response.text.solution;

	// Tentative d'implantation des sommaires
	if (response.text.sommaires) {
		response.text.sommaires.forEach(elt => {
			if (elt.resumePrincipal) {
				infoDecision.sommaires.push({
					resume: elt.resumePrincipal
				})
			}
		});
	}


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