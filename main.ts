import { agentSearch } from 'api/utilities';
import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { RESEARCH_TEXT_VIEW, ResearchTextView } from 'views/researchText';
import { critereTri } from 'api/constants';
import { TEXT_READER_VIEW, textReaderView } from 'views/viewText';
import { documentDataStorage } from 'views/viewsData';

interface dataJson {
	data:documentDataStorage[];
	settings:LegifranceSettings;
}

export interface LegifranceSettings {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	tokenHost: string;
	template: string;
	fileTitle:string;
	maxResults:number;
	critereTriSetting:string;
}

const DEFAULT_SETTINGS: LegifranceSettings = {
	clientId: '',
	clientSecret: '',
	apiHost: 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app',
	tokenHost: 'https://oauth.piste.gouv.fr',
	template: `---
date: {{date}}
juridiction: {{juridiction}}
formation: {{formation}}
nom: {{titre}}
apport: 
numero: {{numero}} 
citation: {{citation}}
lien: {{lien}}
contribution: {{contribution}}
tags: 
---

## Fiche et commentaire

### Fiche d'arrêt 

{{ faits }}

{{ procedure }}

{{ moyens }}

{{ question }}

{{ solution }}

### Commentaire

## Décision 

{{texteIntegral}}`,
	fileTitle: '{{id}}',
	maxResults: 20,
	critereTriSetting: critereTri.keys().next().value
}


export default class LegifrancePlugin extends Plugin {
	settings: LegifranceSettings;
	document:Array<documentDataStorage>;
	searchTab:ResearchTextView|null = null;
	instanceApiClient:agentSearch;
	instancesOfDocumentViews:number;
	activeLeaves:Set<number>;
	tabViewIdToShow:number;

	async onload() {
		await this.loadSettings();
		this.activeLeaves = new Set();

		this.instancesOfDocumentViews = this.document.length;
		this.tabViewIdToShow = -1;

		this.instanceApiClient = new agentSearch(this.settings);

		this.registerView(
			RESEARCH_TEXT_VIEW,
			(leaf) => new ResearchTextView(this, leaf, this.instanceApiClient)
		);

		this.registerView(
			TEXT_READER_VIEW,
			(leaf) => new textReaderView(this, leaf)
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
			id: 'debug',
			name:'debug',
			callback: () => {
				console.log(this.document);
			}
		})

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
                console.log(`Leaf with ID ${id} has been closed`);
                this.activeLeaves.delete(id);
				if (searchTab) {
					searchTab.deleteActiveViewText();
					searchTab.onOpen();
				};
				const view = this.document.find(l => l.id == id);
				if (view) view.status = false;
            }
        }

        // Update the active leaves set
        this.activeLeaves = currentActiveLeafIds;
    }

	onActiveLeafChange() {
		const searchTab = this.getSearchTab();
		const activeLeaf = this.app.workspace.getActiveViewOfType(textReaderView);

		if (activeLeaf){
			if (searchTab){
				searchTab.setActiveViewText(activeLeaf);
			}
		}
		if (searchTab) searchTab.onOpen();
		
		this.handleLeafChange();
	}

	async loadSettings() {
		const data:dataJson = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		if (data.data && data.data.length > 0) this.document = data.data;
		else this.document = [];

		if (this.instanceApiClient) {
			this.updateApiAgent(this.settings);
		}
	}

	updateApiAgent(settings:LegifranceSettings) {
		this.instanceApiClient.settings = settings;
		this.instanceApiClient.dilaApi.updateConfig(settings);
	}

	async saveSettings() {
		const data:dataJson = {
			data:this.document,
			settings:this.settings
		}

		await this.saveData(data);

		if (this.instanceApiClient) {
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
			if (leaf) { await leaf.setViewState({ type: RESEARCH_TEXT_VIEW, active: true });  }
		}
		if (leaf) { workspace.revealLeaf(leaf); }
	}

	async activateTextReaderView() {
		if (this.document.length == 0) return;
		this.saveSettings();

		const { workspace } = this.app;

		// const leaves = workspace.getLeavesOfType(TEXT_READER_VIEW);
		// for (let leaf of leaves) {
		// 	const textView: textReaderView = leaf.view as textReaderView;
		// 	console.log(textView.document.id);
		// }

		let leaf: WorkspaceLeaf | null = null;

		// Our view could not be found in the workspace, create a new leaf
		leaf = workspace.getLeaf(true);
		if (leaf) { await leaf.setViewState({ type: TEXT_READER_VIEW, active: true });  }
		if (leaf) { workspace.revealLeaf(leaf); }
	}

	getSearchTab():ResearchTextView | null {
		const leaves = this.app.workspace.getLeavesOfType(RESEARCH_TEXT_VIEW);
		let searchTab:ResearchTextView|null = null;

		if (leaves.length > 0) {
			searchTab = leaves[0].view as ResearchTextView;
			return searchTab
		}
		else return null;
	}
}

