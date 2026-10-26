import { DilaApiClient } from "api/client";
import { LegifranceSettings } from "settings/settings";
import { listRouteConsult } from "./constants";
import { rechercheAvStructure } from "abstracts/searches";
import { legalDocument } from "abstracts/document";

/** Façade au-dessus du client API : recherche et consultation de documents. */
export class agentSearch {
	dilaApi: DilaApiClient;

	constructor(settings: LegifranceSettings) {
		this.dilaApi = new DilaApiClient(settings);
	}

	/** Lance une recherche avancée (`/search`). */
	advanceSearchText<T = object>(search: rechercheAvStructure) {
		return this.dilaApi.fetch<T>({ path: "/search", params: search });
	}

	/** Récupère le contenu complet d'un document via la route propre à son origine. */
	fetchText<T = object>(texte: legalDocument, valeurRecherche: string) {
		return this.dilaApi.fetch<T>({
			path: this.getPathID(texte.origin) as string,
			params: this.defineParamConsult(valeurRecherche, texte),
		});
	}

	getPathID(origin: string) {
		return listRouteConsult.get(origin.substring(0, 4));
	}

	/** Construit le corps de la requête de consultation selon le type de document. */
	defineParamConsult(valeurRecherche: string, document: legalDocument) {
		if (
			document.nature == "CODE" ||
			document.fond == "ACCO" ||
			document.fond == "CIRC" ||
			document.fond == "KALI"
		) {
			return { id: document.id, searchedString: valeurRecherche };
		}
		if (document.origin == "JORF") {
			return { textCid: document.cid, searchedString: valeurRecherche };
		}
		if (document.origin == "LEGI") {
			return {
				textId: document.id,
				date: document.date,
				searchedString: valeurRecherche,
			};
		}
		return { textId: document.id, searchedString: valeurRecherche };
	}
}
