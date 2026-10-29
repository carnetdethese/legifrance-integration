/**
 * Réglages du plugin : identifiants PISTE, limite de débit, modèle de note, fiches de décisions, et l'onglet de
 * réglages d'Obsidian (`LegifranceSettingTab`) qui les présente, avec l'état de la base et des tâches (`status.ts`).
 */
import { App, EventRef, PluginSettingTab, SecretComponent, Setting, debounce } from "obsidian";
import { FolderSuggest } from "lib/folderSugget";
import LegifrancePlugin from "main";
import { REFERENCES_EVENT, TASK_EVENT } from "lib/events";
import { confirmAction } from "views/ConfirmModal";
import { LiveStatus, renderDataStatus } from "./status";
import { FICHE_FIELDS, FicheField, FicheMapping } from "references/fiches";
import { COMPLETE_FICHES_TASK, SIMULATE_FICHES_TASK } from "references/ficheSync";
import { ARTICLES_TASK, ENRICH_TASK, GENEALOGY_TASK, INDEX_TASK, REFRESH_TASK, RETRY_UNRESOLVED_TASK, Task } from "references/indexer";


/** Tâches lançables depuis l'onglet « Base de données » des réglages : nom, description, bouton, tâche (`references/indexer.ts`). */
const TASK_SETTINGS: [string, string, string, Task<unknown>][] = [
	["Indexer le coffre", "Analyse toutes les notes et enregistre leurs références juridiques. Seules les notes modifiées depuis la dernière analyse sont relues.", "Indexer", INDEX_TASK],
	["Compléter les décisions, articles et textes", "Retrouve chaque décision citée sur Légifrance puis enregistre ses métadonnées (date, formation, solution, ECLI) et son texte intégral ; retrouve ensuite l'adresse, le texte et le statut de vigueur des articles et textes cités. Demande une ou deux requêtes par référence ; peut être relancé, la tâche reprend où elle s'est arrêtée.", "Compléter", ENRICH_TASK],
	["Retrouver les articles et textes cités", "Seulement les articles et textes (les plus cités d'abord), sans toucher aux décisions : adresse Légifrance, texte et statut de vigueur (abrogé ou non).", "Retrouver", ARTICLES_TASK],
	["Analyser la généalogie de la jurisprudence", "Relève dans le texte des décisions complétées les décisions qu'elles citent et comment (revient sur, précise, confirme). Local, sans requête ; lancé aussi à la fin de « Compléter ».", "Analyser", GENEALOGY_TASK],
	["Actualiser les articles et textes cités", "Revérifie sur Légifrance les articles et textes dont le lien date de plus de six mois, et signale dans « À faire » ceux dont le statut (abrogé, modifié) ou le texte a changé.", "Actualiser", REFRESH_TASK],
	["Réessayer les décisions introuvables", "« Compléter » ne relance pas la recherche d'une décision déjà marquée introuvable. Ce bouton la relance pour toutes (chaque décision coûte une à deux requêtes).", "Réessayer", RETRY_UNRESOLVED_TASK],
];

/** Réglages persistés du plugin (`data.json`, clef `settings`). */
export interface LegifranceSettings {
	/** Nom du secret (trousseau d'Obsidian, `settings/credentials.ts`) qui contient l'identifiant client PISTE. */
	clientIdSecret: string;
	/** Nom du secret qui contient la clef secrète PISTE. */
	clientSecretSecret: string;
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
	/** À l'ouverture d'Obsidian : ne rien faire, rappeler les articles à revérifier, ou les actualiser en fond. */
	refreshOnStartup: "off" | "remind" | "run";
	/** Tient à jour les notes d'articles créées par le plugin (texte, statut, décisions, notes qui citent l'article). */
	articleNotesAutoRefresh: boolean;
}

export const DEFAULT_SETTINGS: LegifranceSettings = {
	clientIdSecret: '',
	clientSecretSecret: '',
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
	refreshOnStartup: "remind",
	articleNotesAutoRefresh: true,
}


type SettingsPage = "general" | "fiches";

