import { agentSearch } from 'api/utilities';
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { SearchCaseModal } from 'modals/SearchModal';

// Remember to rename these classes and interfaces!

export interface LegifranceIntegrationSettings {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	tokenHost: string;
	template: string;
	fileTitle:string;
	maxResults:number;
}

const DEFAULT_SETTINGS: LegifranceIntegrationSettings = {
	clientId: '',
	clientSecret: '',
	apiHost: '',
	tokenHost: '',
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
	
	{{decision}}`,
	fileTitle: '{{annee}}',
	maxResults: 20
}


export default class LegifranceIntegrationPlugin extends Plugin {
	settings: LegifranceIntegrationSettings;

	async onload() {
		await this.loadSettings();
		const instanceApiClient:agentSearch = new agentSearch(this.settings);

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('scale', 'Légifrance intégration', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new SearchCaseModal(this.app, this.settings, instanceApiClient).open();
		});

		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a simple command that can be triggered anywhere
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
}

class LegifranceSettingTab extends PluginSettingTab {
	plugin: LegifranceIntegrationPlugin;

	constructor(app: App, plugin: LegifranceIntegrationPlugin) {
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
	}
}





