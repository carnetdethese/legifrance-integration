/**
 * Réglages du plugin : identifiants PISTE, limite de débit, modèle de note, fiches de décisions, et l'onglet de
 * réglages d'Obsidian (`LegifranceSettingTab`) qui les présente de façon déclarative (`getSettingDefinitions`, Obsidian
 * 1.13) : Obsidian les affiche et les indexe pour sa recherche de réglages. L'état de la base et des tâches est dans `status.ts`.
 */
import { App, EventRef, Notice, PluginSettingTab, SettingDefinition, SettingDefinitionItem, SettingPage, debounce } from "obsidian";
import LegifrancePlugin from "main";
import { REFERENCES_EVENT, TASK_EVENT } from "lib/events";
import type { ConnectionCheck } from "api/connectionCheck";
import { openExternal } from "lib/links";
import { confirmAction } from "views/ConfirmModal";
import { LiveStatus, renderDataStatus } from "./status";
import { CUSTOM_LAWS_HELP, parseCustomLaws } from "references/lawAliases";
import { FICHE_FIELDS, FicheField, FicheMapping, propertiesOf, withProperties } from "references/fiches";
import { COMPLETE_FICHES_TASK, SIMULATE_FICHES_TASK } from "references/ficheSync";
import { ARTICLES_TASK, ENRICH_TASK, GENEALOGY_TASK, INDEX_TASK, REFRESH_TASK, RETRY_UNRESOLVED_TASK, Task } from "references/indexer";


/** Tâches lançables depuis l'onglet « Base de données » des réglages : nom, description, tâche (`references/indexer.ts`). */
const TASK_SETTINGS: [string, string, Task<unknown>][] = [
	["Indexer le coffre", "Analyse toutes les notes et enregistre leurs références juridiques. Seules les notes modifiées depuis la dernière analyse sont relues.", INDEX_TASK],
	["Compléter les décisions, articles et textes", "Retrouve chaque décision citée sur Légifrance puis enregistre ses métadonnées (date, formation, solution, ECLI) et son texte intégral ; retrouve ensuite l'adresse, le texte et le statut de vigueur des articles et textes cités. Demande une ou deux requêtes par référence ; peut être relancé, la tâche reprend où elle s'est arrêtée.", ENRICH_TASK],
	["Retrouver les articles et textes cités", "Seulement les articles et textes (les plus cités d'abord), sans toucher aux décisions : adresse Légifrance, texte et statut de vigueur (abrogé ou non).", ARTICLES_TASK],
	["Analyser la généalogie de la jurisprudence", "Relève dans le texte des décisions complétées les décisions qu'elles citent et comment (revient sur, précise, confirme). Local, sans requête ; lancé aussi à la fin de « Compléter ».", GENEALOGY_TASK],
	["Actualiser les articles et textes cités", "Revérifie sur Légifrance les articles et textes dont le lien date de plus de six mois, et signale dans « À faire » ceux dont le statut (abrogé, modifié) ou le texte a changé.", REFRESH_TASK],
	["Réessayer les décisions introuvables", "« Compléter » ne relance pas la recherche d'une décision déjà marquée introuvable. Ce bouton la relance pour toutes (chaque décision coûte une à deux requêtes).", RETRY_UNRESOLVED_TASK],
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
	/** Analyse des notes à l'ouverture, quand la reconnaissance des références a changé : en fond sans notification, avec notification, ou seulement à la demande. */
	startupIndexing: "quiet" | "notice" | "off";
	/** Un clic sur un lien Légifrance (notes, panneaux du plugin) ouvre le document dans le lecteur du plugin au lieu du navigateur. */
	interceptLinks: boolean;
	/** Repère les références juridiques du texte des notes (soulignement discret, aperçu au survol, Cmd/Ctrl + clic pour ouvrir). */
	markReferences: boolean;
	/** Survoler un lien Légifrance d'une note montre un aperçu du texte, pris dans la base. */
	linkPreview: boolean;
	/** Lois reconnues en plus de celles du plugin, une par ligne (`désignation | autre = loi 2004-575`, voir `parseCustomLaws`). */
	customLaws: string;
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
	startupIndexing: "quiet",
	articleNotesAutoRefresh: true,
	interceptLinks: true,
	linkPreview: true,
	markReferences: true,
	customLaws: "",
}


