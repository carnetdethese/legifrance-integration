/**
 * Fiche d'une décision de justice trouvée par une recherche : son texte et ses métadonnées sont demandés à
 * l'API (`LegifranceApi.consultDecision`) et reportés sur le `LegalDocument`.
 */
import type { LegifranceApi } from "api/legifrance";
import { removeTags } from "lib/tools";
import { htmlToMarkdown } from "obsidian";
import { LegalDocument, DocumentSummary } from "./document";
import { DocumentResponse } from "./searches";

/** Nom de juridiction d'après le code de l'API (certains codes ne sont pas présentables tels quels). */
export const codeJuridiction = new Map<string, string>([
	["CONSEIL_ETAT", "Conseil d'État"],
	["Conseil constitutionnel", "Conseil constitutionnel"],
	["Cour de cassation", "Cour de cassation"],
	["COURS_APPEL", "Cour d'appel"],
]);

/**
 * Complète `document` (modifié sur place) avec la réponse de l'API : titre, texte intégral (HTML et Markdown),
 * date (AAAA-MM-JJ), juridiction, formation, sommaires, numéro. `search` est le terme à surligner dans le texte.
 * Pour le Conseil constitutionnel, le numéro est suivi de la nature du contrôle (« 2018-765 DC ») et le lien
 * vers le site du Conseil est conservé.
 *
 * @returns le document complété, ou `undefined` si la réponse ne contient pas de texte.
 */
export async function getDecisionInfo(document: LegalDocument, search: string, api: LegifranceApi): Promise<LegalDocument | undefined> {
	const response = await api.consultDecision<DocumentResponse>(document.id, { searchedString: search, cnil: document.origin === "CNIL" });

	document.titre = removeTags(document.titre);
	const text = response.text;
	if (!text) return undefined;

	document.texteIntegralHTML = text.texteHtml;
	if (text.texteHtml) document.texteIntegral = htmlToMarkdown(text.texteHtml);

	if (text.dateTexte) {
		const date = new Date(text.dateTexte);
		document.date = date.toISOString().split("T")[0];
		document.annee = date.getFullYear();
	}

	if (text.natureJuridiction != null) document.juridiction = codeJuridiction.get(text.natureJuridiction);
	if (text.formation != null) document.formation = text.formation;

	if (document.sommaires !== undefined) {
		for (const entry of text.sommaire ?? ([] as DocumentSummary[])) {
			if (entry.resumePrincipal) document.sommaires.push({ resume: entry.resumePrincipal });
		}
	}

	if (text.num) {
		const number = removeTags(text.num);
		document.numero = document.origin === "CONSTIT" ? `${number} ${text.nature}` : number;
	}
	if (document.origin === "CONSTIT") document.urlCC = text.urlCC;

	return document;
}
