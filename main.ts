import { agentSearch } from 'api/utilities';
import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { SearchCaseModal } from 'modals/SearchModal';
import { RESEARCH_TEXT_VIEW, LegalTextView } from 'views/researchText';
import { critereTri } from 'api/constants';
import { TEXT_READER_VIEW, textReaderView } from 'views/viewText';
import { resultsRequest } from 'modals/ShowModal';
import { Decision } from 'abstracts/decisions';

export interface LegifranceSettings {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	tokenHost: string;
	template: string;
	fileTitle:string;
	maxResults:number;
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
tags: 
---

## Fiche et commentaire

### Fiche d'arrêt 

### Commentaire

## Décision 

{{texteIntegral}}`,
	fileTitle: '{{id}}',
	maxResults: 20
}


export default class LegifrancePlugin extends Plugin {
	settings: LegifranceSettings;
	decision:Decision;

	async onload() {
		await this.loadSettings();
		const instanceApiClient:agentSearch = new agentSearch(this.settings);

		this.registerView(
			RESEARCH_TEXT_VIEW,
			(leaf) => new LegalTextView(this, leaf, instanceApiClient)
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
			name: 'Lire texte',
			callback: () => {
				this.activateTextReaderView();
			}
		});


		this.addCommand({
			id: 'create-note-legi',
			name: 'Créer une nouvelle fiche juridique.',
			callback: () => {
				new SearchCaseModal(this.app, this.settings, instanceApiClient).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LegifranceSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
		const { workspace } = this.app;
	
		let leaf: WorkspaceLeaf | null = null;
	
		// Our view could not be found in the workspace, create a new leaf
		// in the right sidebar for it
		leaf = workspace.getLeaf(true);
		if (leaf) { await leaf.setViewState({ type: TEXT_READER_VIEW, active: true });  }
		if (leaf) { workspace.revealLeaf(leaf); }
		
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
			.setName('Client ID')
			.setDesc('Client ID - créez un compte PISTE.')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.clientId)
				.onChange(async (value) => {
					this.plugin.settings.clientId = value;
					process.env.OAUTH_CLIENT_ID = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Client Secret')
			.setDesc('Client Secret.')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.clientSecret)
				.onChange(async (value) => {
					this.plugin.settings.clientSecret = value;
					process.env.OAUTH_CLIENT_SECRET = value;
					await this.plugin.saveSettings();
				}));
		
			
		new Setting(containerEl)
			.setName('API Host')
			.setDesc('API Host')
			.addText(text => text
				.setPlaceholder("Set API Host")
				.setValue(this.plugin.settings.apiHost)
				.onChange(async (value) => {
					this.plugin.settings.apiHost = value;
					process.env.API_HOST = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Token Host')
			.setDesc('Token Host')
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
			.setName('Template')
			.setDesc('Template')
			.addTextArea(text => text
				.setPlaceholder("Set template here.")
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
			.setName('Tri des résults')
			.addDropdown((triResultats) => {
				critereTri.forEach((value, key) => {
					triResultats.addOption(key, value)
				});
			});


		containerEl.createEl("h2", {text: "Dossiers"});

		new Setting(containerEl)
			.setName("Décisions")
			.addSearch(cb => cb)
	}
}