const PISTE_URL = "https://piste.gouv.fr/";

/** Les étapes pour obtenir des identifiants sur PISTE : titre, puis détail. */
const PISTE_STEPS: [title: string, detail: string][] = [
	["Créez un compte sur PISTE", "Sur la plateforme piste.gouv.fr (gratuit). Le bouton ci-dessous l'ouvre."],
	["Créez une application", "Dans l'onglet « Applications », créez une nouvelle application."],
	["Renseignez-la et sauvegardez", "Donnez le nom que vous voulez à cette connexion, remplissez les informations demandées et laissez la case « Activer l'application » cochée. Cliquez sur « Sauvegarder l'application »."],
	["Acceptez les conditions d'utilisation", "Cliquez sur « Cliquez ici pour accéder à la page de consentement » : c'est une étape importante. Sélectionnez le service Légifrance et acceptez les conditions d'utilisation."],
	["Activez l'API Légifrance", "Retournez sur la page de l'application créée, sélectionnez l'API « Légifrance » pour activer l'accès, et validez."],
	["Récupérez vos identifiants", "Dans l'onglet « Authentification » de l'application, repérez la section OAuth (le deuxième volet). Copiez le Client ID et le Client Secret (cliquez sur « Consulter le client secret ») et gardez-les en lieu sûr : eux seuls vous identifient."],
	["Saisissez-les dans les réglages, puis testez", "Revenez dans « Connexion à PISTE » : choisissez ou créez un secret pour chacun, puis lancez « Tester la connexion »."],
];

/** Dernier résultat du test de connexion, gardé le temps de la session pour l'afficher dans les réglages. */
let lastCheck: ConnectionCheck | undefined;

/** Explication du dictionnaire de lois, avec le nombre de lignes retenues et les lignes refusées. */
function customLawsDescription(text: string) {
	const { laws, errors } = parseCustomLaws(text);
	const base = "Vos abréviations et noms usuels de lois, reconnus dans les notes en plus de ceux du plugin (LCEN, loi Informatique et Libertés…). Une loi par ligne : désignations séparées par |, puis = nature et numéro, par exemple « LCEN | loi confiance numérique = loi 2004-575 ». Les notes sont relues après chaque modification (en local, sans requête).";
	const state = laws.length ? ` ${laws.length} loi${laws.length > 1 ? "s" : ""} reconnue${laws.length > 1 ? "s" : ""}.` : "";
	return `${base}${state}${errors.length ? ` Ligne${errors.length > 1 ? "s" : ""} non comprise${errors.length > 1 ? "s" : ""} : ${errors.join(", ")}.` : ""}`;
}

/** Réglages dont la modification demande aussi de reconnaître à nouveau les fiches du coffre. */
const FICHE_KEYS = new Set<string>([
	"ficheProperty", "ficheIdProperty", "ficheSearch", "ficheNumberProperty", "ficheCitationProperty", "ficheNameProperty",
	"ficheUseAriane", "ficheUseRgd", "ficheOverwrite", "ficheAutoComplete", "ficheBatchSearch",
]);

/** Préfixe des clefs des champs de la correspondance des propriétés (`ficheMapping:date`), qui n'ont pas de réglage propre. */
const MAPPING_PREFIX = "ficheMapping:";

/** Textes enregistrés tels quels : les autres perdent les espaces qui les entourent. */
const UNTRIMMED = new Set<string>(["templateAll", "dossierBase"]);

/** Page « Avancement » : tâche en cours et requêtes (toutes les secondes), état de la base (quand elle change). */
class StatusPage extends SettingPage {
	private live?: { status: LiveStatus; timer: number; refs: EventRef[] };

	constructor(private plugin: LegifrancePlugin) {
		super();
		this.title = "Avancement";
	}

