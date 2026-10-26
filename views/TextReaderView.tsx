import { ViewStateResult } from "obsidian";
import { ReactNode } from "react";
import { removeTags } from "lib/tools";
import { ReaderView } from "./components/reader/ReaderView";
import { ReactItemView } from "./ReactItemView";
import { documentDataStorage } from "./viewsData";

export const TEXT_READER_VIEW = "text-reader-view";

interface ReaderState extends Record<string, unknown> {
	docId?: string;
}

/**
 * Lecteur d'un document de l'historique.
 *
 * Le document est identifié par son id dans l'état de la vue (`getState` /
 * `setState`) : Obsidian restaure donc les onglets ouverts au redémarrage.
 */
export class TextReaderView extends ReactItemView {
	document?: documentDataStorage;

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
		return { docId: this.document?.data.id };
	}

	async setState(state: ReaderState, result: ViewStateResult) {
		this.document = this.plugin.historiqueDocuments.find(
			(doc) => doc.data.id === state?.docId
		);
		await super.setState(state, result);
		this.update();
	}

	protected renderContent(): ReactNode {
		return this.document ? (
			<ReaderView data={this.document.data} />
		) : (
			<p className="legifrance-empty">
				Ce document ne figure plus dans l'historique.
			</p>
		);
	}
}
