import { LegalDocument } from "abstracts/document";

/** Entrée de l'historique, persistée dans `data.json`. */
export interface DocumentData {
	id: number;
	data: LegalDocument;
}
