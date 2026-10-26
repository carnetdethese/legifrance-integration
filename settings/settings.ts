import { App, PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest } from "lib/folderSugget";
import LegifrancePlugin from "main";


/** Réglages persistés du plugin (`data.json`, clef `settings`). */
export interface LegifranceSettings {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	tokenHost: string;
	templateAll: string;
	fileTitle:string;
	maxResults:number;
	dossierBase:string;
	/** Active les fonds supplémentaires (instables) dans la recherche. */
	fondSupp: boolean;
}

export const DEFAULT_SETTINGS: LegifranceSettings = {
	clientId: '',
	clientSecret: '',
	apiHost: 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app',
	tokenHost: 'https://oauth.piste.gouv.fr',
	templateAll: `---\ndate: {{date}}\njuridiction: {{juridiction}}\nformation: {{formation}}\nnom: {{titre}}\napport: \nnumero: {{numero}} \ncitation: {{citation}}\nlien: {{lien}}\ncontribution: {{contributionNote}}\ntags: \n---\n\n## Fiche et commentaire\n\n### Notes \n\n{{#each notes}}\n\n#### {{this.titreChamp}}\n\n{{this.valeurChamp}}\n\n{{/each}}\n\n### Commentaire\n\n## Décision \n\n{{texteIntegral}}`,
	fileTitle: '{{id}}',
	maxResults: 25,
	dossierBase: "/",
	fondSupp:false
}


export class LegifranceSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: LegifrancePlugin) {
		super(app, plugin);
	}

	/**
	 * Ajoute un champ texte lié à la clef `key` des réglages, enregistré à
	 * chaque modification.
	 */
	private addTextSetting(
		name: string,
		desc: string,
		key: "clientId" | "clientSecret" | "apiHost" | "tokenHost" | "fileTitle",
		{ secret = false } = {}
	) {
		return new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) => {
				if (secret) text.inputEl.type = "password";
				text.setValue(this.plugin.settings[key]).onChange(async (value) => {
					this.plugin.settings[key] = value.trim();
					await this.plugin.saveSettings();
				});
			});
	}

	display(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;
		containerEl.empty();

		new Setting(containerEl).setName("Connexion à PISTE").setHeading();

		this.addTextSetting(
			"Identifiant client",
			"Client ID de votre application sur piste.gouv.fr (compte gratuit).",
			"clientId"
		);
		this.addTextSetting(
			"Clef secrète",
			"Client secret de la même application. Il est stocké en clair dans les données du plugin.",
			"clientSecret",
			{ secret: true }
		);
		this.addTextSetting(
			"Hôte de l'API",
			"À modifier uniquement si PISTE change d'adresse.",
			"apiHost"
		);
		this.addTextSetting(
			"Hôte d'authentification",
			"À modifier uniquement si PISTE change d'adresse.",
			"tokenHost"
		);

		new Setting(containerEl).setName("Notes").setHeading();

		new Setting(containerEl)
			.setName("Modèle de note")
			.setDesc(
				"Modèle Handlebars appliqué aux documents : {{titre}}, {{date}}, {{texteIntegral}}, {{#each notes}}…"
			)
			.addTextArea((text) => {
				text.inputEl.addClass("legifrance-template-input");
				text.setPlaceholder("Définissez le modèle de note ici.")
					.setValue(settings.templateAll)
					.onChange(async (value) => {
						settings.templateAll = value;
						await this.plugin.saveSettings();
					});
			});

		this.addTextSetting(
			"Nom du fichier",
			"Modèle Handlebars du nom des notes, par exemple {{id}}.",
			"fileTitle"
		);

		new Setting(containerEl)
			.setName("Dossier de base")
			.setDesc("Les notes de jurisprudence sont classées par juridiction dans ce dossier.")
			.addSearch((search) => {
				new FolderSuggest(this.app, search.inputEl);
				search
					.setPlaceholder('Ex. "Décisions"')
					.setValue(settings.dossierBase)
					.onChange(async (value) => {
						settings.dossierBase = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Recherche").setHeading();

		new Setting(containerEl)
			.setName("Nombre de résultats par page")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ "10": "10", "25": "25", "50": "50", "100": "100" })
					.setValue(String(settings.maxResults))
					.onChange(async (value) => {
						settings.maxResults = Number(value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Fonctionnalités expérimentales").setHeading();

		new Setting(containerEl)
			.setName("Fonds supplémentaires")
			.setDesc(
				"Ajoute ALL, LODA_DATE, KALI, ACCO et JORF à la recherche. Ces fonds demandent encore du travail et peuvent être instables."
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.fondSupp).onChange(async (value) => {
					settings.fondSupp = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
