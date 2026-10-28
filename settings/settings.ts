import { App, EventRef, PluginSettingTab, Setting, debounce } from "obsidian";
import { FolderSuggest } from "lib/folderSugget";
import LegifrancePlugin from "main";
import { REFERENCES_EVENT, TASK_EVENT } from "lib/events";
import { confirmAction } from "views/ConfirmModal";
import { LiveStatus, renderDataStatus } from "./status";
import { FICHE_FIELDS, FicheField, FicheMapping } from "references/fiches";
import { COMPLETE_FICHES_TASK, SIMULATE_FICHES_TASK } from "references/ficheSync";
import { ARTICLES_TASK, ENRICH_TASK, GENEALOGY_TASK, INDEX_TASK, REFRESH_TASK, RETRY_UNRESOLVED_TASK } from "references/indexer";


/** Réglages persistés du plugin (`data.json`, clef `settings`). */
export interface LegifranceSettings {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	tokenHost: string;
	/** Requêtes envoyées à l'API au plus par minute (0 : sans limite) ; les suivantes attendent leur tour. */
	maxRequestsPerMinute: number;
	templateAll: string;
	fileTitle:string;
	maxResults:number;
	dossierBase:string;
	/** Retrouve automatiquement, via l'API, les liens des références juridiques d'une note. */
	autoResolveRefs: boolean;
	/** Mode débogage : journal détaillé de la recherche des références, visible dans le panneau. */
	debugRefs: boolean;
	/** Propriété dont la présence désigne une fiche de décision. */
	ficheProperty: string;
	/** Propriété où l'identifiant Légifrance de la décision est conservé (lie la fiche aux citations). */
	ficheIdProperty: string;
	/** Propriétés d'une fiche et champ de l'API qui les renseigne. */
	ficheMapping: FicheMapping[];
	/** Propriété(s) du numéro de la décision (pourvoi), séparées par des virgules, la première renseignée l'emporte : sert à chercher une fiche sans identifiant. */
	ficheNumberProperty: string;
	/** Propriété(s) de la citation de la décision (« Cons. const., 13 janv. 2012, n° 2011-210 QPC »), séparées par des virgules : numéro de repli. */
	ficheCitationProperty: string;
	/** Propriété(s) du nom de la décision, séparées par des virgules, la première renseignée l'emporte : sert à chercher une fiche sans identifiant. */
	ficheNameProperty: string;
	/** Recherche d'une fiche sans identifiant : par numéro, par informations de la fiche, ou les deux (numéro d'abord). */
	ficheSearch: "number" | "info" | "both";
	/** Cherche aussi sur ArianeWeb (Conseil d'État) quand Légifrance ne trouve rien. */
	ficheUseAriane: boolean;
	/** Cherche aussi sur la Revue générale du droit (grands arrêts et décisions anciennes, avec leur texte). */
	ficheUseRgd: boolean;
	/** Complément en lot : cherche aussi la décision des fiches sans identifiant (résultats sans ambiguïté seulement). */
	ficheBatchSearch: boolean;
	/** Remplace les propriétés déjà renseignées lors du complément (sinon seules les vides sont remplies). */
	ficheOverwrite: boolean;
	/** Complète une fiche dès son ouverture, sans attendre le clic sur le bouton. */
	ficheAutoComplete: boolean;
}

