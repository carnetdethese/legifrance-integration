import { ItemView, WorkspaceLeaf } from "obsidian";
import { agentSearch } from "api/utilities";
import { champsRechercheAvancees } from "abstracts/searches";
import LegifrancePlugin from "main";
import { textReaderView } from "./viewText";
import { resultatsRecherche } from "abstracts/searches";
import { documentHandlerView } from "abstracts/searchHandler";
import { dateHandler } from "lib/dateHandler";

import { Root, createRoot } from "react-dom/client";
import { ResearchView } from "./components/search/ResearchView";
import { PluginContext } from "./context"

export const RESEARCH_TEXT_VIEW = "research-text-view";

export class ResearchTextView extends ItemView {
	documentFields: documentHandlerView;
	dateRecherche: dateHandler;
	recherche: champsRechercheAvancees;
	compteur: number;
	agentChercheur: agentSearch;
	searchResult: resultatsRecherche;
	activeResearchType: string;
	headerDiv: HTMLElement;
	listResults: HTMLElement;
	rechercheDiv: HTMLElement;
	valeurRecherche: string;
	plugin: LegifrancePlugin;
	activeViewLeaf: textReaderView | null;
	root: Root | null = null;

	constructor(
		plugin: LegifrancePlugin,
		leaf: WorkspaceLeaf,
		agentChercheur: agentSearch
	) {
		super(leaf);
		this.compteur = 0;
		this.agentChercheur = agentChercheur;
		this.plugin = plugin;
		this.dateRecherche = new dateHandler(this);
		this.documentFields = new documentHandlerView(this);
	}

	getViewType() {
		return RESEARCH_TEXT_VIEW;
	}

	getDisplayText() {
		return "Légifrance";
	}

	setActiveViewText(view: textReaderView) {
		this.activeViewLeaf = view;
		return this.activeViewLeaf;
	}

	deleteActiveViewText() {
		this.activeViewLeaf = null;
	}

	async onOpen() {
		// initializing the view
		this.root = createRoot(this.containerEl.children[1]);

		this.root.render(
				<PluginContext.Provider value={this.plugin}>
					<ResearchView />
				</PluginContext.Provider>
		);
	}

	async onClose() {
		this.root?.unmount();
	}

}
