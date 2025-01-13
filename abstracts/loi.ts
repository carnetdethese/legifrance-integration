import { removeTags, replaceParaTags } from "lib/tools";
import { legalDocument } from "./document";
import { agentSearch } from "api/utilities";
import { reponseDocument } from "./searches";


export async function getConvCollInfo(doc: legalDocument, valeurRecherche: string, apiClient: agentSearch): Promise<legalDocument> {

	const response = await apiClient.fetchText(doc, valeurRecherche) as legalDocument;

	const infoDocument: legalDocument = doc;
	infoDocument.texteIntegral = "";

	infoDocument.texteIntegral += triArticles(response, infoDocument);
	infoDocument.texteIntegral = replaceParaTags(infoDocument.texteIntegral);


	return infoDocument;
}

export async function getCirculaireInfo(document: legalDocument, valeurRecherche: string, apiClient: agentSearch): Promise<legalDocument | undefined> {

	const response = await apiClient.fetchText(document, valeurRecherche) as reponseDocument; // requête à l'API

	const infoDocument: legalDocument = document;

	infoDocument.motsCles = response.circulaire?.motsCles;
	infoDocument.motsClesLibres = response.circulaire?.motsClesLibres;
	infoDocument.auteur = response.circulaire?.auteur;

	infoDocument.attachment = response.circulaire?.attachment

	return infoDocument;
}

export async function getStatuteInfo(document: legalDocument, valeurRecherche: string, apiClient: agentSearch): Promise<legalDocument> {

	const response = await apiClient.fetchText(document, valeurRecherche) as legalDocument; // requête à l'API

	const infoDocument: legalDocument = document;
	infoDocument.titre = removeTags(infoDocument.titre);
	infoDocument.texteIntegral = "";

	if (response.visa) {
		const formattedVisa = response.visa.replace(/<br\s*\/?>/gi, '\n');
		infoDocument.texteIntegral += `${formattedVisa}\n`;
	}

	// Tri des sections en fonction du numéro des articles. Les réponses qui sortent de l'API sont mélangées.

	infoDocument.texteIntegral += triArticles(response, infoDocument);

	if (response.jorfText && response.jorfText != "") {
		infoDocument.numero = response.jorfText
	}
	else {
		infoDocument.numero = "Sans numéro"
	}

	infoDocument.texteIntegralHTML = infoDocument.texteIntegral;
	infoDocument.texteIntegral = replaceParaTags(infoDocument.texteIntegral);

	return infoDocument;
}


export function triArticles(response: legalDocument, infoDocument: legalDocument) {

	// Tri des sections en fonction du numéro des articles. Les réponses qui sortent de l'API sont mélangées.
	response.sections?.sort((a, b) => {
		if (a.articles && b.articles) {
			const minNumA = Math.min(...a.articles.map(article => article.num as number));
			const minNumB = Math.min(...b.articles.map(article => article.num as number));
			return minNumA - minNumB;
		}
		else return 0
	})

	if (response.articles && response.articles.length > 0) {
		for (const elt of response.articles) {
			if (elt.num) infoDocument.texteIntegral += `## ${elt.num}\n`;
			if (elt.content) infoDocument.texteIntegral += `${elt.content}\n`;
		}
	}

	if (response.sections && response.sections.length > 0) {
		// Temporary variable to hold the "Préambule" content
		let preambleContent = '';

		for (const section of response.sections) {
			if (section.title) {
				// Check if the section title is "Préambule"
				if (section.title === "Préambule") {
					// Prepare the preamble content
					preambleContent += `## ${section.title}\n`;

					// Loop through articles to get num and content
					if (section.articles) {
						for (const art of section.articles) {
							if (art.num) {
								preambleContent += `### ${art.num}\n`;
							}
							if (art.content) {
								preambleContent += `${art.content}\n`;
							}
						}
					}
					// Continue to the next section without adding it to the main content
					continue;
				} else {
					// For other sections, add the title to the main content
					infoDocument.texteIntegral += `## ${section.title}\n`;
				}
			}

			if (section.articles) {
				for (const art of section.articles) {
					if (art.num) infoDocument.texteIntegral += `### ${art.num}\n`;
					if (art.content) infoDocument.texteIntegral += `${art.content}\n`;
				}
			}
		}

		// Prepend the "Préambule" content to the main text
		infoDocument.texteIntegral = preambleContent + infoDocument.texteIntegral;
	}

	return infoDocument.texteIntegral;
}