	display() {
		const { plugin, containerEl } = this;
		this.stopLive();
		containerEl.empty();
		const statusEl = containerEl.createDiv({ cls: "legifrance-status" });
		const liveEl = statusEl.createDiv();
		const dataEl = statusEl.createDiv();
		const status = new LiveStatus(liveEl, plugin);
		renderDataStatus(dataEl, plugin);
		const refreshData = debounce(() => dataEl.isConnected && renderDataStatus(dataEl, plugin), 1500, true);
		this.live = {
			status,
			timer: window.setInterval(() => status.update(), 1000),
			refs: [plugin.events.on(TASK_EVENT, () => status.update()), plugin.events.on(REFERENCES_EVENT, () => refreshData())],
		};
	}

	private stopLive() {
		if (!this.live) return;
		window.clearInterval(this.live.timer);
		this.live.refs.forEach((ref) => this.plugin.events.offref(ref));
		this.live = undefined;
	}

	hide() {
		this.stopLive();
		super.hide();
	}
}

export class LegifranceSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: LegifrancePlugin) {
		super(app, plugin);
	}

	private get settingsRecord() {
		return this.plugin.settings as unknown as Record<string, unknown>;
	}

	/** Valeur d'un réglage pour Obsidian ; le nombre de résultats est un menu de textes, la correspondance une liste de propriétés par champ. */
	getControlValue(key: string): unknown {
		if (key.startsWith(MAPPING_PREFIX)) return propertiesOf(this.plugin.settings.ficheMapping, key.slice(MAPPING_PREFIX.length) as FicheField);
		const value = this.settingsRecord[key];
		return key === "maxResults" ? String(value) : value;
	}

	/** Enregistre la valeur choisie dans Obsidian (et réanalyse les fiches quand un réglage les concerne). */
	async setControlValue(key: string, value: unknown) {
		const record = this.settingsRecord;
		if (key.startsWith(MAPPING_PREFIX)) {
			this.plugin.settings.ficheMapping = withProperties(this.plugin.settings.ficheMapping, key.slice(MAPPING_PREFIX.length) as FicheField, String(value ?? ""));
		} else if (key === "maxResults") record[key] = Number(value);
		else if (typeof value === "string") record[key] = UNTRIMMED.has(key) ? value : value.trim();
		else record[key] = value ?? "";
		await this.plugin.saveSettings();
		if (FICHE_KEYS.has(key) || key.startsWith(MAPPING_PREFIX)) this.plugin.fiches.settingsChanged();
		if (key === "markReferences") this.app.workspace.updateOptions(); // les éditeurs ouverts recalculent leurs marques
		if (key === "customLaws") this.plugin.customLawsChanged();
	}

	/** Une ligne d'action : `onClick` s'exécute au clic sur la ligne. */
	private actionSetting(name: string, desc: string, onClick: () => unknown): SettingDefinition {
		return { name, desc, action: () => void onClick() };
	}

	/** Teste les identifiants du trousseau et l'accès à l'API, et en montre le verdict. */
	private async testConnection() {
		const { plugin } = this;
		if (!plugin.hasCredentials) {
			new Notice("Choisissez d'abord un secret pour l'identifiant client et pour la clef secrète (voir « Premiers pas »).", 8000);
			return;
		}
		new Notice("Test de la connexion à PISTE…", 3000);
		plugin.api.updateConfig();
		lastCheck = await plugin.api.checkConnection();
		new Notice(`${lastCheck.ok ? "✓" : "✗"} ${lastCheck.title}\n${lastCheck.detail}`, lastCheck.ok ? 6000 : 15000);
		this.update();
	}

	/** Page « Premiers pas » : les étapes pour obtenir des identifiants, et le test de la connexion. */
	private pisteGuidePage(): Extract<SettingDefinitionItem, { type: "page" }> {
		return {
			type: "page",
			name: "Premiers pas : obtenir des identifiants",
			desc: "Pas encore d'identifiants ? Les étapes pour les créer sur PISTE (gratuit, quelques minutes).",
			items: [
				{
					type: "group",
					heading: "Créer vos identifiants PISTE",
					items: [
						{ name: "Ouvrir PISTE", desc: "Ouvre piste.gouv.fr dans votre navigateur.", action: () => openExternal(PISTE_URL) },
						...PISTE_STEPS.map(([title, detail], index) => ({ name: `${index + 1}. ${title}`, desc: detail })),
					],
				},
				{
					type: "group",
					heading: "Vérifier",
					items: [
						this.actionSetting("Tester la connexion", "Vérifie les identifiants et l'accès à l'API Légifrance, et dit quelle étape corriger en cas d'échec.", () => this.testConnection()),
						{ name: "Sans identifiants ?", desc: "Les références juridiques de vos notes restent repérées et renvoient vers la recherche Légifrance ; ArianeWeb, la Revue générale du droit et le site du Conseil constitutionnel fonctionnent sans identifiants. Les identifiants servent à lire les textes, retrouver les articles et compléter les fiches." },
					],
				},
			],
		};
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const { plugin } = this;
		return [
			{
				type: "group",
				heading: "Connexion à PISTE",
				items: [
					this.pisteGuidePage(),
					this.actionSetting(
						"Tester la connexion",
						lastCheck ? `${lastCheck.ok ? "✓" : "✗"} ${lastCheck.title}. ${lastCheck.detail}` : plugin.hasCredentials ? "Vérifie les identifiants et l'accès à l'API Légifrance." : "Aucun identifiant pour l'instant : suivez « Premiers pas » ci-dessus.",
						() => this.testConnection()
					),
					{ name: "Identifiant client", desc: "Client ID de votre application sur piste.gouv.fr (compte gratuit).", control: { type: "secret", key: "clientIdSecret" } },
					{ name: "Clef secrète", desc: "Client secret de la même application.", control: { type: "secret", key: "clientSecretSecret" } },
					{ name: "Où sont gardés les identifiants ?", desc: "Dans le trousseau d'Obsidian, pas dans les données du plugin : choisissez un secret existant ou créez-en un. Le trousseau est propre à chaque appareil." },
					{ name: "Hôte de l'API", desc: "À modifier uniquement si PISTE change d'adresse.", control: { type: "text", key: "apiHost" } },
					{ name: "Hôte d'authentification", desc: "À modifier uniquement si PISTE change d'adresse.", control: { type: "text", key: "tokenHost" } },
					{
						name: "Requêtes par minute",
						desc: "Plafond appliqué à toutes les requêtes vers l'API (recherche, liens, indexation, fiches) : les suivantes attendent leur tour. Si PISTE répond tout de même « quota dépassé », le plugin se met en pause. 0 : sans limite.",
						control: { type: "slider", key: "maxRequestsPerMinute", min: 0, max: 120, step: 5 },
					},
				],
			},
			{
				type: "group",
				heading: "Notes",
				items: [
					{
						name: "Modèle de note",
						desc: "Modèle Handlebars appliqué aux documents : {{titre}}, {{date}}, {{numero}}, {{juridiction}}, {{formation}}, {{solution}}, {{texteIntegral}}, {{#each notes}}…",
						control: { type: "textarea", key: "templateAll", placeholder: "Définissez le modèle de note ici.", rows: 12 },
					},
					{ name: "Nom du fichier", desc: "Modèle Handlebars du nom des notes, par exemple {{id}}.", control: { type: "text", key: "fileTitle" } },
					{ name: "Dossier de base", desc: "Les notes de jurisprudence sont classées par juridiction dans ce dossier.", control: { type: "folder", key: "dossierBase", placeholder: "Ex. Décisions", includeRoot: true } },
					{
						name: "Tenir à jour les notes d'articles",
						desc: "Quand le texte, le statut de vigueur, les décisions ou les notes qui citent un article changent, met à jour la note d'article créée par le plugin. Seuls les passages entre les repères <!-- legifrance:… --> et les propriétés texte, numero, statut et lien sont réécrits : vos remarques ne sont jamais touchées.",
						control: { type: "toggle", key: "articleNotesAutoRefresh" },
					},
					{
						name: "Ouvrir les liens Légifrance dans le plugin",
						desc: "Un clic sur un lien Légifrance (dans une note en mode lecture, une propriété, ou un panneau du plugin) ouvre le texte dans le lecteur du plugin : lu dans la base s'il y est, sinon récupéré via l'API. Dans l'éditeur, Cmd/Ctrl + clic. Maj + clic ouvre le site. Sans identifiants PISTE, le lien suit son chemin habituel.",
						control: { type: "toggle", key: "interceptLinks" },
					},
					{
						name: "Aperçu au survol des liens Légifrance",
						desc: "Survoler un lien Légifrance d'une note affiche le début du texte s'il est déjà dans la base (aucune requête).",
						control: { type: "toggle", key: "linkPreview" },
					},
					{
						name: "Repérer les références juridiques dans les notes",
						desc: "Souligne discrètement, en pointillés, les références reconnues dans le texte (« art. 226-17 C. pén. », « Cass. civ. 1re, 3 mars 2020 »…). Survolées, elles montrent ce que la base en sait ; Cmd/Ctrl + clic ouvre le document dans le lecteur. Le texte des notes n'est jamais modifié.",
						control: { type: "toggle", key: "markReferences" },
					},
				],
			},
			{
				type: "group",
				heading: "Recherche",
				items: [{ name: "Nombre de résultats par page", control: { type: "dropdown", key: "maxResults", options: { "10": "10", "25": "25", "50": "50", "100": "100" } } }],
			},
			{
				type: "group",
				heading: "Références juridiques",
				items: [
					{
						name: "Retrouver les liens automatiquement",
						desc: "Interroge l'API pour chaque référence détectée dans la note (décisions, lois, articles). Désactivez pour limiter les requêtes : un bouton permet alors de les lancer à la demande.",
						control: { type: "toggle", key: "autoResolveRefs" },
					},
					{
						name: "Lois et abréviations personnalisées",
						desc: customLawsDescription(plugin.settings.customLaws),
						control: { type: "textarea", key: "customLaws", placeholder: CUSTOM_LAWS_HELP, rows: 8 },
					},
					{
						name: "Mode débogage des références",
						desc: "Affiche sous chaque référence le journal de sa recherche (requêtes envoyées, réponses de l'API, erreurs) et ajoute un bouton pour copier ce diagnostic. Le journal est aussi écrit dans la console du développeur.",
						control: { type: "toggle", key: "debugRefs" },
					},
				],
			},
			{
				type: "group",
				heading: "Base de données",
				items: [
					{
						type: "page",
						name: "Avancement",
						desc: "Tâche en cours, requêtes vers l'API, état de l'indexation, des liens et des fiches.",
						displayValue: () => {
							const state = plugin.tasks.state;
							return state ? `${state.name} : ${state.done} / ${state.total}` : "Aucune tâche";
						},
						page: () => new StatusPage(plugin),
					},
					this.actionSetting("Ouvrir l'analyse de la jurisprudence", "Fiches à créer, écarts avec Légifrance, chronologie par thème, articles appliqués par les décisions, décisions proches.", () => plugin.activateJurisprudenceView()),
					this.actionSetting("Parcourir la base", "Ouvre un onglet listant le contenu de chaque table : références analysées, liens, fiches de décisions.", () => plugin.activateDatabaseView()),
					...TASK_SETTINGS.map(([name, description, task]) =>
						this.actionSetting(name, description, async () => {
							await plugin.tasks.run(task);
							this.update();
						})
					),
					{
						name: "Analyse des notes au démarrage",
						desc: "Quand la reconnaissance des références s'améliore (mise à jour du plugin), les notes sont relues en local, sans requête. En fond, sans notification (l'avancement reste visible dans la vue Base de données), avec une notification, ou seulement quand vous lancez « Indexer le coffre ».",
						control: { type: "dropdown", key: "startupIndexing", options: { quiet: "En fond, sans notification", notice: "Avec notification", off: "Seulement à la demande" } },
					},
					{
						name: "Actualisation au démarrage",
						desc: "Articles et textes cités dont le lien date de plus de six mois : un rappel avec un bouton, ou une actualisation en fond une minute après l'ouverture (une requête par article, au débit réglé plus haut).",
						control: { type: "dropdown", key: "refreshOnStartup", options: { off: "Ne rien faire", remind: "Me le rappeler", run: "Actualiser automatiquement" } },
					},
					this.actionSetting(
						"Vider la base",
						"Efface les notes analysées, références, liens et fiches. Les notes du coffre ne sont pas touchées. Une confirmation est demandée.",
						async () => {
							const confirmed = await confirmAction(this.app, "Vider la base", "Les textes enregistrés, les liens retrouvés (y compris ceux que vous avez choisis à la main) et les précisions saisies seront effacés ; les retrouver coûte des requêtes à l'API. Aucune note du coffre n'est touchée.");
							if (!confirmed) return;
							plugin.references.clear();
							plugin.fiches.sync();
							this.update();
						}
					),
				],
			},
			this.fichesPage(),
		];
	}

	/** Page « Fiches de décisions » : reconnaissance des fiches, recherche sans identifiant, complément et correspondance des propriétés. */
	private fichesPage(): SettingDefinitionItem {
		const { plugin } = this;
		const { settings } = plugin;
		const stats = plugin.references.ficheStats();
		return {
			type: "page",
			name: "Fiches de décisions",
			desc: "Reconnaissance des fiches, recherche des décisions sans identifiant, complément des propriétés.",
			displayValue: () => {
				const { fiches } = plugin.references.ficheStats();
				return `${fiches} fiche${fiches > 1 ? "s" : ""}`;
			},
			items: [
				{
					type: "group",
					heading: "Fiches de décisions",
					items: [
						{
							name: "Qu'est-ce qu'une fiche ?",
							desc: `Une fiche est une note dont les propriétés décrivent une décision. Elle est liée aux décisions citées dans vos autres notes par son identifiant Légifrance, jamais par une correspondance approximative : sans identifiant, pas de lien. ${stats.fiches} fiche${stats.fiches > 1 ? "s" : ""} détectée${stats.fiches > 1 ? "s" : ""}, dont ${stats.identified} avec un identifiant Légifrance.`,
						},
						{ name: "Propriété qui désigne une fiche", desc: "Toute note contenant cette propriété (même vide) est une fiche de décision.", control: { type: "text", key: "ficheProperty", placeholder: "juridiction" } },
						{
							name: "Propriété de l'identifiant Légifrance",
							desc: "Reçoit l'identifiant de la décision (CETATEXT…, JURITEXT…) lors du complément. S'il est vide, l'identifiant est lu dans la propriété qui contient le lien Légifrance.",
							control: { type: "text", key: "ficheIdProperty", placeholder: "legifrance_id" },
						},
					],
				},
				{
					type: "group",
					heading: "Fiches sans identifiant",
					items: [
						{
							name: "Comment sont-elles retrouvées ?",
							desc: "Quand une fiche n'a ni identifiant ni lien (Conseil constitutionnel, grands arrêts…), le bouton cherche la décision. Une seule décision trouvée est retenue ; s'il y en a plusieurs, une fenêtre vous demande laquelle choisir. L'identifiant est ensuite conservé dans la fiche.",
						},
						{
							name: "Méthode de recherche",
							control: {
								type: "dropdown",
								key: "ficheSearch",
								options: {
									number: "Par le numéro de la décision",
									info: "Par les informations de la fiche (nom, date, juridiction)",
									both: "Le numéro d'abord, puis les informations",
								},
							},
						},
						{
							name: "Propriété du numéro",
							desc: "Numéro de la décision (pourvoi, requête, décision du Conseil constitutionnel…). Plusieurs propriétés possibles, séparées par des virgules : la première qui est renseignée est utilisée.",
							control: { type: "text", key: "ficheNumberProperty", placeholder: "numero" },
						},
						{
							name: "Propriété de la citation",
							desc: "Si aucune propriété du numéro n'est renseignée, le numéro (et la juridiction) sont lus dans cette citation, par exemple « Cons. const., 13 janv. 2012, n° 2011-210 QPC ». Plusieurs propriétés possibles, séparées par des virgules.",
							control: { type: "text", key: "ficheCitationProperty", placeholder: "citation" },
						},
						{
							name: "Propriété du nom",
							desc: "Nom de la décision ou des parties, pour la recherche par informations. Plusieurs propriétés possibles, séparées par des virgules. La date et la juridiction sont lues dans les propriétés de la correspondance ci-dessous.",
							control: { type: "text", key: "ficheNameProperty", placeholder: "nom" },
						},
						{
							name: "Chercher aussi sur ArianeWeb",
							desc: "Si Légifrance ne trouve rien (ou refuse l'accès), interroge ArianeWeb, la base du Conseil d'État, qui a des décisions anciennes absentes de Légifrance. Sans identifiants.",
							control: { type: "toggle", key: "ficheUseAriane" },
						},
						{
							name: "Chercher aussi sur la Revue générale du droit",
							desc: "Derniers recours après Légifrance et ArianeWeb : la Revue publie le texte de nombreux grands arrêts (Blanco, Despujol…), anciens ou récents. Sans identifiants ; sert aussi à retrouver les décisions citées.",
							control: { type: "toggle", key: "ficheUseRgd" },
						},
					],
				},
				{
					type: "group",
					heading: "Complément",
					items: [
						{
							name: "Remplacer les valeurs existantes",
							desc: "Désactivé : seules les propriétés absentes ou vides sont complétées, ce que vous avez saisi est conservé.",
							control: { type: "toggle", key: "ficheOverwrite" },
						},
						{
							name: "Compléter à l'ouverture",
							desc: "Complète automatiquement une fiche (dont l'identifiant est connu) quand vous l'ouvrez. Désactivé par défaut : un bouton, en haut de la fiche, permet de le faire à la demande. Chaque complément coûte une requête à l'API.",
							control: { type: "toggle", key: "ficheAutoComplete" },
						},
						this.actionSetting(
							"Simuler le complément",
							"Compte les fiches qui seraient complétées, déjà complètes ou sans identifiant, sans aucune requête ni modification de vos notes.",
							() => plugin.tasks.run(SIMULATE_FICHES_TASK)
						),
						this.actionSetting(
							"Compléter toutes les fiches",
							"Lance le complément sur toutes les fiches du coffre qui ont un identifiant (celles déjà complètes ne coûtent aucune requête). Jamais automatique : à vous de le lancer. La progression s'affiche dans la section « Base de données » de la page principale, où la tâche peut être arrêtée ; le débit suit la limite de requêtes par minute.",
							async () => {
								if (settings.ficheOverwrite && !(await confirmAction(this.app, "Remplacer les valeurs existantes", "Le réglage « Remplacer les valeurs existantes » est actif : les propriétés déjà renseignées de toutes les fiches seront remplacées par celles de Légifrance. Continuer ?"))) return;
								await plugin.tasks.run(COMPLETE_FICHES_TASK);
								this.update();
							}
						),
						{
							name: "Inclure les fiches sans identifiant",
							desc: "Le complément en lot cherche aussi la décision des fiches sans identifiant (numéro ou informations, voir plus haut). Seul un résultat unique est retenu : quand plusieurs décisions correspondent, la fiche est laissée de côté, à traiter avec le bouton de la fiche.",
							control: { type: "toggle", key: "ficheBatchSearch" },
						},
					],
				},
				{
					type: "group",
					heading: "Correspondance des propriétés",
					items: (Object.entries(FICHE_FIELDS) as [FicheField, string][]).map(([field, label]) => ({
						name: label,
						desc: `Propriété de la fiche qui reçoit « ${label} » d'après Légifrance. Plusieurs propriétés possibles, séparées par des virgules ; vide : ce champ n'est pas renseigné.`,
						control: { type: "text" as const, key: MAPPING_PREFIX + field, placeholder: field },
					})),
				},
			],
		};
	}
}
