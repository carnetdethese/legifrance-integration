import { PluginSettingTab, TAbstractFile, Setting, App } from "obsidian";
import { FolderSuggest } from "lib/folderSugget";
import LegifrancePlugin from "main";


export interface LegifranceSettings {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	tokenHost: string;
	templateDecision: string;
	templateDocument:string;
	fileTitle:string;
	maxResults:number;
	dossierBase:string;
	pageResultats:boolean;
}

export const DEFAULT_SETTINGS: LegifranceSettings = {
	clientId: '',
	clientSecret: '',
	apiHost: 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app',
	tokenHost: 'https://oauth.piste.gouv.fr',
	templateDecision: `---\ndate: {{date}}\njuridiction: {{juridiction}}\nformation: {{formation}}\nnom: {{titre}}\napport: \nnumero: {{numero}} \ncitation: {{citation}}\nlien: {{lien}}\ncontribution: {{contribution}}\ntags: \n---\n\n## Fiche et commentaire\n\n### Fiche d'arrêt \n\n{{ faits }}\n\n{{ procedure }}\n\n{{ moyens }}\n\n{{ question }}\n\n{{ solution }}\n\n### Commentaire\n\n## Décision \n\n{{texteIntegral}}`,
	templateDocument: `---\ndate: {{date}}\norigine: {{origine}}\nnom: {{titre}}\napport: \nnumero: {{numero}} \nlien: {{lien}}\ncontribution: {{contribution}}\ntags: \n---\n\n## Notes\n\n## Document\n\n{{texteIntegral}}`,
	fileTitle: '{{id}}',
	maxResults: 25,
	dossierBase: "/",
	pageResultats: false
}


export class LegifranceSettingTab extends PluginSettingTab {

	plugin: LegifrancePlugin;
	filesFolders:Array<TAbstractFile>;
	app:App;

	constructor(app: App, plugin: LegifrancePlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.app = app;
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
			.setName('Modèle de fiche d\'arrêt')
			.setDesc('Note d\'arrêt')
			.addTextArea(text => {text
				.setPlaceholder("Définissez le modèle de fiches ici.")
				.setValue(this.plugin.settings.templateDecision)
				.onChange(async (value) => {
					this.plugin.settings.templateDecision = value;
					await this.plugin.saveSettings();
				});
				text.inputEl.style.width = "400px";
				text.inputEl.style.height = "200px";
			}
			);

		new Setting(containerEl)
			.setName('Modèle de note de document (en développement)')
			.setDesc('Autre document juridique')
			.addTextArea(text => {
				text
				.setDisabled(true)
				.setPlaceholder("Définissez le modèle de fiches ici.")
				.setValue(this.plugin.settings.templateDocument)
				.onChange(async (value) => {
					this.plugin.settings.templateDocument = value;
					await this.plugin.saveSettings();
				});

				text.inputEl.style.width = "400px";
				text.inputEl.style.height = "200px";
			}
			);

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
			.addDropdown(cb => {
				cb
					.addOptions({
						"10": "10",
						"25": "25",
						"50": "50",
						"100": "100"
						})
					.setValue(this.plugin.settings.maxResults.toString())
					.onChange(async (value) => {
						this.plugin.settings.maxResults = Number(value);
						await this.plugin.saveSettings();
					})
			})
			

		containerEl.createEl("h2", {text: "Dossiers"});

		new Setting(containerEl)
			.setName("Dossier de base")
			.addSearch((cb) => {
                new FolderSuggest(cb.inputEl);
                cb.setPlaceholder("Ex. \"Décisions\"")
                cb.setValue(this.plugin.settings.dossierBase)
				cb.onChange(async (value) => {
					this.plugin.settings.dossierBase = value;
					await this.plugin.saveSettings();
					// console.log(this.plugin.settings.dossierBase)
				})
            });

		new Setting(containerEl)
			.setName("Consulter les résultats sur une page dédiée (beta)")
			.setDesc("Remplace la fenêtre temporaire de résultats par une nouvelle page permettant de prendre le temps de choisir le document.")
			.addToggle((cb) => {
				cb.setValue(this.plugin.settings.pageResultats);
				cb.onChange(async (value) => {
					this.plugin.settings.pageResultats = value;
					await this.plugin.saveSettings();
					console.log(this.plugin.settings.pageResultats);
				})
			})
	}
}