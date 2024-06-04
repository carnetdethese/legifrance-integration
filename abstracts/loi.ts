import { replaceParaTags } from "lib/tools";
import { legalDocument } from "./document";
import { agentSearch } from "api/utilities";

export interface legalStatute extends legalDocument {
    titre:string
    jurisDate?:string;
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
    let orderedList:Array<Array<string>> = [];

    infoDocument.texteIntegral = "";

    response.sections?.sort((a,b) => {
        const minNumA = Math.min(...a.articles.map(article => article.num as number));
        const minNumB = Math.min(...b.articles.map(article => article.num as number));
        return minNumA - minNumB;
    })

    console.log(response.sections);

    if (response.articles) {
        for (let elt of response.articles) {
            infoDocument.texteIntegral += `
## ${elt.num}

${elt.content}`
        }
    }

    if (response.sections) {
        for (let section of response.sections) {
            orderedList.push(["hey", "hello"]);
        }
    }

    if (response.sections) {
        for (let section of response.sections) {
            infoDocument.texteIntegral += `## ${section.title}

            `
            for (let art of section.articles) {
                infoDocument.texteIntegral += `
### ${art.num}

${art.content}`
            }
        }
    }

    infoDocument.texteIntegralHTML = infoDocument.texteIntegral;
    infoDocument.texteIntegral = replaceParaTags(infoDocument.texteIntegral);

    console.log(infoDocument.texteIntegral);

    return infoDocument;
}