export const DEFAULT_SETTINGS: LegifranceSettings = {
	clientId: '',
	clientSecret: '',
	apiHost: 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app',
	tokenHost: 'https://oauth.piste.gouv.fr',
	maxRequestsPerMinute: 30,
	templateAll: `---\ndate: {{date}}\njuridiction: {{juridiction}}\nformation: {{formation}}\nnom: {{titre}}\napport: \nnumero: {{numero}} \ncitation: {{citation}}\nlien: {{lien}}\ncontribution: {{contributionNote}}\ntags: \n---\n\n## Fiche et commentaire\n\n### Notes \n\n{{#each notes}}\n\n#### {{this.titreChamp}}\n\n{{this.valeurChamp}}\n\n{{/each}}\n\n### Commentaire\n\n## Décision \n\n{{texteIntegral}}`,
	fileTitle: '{{id}}',
	maxResults: 25,
	dossierBase: "/",
	autoResolveRefs: true,
	debugRefs: false,
	ficheProperty: "juridiction",
	ficheIdProperty: "legifrance_id",
	ficheMapping: [
		{ property: "date", field: "date" },
		{ property: "juridiction", field: "court" },
		{ property: "formation", field: "formation" },
		{ property: "nom", field: "title" },
		{ property: "numero", field: "number" },
		{ property: "lien", field: "url" },
	],
	ficheNumberProperty: "numero, décision",
	ficheCitationProperty: "citation",
	ficheNameProperty: "nom",
	ficheSearch: "both",
	ficheUseAriane: true,
	ficheUseRgd: true,
	ficheBatchSearch: false,
	ficheOverwrite: false,
	ficheAutoComplete: false,
}


type SettingsPage = "general" | "fiches";

export class LegifranceSettingTab extends PluginSettingTab {
	private page: SettingsPage = "general";
	/** Rafraîchissement de l'avancement tant que l'onglet des réglages est affiché. */
	private live?: { status: LiveStatus; timer: number; refs: EventRef[] };

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

	/** Arrête le rafraîchissement de l'avancement. */
	private stopLive() {
		if (!this.live) return;
		window.clearInterval(this.live.timer);
		this.live.refs.forEach((ref) => this.plugin.events.offref(ref));
		this.live = undefined;
	}

	hide(): void {
		this.stopLive();
	}

	display(): void {
		const { containerEl } = this;
		this.stopLive();
		containerEl.empty();

		const tabs = containerEl.createDiv({ cls: "legifrance-settings-tabs" });
		for (const [page, title] of [["general", "Général"], ["fiches", "Fiches de décisions"]] as [SettingsPage, string][]) {
			const button = tabs.createEl("button", { text: title, cls: page === this.page ? "mod-cta" : "" });
			button.onclick = () => {
				this.page = page;
				this.display();
			};
		}

		if (this.page === "fiches") this.displayFiches();
		else this.displayGeneral();
	}

