/**
 * Onglet de lecture d'un document : un document de l'historique (`docId`, consulté sur l'API) ou un texte déjà dans
 * la base (`storedId` : décision, article, texte). L'état de l'onglet est restauré par Obsidian au redémarrage.
 */
import { ViewStateResult } from "obsidian";
import { ReactNode } from "react";
import { removeTags } from "lib/tools";
import { storedLegalDocument } from "references/stored";
import { ReaderView } from "./components/reader/ReaderView";
import { ReactItemView } from "./ReactItemView";
import { DocumentData } from "./viewsData";

export const TEXT_READER_VIEW = "text-reader-view";

interface ReaderState extends Record<string, unknown> {
	/** Document de l'historique. */
	docId?: string;
	/** Document de la base de données (décision, article, texte), par son identifiant ou son adresse. */
	storedId?: string;
}

/**
 * Lecteur d'un document : de l'historique de la recherche, ou de la base de données.
 *
 * Le document est identifié dans l'état de la vue (`getState` / `setState`) : Obsidian restaure
 * donc les onglets ouverts au redémarrage.
 */
export class TextReaderView extends ReactItemView {
	document?: DocumentData;
	private storedId?: string;

	getViewType() {
		return TEXT_READER_VIEW;
	}

	getDisplayText() {
		return this.document ? removeTags(this.document.data.titre) : "Document";
	}

	getIcon() {
		return "scroll-text";
	}

	getState(): ReaderState {
		return this.storedId ? { storedId: this.storedId } : { docId: this.document?.data.id };
	}

	async setState(state: ReaderState, result: ViewStateResult) {
		this.storedId = state?.storedId;
		if (this.storedId) {
			const data = storedLegalDocument(this.plugin, this.storedId);
			this.document = data ? { id: 0, data } : undefined;
		} else {
			this.document = this.plugin.historiqueDocuments.find((doc) => doc.data.id === state?.docId);
		}
		await super.setState(state, result);
		this.update();
	}

	protected renderContent(): ReactNode {
		return this.document ? (
			<ReaderView data={this.document.data} />
		) : (
			<p className="legifrance-empty">
				{this.storedId ? "Ce document n'est plus dans la base de données." : "Ce document ne figure plus dans l'historique."}
			</p>
		);
	}
}
