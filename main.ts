import { agentSearch } from 'api/utilities';
import { Editor, Plugin, WorkspaceLeaf } from 'obsidian';
import { RESEARCH_TEXT_VIEW, ResearchTextView } from 'views/researchText';
import { TEXT_READER_VIEW, textReaderView } from 'views/viewText';
import { documentDataStorage } from 'views/viewsData';
import { LegifranceSettings, DEFAULT_SETTINGS, LegifranceSettingTab } from 'settings/settings';
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { SEARCH_RESULT_VIEW, SearchResultView } from 'views/resultsView';
import { documentsListe, getAgentChercheur, getDocumentsListe, globalSettings, setAgentChercheur, setDocumentsListe, setGlobalSettings } from 'globals/globals';

interface dataJson {
	data: documentDataStorage[];
	settings: LegifranceSettings;
}

export default class LegifrancePlugin extends Plugin {
	static instance: LegifrancePlugin; 
	settings: LegifranceSettings;
	searchTab: ResearchTextView | null = null;
	instancesOfDocumentViews: number;
	activeLeaves: Set<number>;
	tabViewIdToShow: number;

	async onload() {
		LegifrancePlugin.instance = this;

		// Assigning global variables 
		setGlobalSettings(Object.assign({}, DEFAULT_SETTINGS, await this.loadData()))

		setAgentChercheur(new agentSearch(globalSettings))

		await this.loadSettings();
		this.activeLeaves = new Set();

		this.instancesOfDocumentViews = getDocumentsListe().length;
		this.tabViewIdToShow = -1;

		this.registerView(
			SEARCH_RESULT_VIEW,
			(leaf) => new SearchResultView(leaf)
		);

		this.registerView(
			RESEARCH_TEXT_VIEW,
			(leaf) => new ResearchTextView(this, leaf, getAgentChercheur())
		);

		this.registerView(
			TEXT_READER_VIEW,
			(leaf) => new textReaderView(leaf)
		);

		this.addRibbonIcon('scale', 'Légifrance', async (evt: MouseEvent) => {
			this.activateResearchTextView();
		});

		this.addCommand({
			id: 'lire-texte',
			name: 'Nouvelle recherche',
			callback: () => {
				this.activateResearchTextView();
			}
		});

		this.addCommand({
			id: "search-selection",
			name: "Chercher la sélection",
			editorCallback: (editor: Editor) => {
				const selection = editor.getSelection();
				const documentHandler = new documentSearchFieldsClass();

				documentHandler.updateValue(0, 0, selection);
				documentHandler.updateTypeRechercheChamp(0, 0, "EXACTE");
				documentHandler.updatingFond("ALL");
				documentHandler.launchSearch();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LegifranceSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', this.onActiveLeafChange.bind(this))
		);

	}

	onunload() {

	}

	handleLeafChange() {
		const leaves = this.app.workspace.getLeavesOfType(TEXT_READER_VIEW);
		const searchTab = this.getSearchTab();
		const currentActiveLeafIds = new Set(leaves.map(l => {
			const view = l.view as textReaderView;
			return view.document.id;
		}));

		// Check for removed leaves
		for (const id of this.activeLeaves) {
			if (!currentActiveLeafIds.has(id)) {
				// // console.log(`Leaf with ID ${id} has been closed`);
				this.activeLeaves.delete(id);
				if (searchTab) {
					searchTab.deleteActiveViewText();
					searchTab.onOpen();
				}
				const view = documentsListe.find(l => l.id == id);
				if (view) view.status = false;
			}
		}

		// Update the active leaves set
		this.activeLeaves = currentActiveLeafIds;
	}

	onActiveLeafChange() {
		const searchTab = this.getSearchTab();
		const activeLeaf = this.app.workspace.getActiveViewOfType(textReaderView);

		if (activeLeaf) {
			if (searchTab) {
				searchTab.setActiveViewText(activeLeaf);
			}
		}
		if (searchTab) searchTab.onOpen();

		this.handleLeafChange();
	}

	async loadSettings() {
		const data: dataJson = await this.loadData();
		console.log(data ? data : "No data yet.");
		
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ? data.settings : data);

		if (data && data.data.length > 0) setDocumentsListe(data.data);
		else setDocumentsListe([]);

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
			data: documentsListe,
			settings: this.settings
		}

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
			if (leaf) { await leaf.setViewState({ type: RESEARCH_TEXT_VIEW, active: true }); }
		}
		if (leaf) { workspace.revealLeaf(leaf); }
	}

	async activateTextReaderView() {
		if (documentsListe.length == 0) return;
		this.saveSettings();

		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		// Our view could not be found in the workspace, create a new leaf
		leaf = workspace.getLeaf(true);
		if (leaf) { await leaf.setViewState({ type: TEXT_READER_VIEW, active: true }); }
		if (leaf) { workspace.revealLeaf(leaf); }
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
			if (leaf) { await leaf.setViewState({ type: SEARCH_RESULT_VIEW, active: true }); }
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
			return searchTab
		}
		else return null;
	}
}