	private displayGeneral(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;

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

		new Setting(containerEl)
			.setName("Requêtes par minute")
			.setDesc(
				"Plafond appliqué à toutes les requêtes vers l'API (recherche, liens, indexation, fiches) : les suivantes attendent leur tour. Si PISTE répond tout de même « quota dépassé », le plugin se met en pause. 0 : sans limite."
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 120, 5)
					.setValue(settings.maxRequestsPerMinute)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.maxRequestsPerMinute = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Notes").setHeading();

		new Setting(containerEl)
			.setName("Modèle de note")
			.setDesc(
				"Modèle Handlebars appliqué aux documents : {{titre}}, {{date}}, {{numero}}, {{juridiction}}, {{formation}}, {{solution}}, {{texteIntegral}}, {{#each notes}}…"
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

		// Avancement : partie vivante (tâche, API) toutes les secondes, données quand la base change.
		const statusEl = containerEl.createDiv({ cls: "legifrance-status" });
		const liveEl = statusEl.createDiv();
		const dataEl = statusEl.createDiv();
		const status = new LiveStatus(liveEl, plugin);
		renderDataStatus(dataEl, plugin);
		const refreshData = debounce(() => dataEl.isConnected && renderDataStatus(dataEl, plugin), 1500, true);
		this.live = {
			status,
			timer: window.setInterval(() => status.update(), 1000),
			refs: [
				plugin.events.on(TASK_EVENT, () => status.update()),
				plugin.events.on(REFERENCES_EVENT, () => refreshData()),
			],
		};

		new Setting(containerEl)
			.setName("Analyse de la jurisprudence")
			.setDesc("Fiches à créer, écarts avec Légifrance, chronologie par thème, articles appliqués par les décisions, décisions proches.")
			.addButton((button) => button.setButtonText("Ouvrir").onClick(() => plugin.activateJurisprudenceView()));

		new Setting(containerEl)
			.setName("Parcourir la base")
			.setDesc("Ouvre un onglet listant le contenu de chaque table : références analysées, liens, fiches de décisions.")
			.addButton((button) => button.setButtonText("Ouvrir").onClick(() => plugin.activateDatabaseView()));

		new Setting(containerEl)
			.setName("Indexer le coffre")
			.setDesc("Analyse toutes les notes et enregistre leurs références juridiques. Seules les notes modifiées depuis la dernière analyse sont relues.")
			.addButton((button) =>
				button.setButtonText("Indexer").onClick(async () => {
					await plugin.tasks.run(INDEX_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Compléter les décisions, articles et textes")
			.setDesc("Retrouve chaque décision citée sur Légifrance puis enregistre ses métadonnées (date, formation, solution, ECLI) et son texte intégral ; retrouve ensuite l'adresse, le texte et le statut de vigueur des articles et textes cités. Demande une ou deux requêtes par référence ; peut être relancé, la tâche reprend où elle s'est arrêtée.")
			.addButton((button) =>
				button.setButtonText("Compléter").onClick(async () => {
					await plugin.tasks.run(ENRICH_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Retrouver les articles et textes cités")
			.setDesc("Seulement les articles et textes (les plus cités d'abord), sans toucher aux décisions : adresse Légifrance, texte et statut de vigueur (abrogé ou non).")
			.addButton((button) =>
				button.setButtonText("Retrouver").onClick(async () => {
					await plugin.tasks.run(ARTICLES_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Analyser la généalogie de la jurisprudence")
			.setDesc("Relève dans le texte des décisions complétées les décisions qu'elles citent et comment (revient sur, précise, confirme). Local, sans requête ; lancé aussi à la fin de « Compléter ».")
			.addButton((button) =>
				button.setButtonText("Analyser").onClick(async () => {
					await plugin.tasks.run(GENEALOGY_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Actualiser les articles et textes cités")
			.setDesc("Revérifie sur Légifrance les articles et textes dont le lien date de plus de six mois, et signale dans « À faire » ceux dont le statut (abrogé, modifié) ou le texte a changé.")
			.addButton((button) =>
				button.setButtonText("Actualiser").onClick(async () => {
					await plugin.tasks.run(REFRESH_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Réessayer les décisions introuvables")
			.setDesc("« Compléter » ne relance pas la recherche d'une décision déjà marquée introuvable. Ce bouton la relance pour toutes (chaque décision coûte une à deux requêtes).")
			.addButton((button) =>
				button.setButtonText("Réessayer").onClick(async () => {
					await plugin.tasks.run(RETRY_UNRESOLVED_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Vider la base")
			.setDesc("Efface les notes analysées, références, liens et fiches. Les notes du coffre ne sont pas touchées.")
			.addButton((button) =>
				button.setButtonText("Vider").setWarning().onClick(() => {
					plugin.references.clear();
					plugin.fiches.sync();
					this.display();
				})
			);
	}

	/** Onglet « Fiches de décisions » : reconnaissance des fiches et correspondance des propriétés. */
	private displayFiches() {
		const { containerEl, plugin } = this;
		const { settings } = plugin;
		/** Enregistre puis réanalyse les fiches (regroupe les frappes successives). */
		const save = async () => {
			await plugin.saveSettings();
			plugin.fiches.settingsChanged();
		};

		new Setting(containerEl).setName("Fiches de décisions").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Une fiche est une note dont les propriétés décrivent une décision. Elle est liée aux décisions citées dans vos autres notes par son identifiant Légifrance, jamais par une correspondance approximative : sans identifiant, pas de lien.",
		});

		const stats = plugin.references.ficheStats();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: `${stats.fiches} fiche${stats.fiches > 1 ? "s" : ""} détectée${stats.fiches > 1 ? "s" : ""}, dont ${stats.identified} avec un identifiant Légifrance.`,
		});

		new Setting(containerEl)
			.setName("Propriété qui désigne une fiche")
			.setDesc("Toute note contenant cette propriété (même vide) est une fiche de décision.")
			.addText((text) =>
				text.setPlaceholder("juridiction").setValue(settings.ficheProperty).onChange(async (value) => {
					settings.ficheProperty = value.trim();
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Propriété de l'identifiant Légifrance")
			.setDesc("Reçoit l'identifiant de la décision (CETATEXT…, JURITEXT…) lors du complément. S'il est vide, l'identifiant est lu dans la propriété qui contient le lien Légifrance.")
			.addText((text) =>
				text.setPlaceholder("legifrance_id").setValue(settings.ficheIdProperty).onChange(async (value) => {
					settings.ficheIdProperty = value.trim();
					await save();
				})
			);

		new Setting(containerEl).setName("Fiches sans identifiant").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Quand une fiche n'a ni identifiant ni lien (Conseil constitutionnel, grands arrêts…), le bouton cherche la décision. Une seule décision trouvée est retenue ; s'il y en a plusieurs, une fenêtre vous demande laquelle choisir. L'identifiant est ensuite conservé dans la fiche.",
		});

		new Setting(containerEl)
			.setName("Méthode de recherche")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						number: "Par le numéro de la décision",
						info: "Par les informations de la fiche (nom, date, juridiction)",
						both: "Le numéro d'abord, puis les informations",
					})
					.setValue(settings.ficheSearch)
					.onChange(async (value) => {
						settings.ficheSearch = value as typeof settings.ficheSearch;
						await save();
					})
			);

		new Setting(containerEl)
			.setName("Propriété du numéro")
			.setDesc("Numéro de la décision (pourvoi, requête, décision du Conseil constitutionnel…). Plusieurs propriétés possibles, séparées par des virgules : la première qui est renseignée est utilisée.")
			.addText((text) =>
				text.setPlaceholder("numero").setValue(settings.ficheNumberProperty).onChange(async (value) => {
					settings.ficheNumberProperty = value.trim();
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Propriété de la citation")
			.setDesc("Si aucune propriété du numéro n'est renseignée, le numéro (et la juridiction) sont lus dans cette citation, par exemple « Cons. const., 13 janv. 2012, n° 2011-210 QPC ». Plusieurs propriétés possibles, séparées par des virgules.")
			.addText((text) =>
				text.setPlaceholder("citation").setValue(settings.ficheCitationProperty).onChange(async (value) => {
					settings.ficheCitationProperty = value.trim();
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Propriété du nom")
			.setDesc("Nom de la décision ou des parties, pour la recherche par informations. Plusieurs propriétés possibles, séparées par des virgules. La date et la juridiction sont lues dans les propriétés de la correspondance ci-dessous.")
			.addText((text) =>
				text.setPlaceholder("nom").setValue(settings.ficheNameProperty).onChange(async (value) => {
					settings.ficheNameProperty = value.trim();
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Chercher aussi sur ArianeWeb")
			.setDesc("Si Légifrance ne trouve rien (ou refuse l'accès), interroge ArianeWeb, la base du Conseil d'État, qui a des décisions anciennes absentes de Légifrance. Sans identifiants.")
			.addToggle((toggle) =>
				toggle.setValue(settings.ficheUseAriane).onChange(async (value) => {
					settings.ficheUseAriane = value;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Chercher aussi sur la Revue générale du droit")
			.setDesc("Derniers recours après Légifrance et ArianeWeb : la Revue publie le texte de nombreux grands arrêts (Blanco, Despujol…), anciens ou récents. Sans identifiants ; sert aussi à retrouver les décisions citées.")
			.addToggle((toggle) =>
				toggle.setValue(settings.ficheUseRgd).onChange(async (value) => {
					settings.ficheUseRgd = value;
					await save();
				})
			);

		new Setting(containerEl).setName("Complément").setHeading();

		new Setting(containerEl)
			.setName("Remplacer les valeurs existantes")
			.setDesc("Désactivé : seules les propriétés absentes ou vides sont complétées, ce que vous avez saisi est conservé.")
			.addToggle((toggle) =>
				toggle.setValue(settings.ficheOverwrite).onChange(async (value) => {
					settings.ficheOverwrite = value;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Compléter à l'ouverture")
			.setDesc("Complète automatiquement une fiche (dont l'identifiant est connu) quand vous l'ouvrez. Désactivé par défaut : un bouton, en haut de la fiche, permet de le faire à la demande. Chaque complément coûte une requête à l'API.")
			.addToggle((toggle) =>
				toggle.setValue(settings.ficheAutoComplete).onChange(async (value) => {
					settings.ficheAutoComplete = value;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Simuler le complément")
			.setDesc("Compte les fiches qui seraient complétées, déjà complètes ou sans identifiant, sans aucune requête ni modification de vos notes.")
			.addButton((button) => button.setButtonText("Simuler").onClick(() => plugin.tasks.run(SIMULATE_FICHES_TASK)));

		new Setting(containerEl)
			.setName("Compléter toutes les fiches")
			.setDesc("Lance le complément sur toutes les fiches du coffre qui ont un identifiant (celles déjà complètes ne coûtent aucune requête). Jamais automatique : à vous de le lancer. La progression s'affiche dans l'onglet Général, où la tâche peut être arrêtée ; le débit suit la limite de requêtes par minute.")
			.addButton((button) =>
				button.setButtonText("Compléter").setWarning().onClick(async () => {
					if (settings.ficheOverwrite && !(await confirmAction(this.app, "Remplacer les valeurs existantes", `Le réglage « Remplacer les valeurs existantes » est actif : les propriétés déjà renseignées de toutes les fiches seront remplacées par celles de Légifrance. Continuer ?`))) return;
					await plugin.tasks.run(COMPLETE_FICHES_TASK);
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Inclure les fiches sans identifiant")
			.setDesc("Le complément en lot cherche aussi la décision des fiches sans identifiant (numéro ou informations, voir plus haut). Seul un résultat unique est retenu : quand plusieurs décisions correspondent, la fiche est laissée de côté, à traiter avec le bouton de la fiche.")
			.addToggle((toggle) =>
				toggle.setValue(settings.ficheBatchSearch).onChange(async (value) => {
					settings.ficheBatchSearch = value;
					await save();
				})
			);

		new Setting(containerEl).setName("Correspondance des propriétés").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Pour chaque propriété de vos fiches, le champ de la réponse de Légifrance qui la renseigne.",
		});

		const update = async (mapping: FicheMapping[]) => {
			settings.ficheMapping = mapping;
			await save();
		};
		const header = containerEl.createDiv({ cls: "legifrance-mapping-header" });
		header.createSpan({ text: "Propriété de la fiche" });
		header.createSpan({ text: "Champ de Légifrance" });
		header.createSpan();
		settings.ficheMapping.forEach((entry, index) => {
			const row = new Setting(containerEl).setClass("legifrance-mapping-row");
			row.addText((text) =>
				text.setPlaceholder("propriété").setValue(entry.property).onChange((value) =>
					update(settings.ficheMapping.map((m, i) => (i === index ? { ...m, property: value.trim() } : m)))
				)
			);
			row.addDropdown((dropdown) =>
				dropdown.addOptions(FICHE_FIELDS).setValue(entry.field).onChange((value) =>
					update(settings.ficheMapping.map((m, i) => (i === index ? { ...m, field: value as FicheField } : m)))
				)
			);
			row.addExtraButton((button) =>
				button.setIcon("trash").setTooltip("Retirer").onClick(async () => {
					await update(settings.ficheMapping.filter((_, i) => i !== index));
					this.display();
				})
			);
		});

		new Setting(containerEl).addButton((button) =>
			button.setButtonText("Ajouter une correspondance").onClick(async () => {
				await update([...settings.ficheMapping, { property: "", field: "date" }]);
				this.display();
			})
		);
	}
}