class LegifranceSettingTab extends PluginSettingTab {
	plugin: LegifrancePlugin;

	constructor(app: App, plugin: LegifrancePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Identifiant client (Client ID)')
			.setDesc('Client ID - créez un compte PISTE.')
			.addText(text => text
				.setPlaceholder('Entrez votre identifiant PISTE.')
				.setValue(this.plugin.settings.clientId)
				.onChange(async (value) => {
					this.plugin.settings.clientId = value;
					process.env.OAUTH_CLIENT_ID = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Clef secrète (Client secret)')
			.setDesc('Clef secrète (Client secret)')
			.addText(text => text
				.setPlaceholder('Entrez votre clef secrète PISTE.')
				.setValue(this.plugin.settings.clientSecret)
				.onChange(async (value) => {
					this.plugin.settings.clientSecret = value;
					process.env.OAUTH_CLIENT_SECRET = value;
					await this.plugin.saveSettings();
				}));
		
			
		new Setting(containerEl)
			.setName('Hôte API (API Host)')
			.setDesc('Hôte API (API Host)')
			.addText(text => text
				.setPlaceholder("Set API Host")
				.setValue(this.plugin.settings.apiHost)
				.onChange(async (value) => {
					this.plugin.settings.apiHost = value;
					process.env.API_HOST = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hôte Token (Token Host)')
			.setDesc('Hôte Token (Token Host)')
			.addText(text => text
				.setPlaceholder("Set Token Host")
				.setValue(this.plugin.settings.tokenHost)
				.onChange(async (value) => {
					this.plugin.settings.tokenHost = value;
					process.env.TOKEN_HOST = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl).setName("Personnalisation").setHeading();

		new Setting(containerEl)
			.setName('Modèle')
			.setDesc('Modèle')
			.addTextArea(text => text
				.setPlaceholder("Définissez le modèle de fiches ici.")
				.setValue(this.plugin.settings.template)
				.onChange(async (value) => {
					this.plugin.settings.template = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Nom du fichier')
			.setDesc('Nom du fichier')
			.addText(text => text
				.setPlaceholder("Set Token Host")
				.setValue(this.plugin.settings.fileTitle)
				.onChange(async (value) => {
					this.plugin.settings.fileTitle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Nombre de résultats maximum')
			.setDesc('Nombre de résultats maximum')
			.addSlider(cb => cb
				.setLimits(5, 50, 5)
				.setValue(this.plugin.settings.maxResults)
				.onChange(async (value) => {
					this.plugin.settings.maxResults = value;
					await this.plugin.saveSettings();
				})
				.setDynamicTooltip()
			);

		new Setting(containerEl)
			.setName('Tri des résultats')
			.addDropdown((triResultats) => {
				critereTri.forEach((value, key) => {
					triResultats.addOption(key, value)
				});
				triResultats
					.onChange(async (valeur) => {
					this.plugin.settings.critereTriSetting = valeur;
					await this.plugin.saveSettings();
				})
					.setValue(this.plugin.settings.critereTriSetting)
			});


		containerEl.createEl("h2", {text: "Dossiers"});

		new Setting(containerEl)
			.setName("Décisions")
			.addSearch(cb => cb)
	}
}





