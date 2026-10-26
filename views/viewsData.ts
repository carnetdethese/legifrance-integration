import { legalDocument } from "abstracts/document";

/** Entrée de l'historique, persistée dans `data.json`. */
export interface documentDataStorage {
	id: number;
	data: legalDocument;
}
