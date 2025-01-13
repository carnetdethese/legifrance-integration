import { getDocumentInfo, legalDocument } from "abstracts/document";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { getAgentChercheur, getValeurRecherche } from "globals/globals";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { documentDataStorage } from "./viewsData";
import LegifrancePlugin from "main";

import { Root, createRoot } from "react-dom/client";
import { ResultsView } from "./components/results/ResultsView";
import { PluginContext } from "./context";

export const SEARCH_RESULT_VIEW = "search-result-view";

export class SearchResultView extends ItemView {
	doc: documentSearchFieldsClass;
	fond: string;
	resultatsComplet: legalDocument[];
	root: Root | null = null;
	plugin: LegifrancePlugin;

	constructor(leaf: WorkspaceLeaf, plugin: LegifrancePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	addDocument(docu: documentSearchFieldsClass) {
		this.doc = docu;
		return;
	}

	getViewType() {
		return SEARCH_RESULT_VIEW;
	}

	getDisplayText() {
		return "Résultats";
	}

	addFond(fond: string) {
		this.fond = fond;
	}

	async onOpen() {
		if (!this.doc) return;

		this.root = createRoot(this.containerEl.children[1]);

		this.root.render(
			<PluginContext.Provider value={this.plugin}>
				<h2>Résultats</h2>
				<PluginContext.Provider value={this.plugin}>
					<ResultsView searchHandler={this.doc} />
				</PluginContext.Provider>
			</PluginContext.Provider>
		);
	}

	async selectedDocument(id: string) {
		const pluginInstance = LegifrancePlugin.instance;
		const selectedDocument = this.resultatsComplet.find(
			(elt) => elt.id == id
		) as legalDocument;

		await getDocumentInfo(
			selectedDocument,
			getValeurRecherche(),
			getAgentChercheur()
		);

		const histoDocLength = this.plugin.historiqueDocuments.length;
		const docId =
			histoDocLength > 0 ? this.plugin.historiqueDocuments[-1].id + 1 : 1;
		const newView = new documentDataStorage(docId, selectedDocument);

		this.plugin.historiqueDocuments.push(newView);

		pluginInstance.instancesOfDocumentViews += 1;
		pluginInstance.activateTextReaderView();
	}

	async onClose() {
		this.root?.unmount();
	}
}
