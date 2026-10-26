import { App, PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest } from "lib/folderSugget";
import LegifrancePlugin from "main";
import { ENRICH_TASK, INDEX_TASK } from "references/indexer";


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
	/** Retrouve automatiquement, via l'API, les liens des références juridiques d'une note. */
	autoResolveRefs: boolean;
	/** Mode débogage : journal détaillé de la recherche des références, visible dans le panneau. */
	debugRefs: boolean;
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
	autoResolveRefs: true,
	debugRefs: false
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

		new Setting(containerEl).setName("Références juridiques").setHeading();

		new Setting(containerEl)
			.setName("Retrouver les liens automatiquement")
			.setDesc(
				"Interroge l'API pour chaque référence détectée dans la note (décisions, lois, articles). Désactivez pour limiter les requêtes : un bouton permet alors de les lancer à la demande."
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.autoResolveRefs).onChange(async (value) => {
					settings.autoResolveRefs = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Mode débogage des références")
			.setDesc(
				"Affiche sous chaque référence le journal de sa recherche (requêtes envoyées, réponses de l'API, erreurs) et ajoute un bouton pour copier ce diagnostic. Le journal est aussi écrit dans la console du développeur."
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.debugRefs).onChange(async (value) => {
					settings.debugRefs = value;
					await this.plugin.saveSettings();
				})
			);

		this.displayDatabase();

	}

	/** Section « Base de données » : effectifs, indexation du coffre, fiches de décisions. */
	private displayDatabase() {
		const { containerEl, plugin } = this;
		new Setting(containerEl).setName("Base de données").setHeading();

		const stats = plugin.references.stats();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: `${stats.notes} notes analysées, ${stats.references} références (dont ${stats.decisions} décisions), ${stats.links} liens retrouvés, ${stats.complete} fiches de décisions complètes. Fichier : ${plugin.manifest.dir}/legifrance.sqlite`,
		});

		new Setting(containerEl)
			.setName("Indexer le coffre")
			.setDesc("Analyse toutes les notes et enregistre leurs références juridiques. Seules les notes modifiées depuis la dernière analyse sont relues.")
			.addButton((button) =>
				button.setButtonText("Indexer").onClick(async () => {
					await plugin.runTask(INDEX_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Compléter les fiches de décisions")
			.setDesc("Retrouve chaque décision citée sur Légifrance puis enregistre ses métadonnées (date, formation, solution, ECLI) et son texte intégral. Demande une requête par décision ; peut être relancé, la tâche reprend où elle s'est arrêtée.")
			.addButton((button) =>
				button.setButtonText("Compléter").onClick(async () => {
					await plugin.runTask(ENRICH_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Vider la base")
			.setDesc("Efface les notes analysées, références, liens et fiches. Les notes du coffre ne sont pas touchées.")
			.addButton((button) =>
				button.setButtonText("Vider").setWarning().onClick(() => {
					plugin.references.clear();
					this.display();
				})
			);
	}
}