/** Clefs des réglages qui sont du texte libre (et non une liste de valeurs) ou un booléen. */
type TextKey = { [K in keyof LegifranceSettings]: string extends LegifranceSettings[K] ? K : never }[keyof LegifranceSettings];
type ToggleKey = { [K in keyof LegifranceSettings]: LegifranceSettings[K] extends boolean ? K : never }[keyof LegifranceSettings];

export class LegifranceSettingTab extends PluginSettingTab {
	private page: SettingsPage = "general";
	/** Rafraîchissement de l'avancement tant que l'onglet des réglages est affiché. */
	private live?: { status: LiveStatus; timer: number; refs: EventRef[] };

	constructor(app: App, private plugin: LegifrancePlugin) {
		super(app, plugin);
	}

	/**
	 * Ajoute un champ texte lié à la clef `key` des réglages, enregistré à chaque modification
	 * (`save` remplace l'enregistrement simple quand il faut aussi réanalyser les fiches).
	 */
	private addTextSetting(
		name: string,
		desc: string,
		key: TextKey,
		{ placeholder = "", save = () => this.plugin.saveSettings() } = {}
	) {
		return new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) => {
				text.setPlaceholder(placeholder).setValue(this.plugin.settings[key]).onChange(async (value) => {
					this.plugin.settings[key] = value.trim();
					await save();
				});
			});
	}

	/** Ajoute le choix d'un secret du trousseau d'Obsidian ; les réglages ne gardent que son nom. */
	private addSecretSetting(name: string, desc: string, key: "clientIdSecret" | "clientSecretSecret") {
		return new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(this.plugin.settings[key]).onChange(async (value) => {
					this.plugin.settings[key] = value ?? "";
					await this.plugin.saveSettings();
				})
			);
	}

	/** Ajoute un interrupteur lié à la clef booléenne `key` des réglages. */
	private addToggleSetting(name: string, desc: string, key: ToggleKey, save = () => this.plugin.saveSettings()) {
		return new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
					this.plugin.settings[key] = value;
					await save();
				})
			);
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

		this.addSecretSetting("Identifiant client", "Client ID de votre application sur piste.gouv.fr (compte gratuit).", "clientIdSecret");
		this.addSecretSetting("Clef secrète", "Client secret de la même application.", "clientSecretSecret");
		containerEl.createEl("p", {
			text: "Les identifiants sont gardés dans le trousseau d'Obsidian, pas dans les données du plugin : choisissez un secret existant ou créez-en un. Le trousseau est propre à chaque appareil.",
			cls: "setting-item-description",
		});
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

		this.addToggleSetting(
			"Tenir à jour les notes d'articles",
			"Quand le texte, le statut de vigueur, les décisions ou les notes qui citent un article changent, met à jour la note d'article créée par le plugin. Seuls les passages entre les repères <!-- legifrance:… --> et les propriétés texte, numero, statut et lien sont réécrits : vos remarques ne sont jamais touchées.",
			"articleNotesAutoRefresh"
		);

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

		this.addToggleSetting(
			"Retrouver les liens automatiquement",
			"Interroge l'API pour chaque référence détectée dans la note (décisions, lois, articles). Désactivez pour limiter les requêtes : un bouton permet alors de les lancer à la demande.",
			"autoResolveRefs"
		);

		this.addToggleSetting(
			"Mode débogage des références",
			"Affiche sous chaque référence le journal de sa recherche (requêtes envoyées, réponses de l'API, erreurs) et ajoute un bouton pour copier ce diagnostic. Le journal est aussi écrit dans la console du développeur.",
			"debugRefs"
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

		for (const [name, description, button, task] of TASK_SETTINGS) {
			new Setting(containerEl)
				.setName(name)
				.setDesc(description)
				.addButton((b) =>
					b.setButtonText(button).onClick(async () => {
						await plugin.tasks.run(task);
						this.display();
					})
				);
		}

		new Setting(containerEl)
			.setName("Actualisation au démarrage")
			.setDesc("Articles et textes cités dont le lien date de plus de six mois : un rappel avec un bouton, ou une actualisation en fond une minute après l'ouverture (une requête par article, au débit réglé plus haut).")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ off: "Ne rien faire", remind: "Me le rappeler", run: "Actualiser automatiquement" })
					.setValue(plugin.settings.refreshOnStartup)
					.onChange(async (value) => {
						plugin.settings.refreshOnStartup = value as typeof plugin.settings.refreshOnStartup;
						await plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Vider la base")
			.setDesc("Efface les notes analysées, références, liens et fiches. Les notes du coffre ne sont pas touchées.")
			.addButton((button) =>
				button.setButtonText("Vider").setWarning().onClick(async () => {
					const confirmed = await confirmAction(this.app, "Vider la base", "Les textes enregistrés, les liens retrouvés (y compris ceux que vous avez choisis à la main) et les précisions saisies seront effacés ; les retrouver coûte des requêtes à l'API. Aucune note du coffre n'est touchée.");
					if (!confirmed) return;
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

		this.addTextSetting(
			"Propriété qui désigne une fiche",
			"Toute note contenant cette propriété (même vide) est une fiche de décision.",
			"ficheProperty",
			{ placeholder: "juridiction", save }
		);

		this.addTextSetting(
			"Propriété de l'identifiant Légifrance",
			"Reçoit l'identifiant de la décision (CETATEXT…, JURITEXT…) lors du complément. S'il est vide, l'identifiant est lu dans la propriété qui contient le lien Légifrance.",
			"ficheIdProperty",
			{ placeholder: "legifrance_id", save }
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

		this.addTextSetting(
			"Propriété du numéro",
			"Numéro de la décision (pourvoi, requête, décision du Conseil constitutionnel…). Plusieurs propriétés possibles, séparées par des virgules : la première qui est renseignée est utilisée.",
			"ficheNumberProperty",
			{ placeholder: "numero", save }
		);

		this.addTextSetting(
			"Propriété de la citation",
			"Si aucune propriété du numéro n'est renseignée, le numéro (et la juridiction) sont lus dans cette citation, par exemple « Cons. const., 13 janv. 2012, n° 2011-210 QPC ». Plusieurs propriétés possibles, séparées par des virgules.",
			"ficheCitationProperty",
			{ placeholder: "citation", save }
		);

		this.addTextSetting(
			"Propriété du nom",
			"Nom de la décision ou des parties, pour la recherche par informations. Plusieurs propriétés possibles, séparées par des virgules. La date et la juridiction sont lues dans les propriétés de la correspondance ci-dessous.",
			"ficheNameProperty",
			{ placeholder: "nom", save }
		);

		this.addToggleSetting(
			"Chercher aussi sur ArianeWeb",
			"Si Légifrance ne trouve rien (ou refuse l'accès), interroge ArianeWeb, la base du Conseil d'État, qui a des décisions anciennes absentes de Légifrance. Sans identifiants.",
			"ficheUseAriane", save
		);

		this.addToggleSetting(
			"Chercher aussi sur la Revue générale du droit",
			"Derniers recours après Légifrance et ArianeWeb : la Revue publie le texte de nombreux grands arrêts (Blanco, Despujol…), anciens ou récents. Sans identifiants ; sert aussi à retrouver les décisions citées.",
			"ficheUseRgd", save
		);

		new Setting(containerEl).setName("Complément").setHeading();

		this.addToggleSetting(
			"Remplacer les valeurs existantes",
			"Désactivé : seules les propriétés absentes ou vides sont complétées, ce que vous avez saisi est conservé.",
			"ficheOverwrite", save
		);

		this.addToggleSetting(
			"Compléter à l'ouverture",
			"Complète automatiquement une fiche (dont l'identifiant est connu) quand vous l'ouvrez. Désactivé par défaut : un bouton, en haut de la fiche, permet de le faire à la demande. Chaque complément coûte une requête à l'API.",
			"ficheAutoComplete", save
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

		this.addToggleSetting(
			"Inclure les fiches sans identifiant",
			"Le complément en lot cherche aussi la décision des fiches sans identifiant (numéro ou informations, voir plus haut). Seul un résultat unique est retenu : quand plusieurs décisions correspondent, la fiche est laissée de côté, à traiter avec le bouton de la fiche.",
			"ficheBatchSearch", save
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
