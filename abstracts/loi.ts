import { removeTags, replaceParaTags } from "lib/tools";
import { legalDocument } from "./document";
import { agentSearch } from "api/utilities";

export interface legalStatute extends legalDocument {
    titre:string
    jurisDate?:string;
    jorfText?:string;
    articles?:statuteArticles[];
    sections?:statuteSections[]
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

export async function getStatuteInfo(document:legalStatute, valeurRecherche:string, apiClient:agentSearch):Promise<legalStatute> {
	const response:legalStatute = await apiClient.fetchText(document, valeurRecherche) as legalStatute; // requête à l'API
    let infoDocument:legalStatute = document;
    infoDocument.titre = removeTags(infoDocument.titre);
    infoDocument.texteIntegral = "";

    console.log(response);

    // Tri des sections en fonction du numéro des articles. Les réponses qui sortent de l'API sont mélangées.
    response.sections?.sort((a,b) => {
        const minNumA = Math.min(...a.articles.map(article => article.num as number));
        const minNumB = Math.min(...b.articles.map(article => article.num as number));
        return minNumA - minNumB;
    })

    if (response.articles && response.articles.length > 0) {
        for (let elt of response.articles) {
            if (elt.num) infoDocument.texteIntegral += `## ${elt.num}\n`;
            if (elt.content) infoDocument.texteIntegral += `${elt.content}\n`;
        }
    }

    if (response.sections && response.sections.length > 0) {
        for (let section of response.sections) {
            if (section.title) infoDocument.texteIntegral += `## ${section.title}\n`;
            for (let art of section.articles) {
                if (art.num) infoDocument.texteIntegral += `### ${art.num}\n`;
                if (art.content) infoDocument.texteIntegral += `${art.content}\n`;
            }
        }
    }

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