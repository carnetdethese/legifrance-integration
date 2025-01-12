import { agentSearch } from "api/utilities";
import { Editor, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { RESEARCH_TEXT_VIEW, ResearchTextView } from "views/researchText";
import { TEXT_READER_VIEW, textReaderView } from "views/viewText";
import { NOTE_TAKING_VIEW, noteTakingView } from "views/noteTakingView";
import { documentDataStorage } from "views/viewsData";
import {
	LegifranceSettings,
	DEFAULT_SETTINGS,
	LegifranceSettingTab,
} from "settings/settings";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { SEARCH_RESULT_VIEW, SearchResultView } from "views/resultsView";
import {
	getAgentChercheur,
	globalSettings,
	setAgentChercheur,
	setGlobalSettings,
} from "globals/globals";
import { legalDocument } from "abstracts/document";

interface dataJson {
	data: documentDataStorage[];
	settings: LegifranceSettings;
	activeLeaves: WorkspaceLeaf[];
}

export default class LegifrancePlugin extends Plugin {
	static instance: LegifrancePlugin;
	settings: LegifranceSettings;
	searchTab: ResearchTextView | null = null;
	instancesOfDocumentViews: number;
	activeLeaves: WorkspaceLeaf[];
	tabViewIdToShow: number;
	historiqueDocuments: documentDataStorage[];
	docToShow: documentDataStorage;

	async onload() {
		LegifrancePlugin.instance = this;
		// Assigning global variables
		setGlobalSettings(
			Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		);

		setAgentChercheur(new agentSearch(globalSettings));

		await this.loadSettings();
		console.log(this.activeLeaves);

		this.registerView(
			SEARCH_RESULT_VIEW,
			(leaf) => new SearchResultView(leaf, this)
		);

		this.registerView(
			RESEARCH_TEXT_VIEW,
			(leaf) => new ResearchTextView(this, leaf, getAgentChercheur())
		);

		this.registerView(
			TEXT_READER_VIEW,
			(leaf) => new textReaderView(leaf, this)
		);

		this.registerView(
			NOTE_TAKING_VIEW,
			(leaf) => new noteTakingView(leaf, this)
		);

		this.addRibbonIcon("scale", "Légifrance", async (evt: MouseEvent) => {
			this.activateResearchTextView();
		});

		this.addCommand({
			id: "nouvelle-recherche",
			name: "Nouvelle recherche",
			callback: () => {
				this.activateResearchTextView();
			},
		});

		this.addCommand({
			id: "search-selection",
			name: "Chercher la sélection",
			editorCallback: (editor: Editor) => {
				new Notice("En maintenance.");
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LegifranceSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on(
				"active-leaf-change",
				this.handleLeafChange.bind(this)
			)
		);

		this.app.workspace.onLayoutReady(async () => {
			this.app.workspace.detachLeavesOfType(TEXT_READER_VIEW);
			this.app.workspace.detachLeavesOfType(SEARCH_RESULT_VIEW);
		});
	}

	onunload() {}

	async reopenTabs() {
		for (const leaf of this.activeLeaves) {
			const leafView = leaf.view as textReaderView;
			this.docToShow = leafView.document;
			this.activateTextReaderView();
		}
	}

	handleLeafChange() {
		const leaves = this.app.workspace.getLeavesOfType(TEXT_READER_VIEW);
		// Check for removed leaves
		for (const leaf of this.activeLeaves) {
			if (!leaves.includes(leaf)) {
				this.activeLeaves.remove(leaf);
			}
		}
	}

	async loadSettings() {
		const data: dataJson = await this.loadData();

		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data ? data.settings : data
		);

		if (data && data.data.length > 0) this.historiqueDocuments = data.data;
		else this.historiqueDocuments = [];

		if (data && data.activeLeaves.length > 0)
			this.activeLeaves = data.activeLeaves;
		else this.activeLeaves = [];

		console.log(data.activeLeaves);

		if (getAgentChercheur()) {
			this.updateApiAgent(this.settings);
		}
	}

	updateApiAgent(settings: LegifranceSettings) {
		getAgentChercheur().settings = settings;
		getAgentChercheur().dilaApi.updateConfig(settings);
	}

	async saveSettings() {
		const data: dataJson = {
			data: this.historiqueDocuments,
			settings: this.settings,
			activeLeaves: this.activeLeaves,
		};

		await this.saveData(data);

		if (getAgentChercheur()) {
			this.updateApiAgent(this.settings);
		}
	}

	async activateResearchTextView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(RESEARCH_TEXT_VIEW);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: RESEARCH_TEXT_VIEW,
					active: true,
				});
			}
		}
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async activateTextReaderView() {
		if (this.historiqueDocuments.length == 0) return;

		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;

		const leaves = this.app.workspace.getLeavesOfType(TEXT_READER_VIEW);

		for (const leaf of leaves) {
			const leafView = leaf.view as textReaderView;
			if (leafView.document == this.docToShow) {
				workspace.revealLeaf(leaf);
				return;
			}
		}

		// Our view could not be found in the workspace, create a new leaf
		leaf = workspace.getLeaf(true);
		this.activeLeaves.push(leaf);

		if (leaf) {
			await leaf.setViewState({ type: TEXT_READER_VIEW, active: true });
			workspace.revealLeaf(leaf);
		}

		this.saveSettings();
	}

	async activateNoteTakingView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(NOTE_TAKING_VIEW);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getLeaf('tab') as WorkspaceLeaf;
			await leaf.setViewState({ type: NOTE_TAKING_VIEW, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		workspace.revealLeaf(leaf);
	}

	async activateResultsView(searchFields: documentSearchFieldsClass) {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(SEARCH_RESULT_VIEW);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeaf(true);
			if (leaf) {
				await leaf.setViewState({
					type: SEARCH_RESULT_VIEW,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
			const view = leaf.view as SearchResultView;
			view.addDocument(searchFields);
			view.onOpen();
		}
	}

	getSearchTab(): ResearchTextView | null {
		const leaves = this.app.workspace.getLeavesOfType(RESEARCH_TEXT_VIEW);
		let searchTab: ResearchTextView | null = null;

		if (leaves.length > 0) {
			searchTab = leaves[0].view as ResearchTextView;
			return searchTab;
		} else return null;
	}
}
