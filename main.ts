import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

export interface LegifranceIntegrationSettings {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	tokenHost: string;
	template: string;
	fileTitle:string;
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
	fileTitle: '{{annee}}'
}

export default class LegifranceIntegrationPlugin extends Plugin {
	settings: LegifranceIntegrationSettings;

	async onload() {
		await this.loadSettings();
		process.env.OAUTH_CLIENT_ID = this.settings.clientId;
		process.env.OAUTH_CLIENT_SECRET = this.settings.clientSecret;
		process.env.API_HOST = this.settings.apiHost;
		process.env.TOKEN_HOST = this.settings.tokenHost;

		const { searchText } = await import('api/utilities');
		const { SearchCaseModal } = await import('modals/SearchModal');

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('scale', 'Légifrance intégration', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			const untitledFile = this.app.vault.getAbstractFileByPath("Untitled.md");
			const wsLeaf = this.app.workspace.getLeaf();
			console.log(untitledFile);
			wsLeaf.openFile(untitledFile);
		});

		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create-note-legi',
			name: 'Créer une nouvelle fiche juridique.',
			callback: () => {
				new SearchCaseModal(this.app, this.settings).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LegifranceSettingTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
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
	}
}





