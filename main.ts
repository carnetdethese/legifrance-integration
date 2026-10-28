import { Events, MarkdownView, Notice, Plugin, TFile, debounce, normalizePath } from "obsidian";
import { agentSearch } from "api/utilities";
import { legalDocument } from "abstracts/document";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { createNote } from "creation/newNote";
import { ERROR_RETRY_MS, ReferenceIndex } from "references";
import { analyzeStoredDecisions } from "references/corpus";
import { noteDecisionsTable } from "references/insights";
import { completableCount, ficheId, isFiche } from "references/fiches";
import { COMPLETE_FICHES_TASK, completeFiche } from "references/ficheSync";
import { LegalDatabase } from "references/database";
import { MigrationReport, needsParserMigration, upgradeParserData } from "references/migrate";
import { ARTICLES_TASK, ENRICH_TASK, GENEALOGY_TASK, INDEX_TASK, REFRESH_TASK, RETRY_UNRESOLVED_TASK, Task } from "references/indexer";
import { DEFAULT_GRAPH_SETTINGS, GraphSettings, mergeGraphSettings } from "references/graph";
import { ResolvedLink } from "references/resolver";
import { LegalRef, searchUrl } from "references/parser";
import { canResolve, resolveReference } from "references/resolver";
import { ApiError } from "api/client";
import type { Lane } from "api/rateLimiter";
import {
	DEFAULT_SETTINGS,
	LegifranceSettings,
	LegifranceSettingTab,
} from "settings/settings";
import { NOTE_TAKING_VIEW, NoteTakingView } from "views/NoteTakingView";
import { RESEARCH_TEXT_VIEW, ResearchTextView } from "views/ResearchTextView";
import { SEARCH_RESULT_VIEW, SearchResultView } from "views/SearchResultView";
import { DATABASE_VIEW, DatabaseView } from "views/DatabaseView";
import { JURISPRUDENCE_VIEW, JurisprudenceView } from "views/JurisprudenceView";
import { REFERENCES_VIEW, ReferencesView } from "views/ReferencesView";
import { TEXT_READER_VIEW, TextReaderView } from "views/TextReaderView";
import { storedLegalDocument } from "references/stored";
import { documentDataStorage } from "views/viewsData";

/** Événement déclenché à chaque modification de l'historique. */
export const HISTORY_EVENT = "history-change";

/** Événement déclenché lorsqu'un lien de référence est retrouvé via l'API. */
export const REFERENCES_EVENT = "references-change";

/** Contenu de `data.json`. */
interface PluginData {
	data: documentDataStorage[];
	settings: LegifranceSettings;
	/** Réglages du graphe des citations (filtres, groupes, affichage, forces). */
	graph?: Partial<GraphSettings>;
	/** Anciens liens de références, avant la base SQLite : repris une fois puis abandonnés. */
	references?: { links?: Record<string, ResolvedLink>; misses?: Record<string, number> };
}

/** Classe des boutons « Compléter la fiche » ajoutés aux éditeurs. */
const FICHE_BUTTON_CLASS = "legifrance-fiche-action";

/** Événement déclenché à chaque avancée d'une tâche longue (début, progression, fin). */
export const TASK_EVENT = "task-change";

/** Tâche longue en cours, pour l'affichage de l'avancement (réglages). */
export interface TaskState {
	name: string;
	done: number;
	total: number;
	label: string;
	startedAt: number;
}

/** Nom du fichier de la base SQLite, dans le dossier du plugin. */
const DATABASE_FILE = "legifrance.sqlite";

export default class LegifrancePlugin extends Plugin {
	static instance: LegifrancePlugin;
	settings: LegifranceSettings;
	agent: agentSearch;
	/** Événements internes : les vues React s'y abonnent via `useHistorique`. */
	readonly events = new Events();
	/** Documents consultés. Toujours remplacé, jamais muté, pour le rendu React. */
	historiqueDocuments: documentDataStorage[] = [];
	/** Réglages du graphe des citations, conservés d'une ouverture à l'autre. Toujours remplacés, jamais mutés. */
	graphSettings: GraphSettings = DEFAULT_GRAPH_SETTINGS;
	/** Références juridiques détectées dans les notes du coffre, dans la base SQLite (voir `references/`). */
	references: ReferenceIndex;
	/** Incrémenté quand les notes ou leurs liens changent : périme le recensement des décisions (`decisionsOf`). */
	notesVersion = 0;
	private database: LegalDatabase;
	/** Une tâche longue (indexation, complément des fiches) est en cours. */
	taskRunning = false;
	/** Avancement de la tâche en cours (`undefined` : aucune). */
	taskState?: TaskState;
	/** L'utilisateur a demandé l'arrêt de la tâche en cours : elle s'interrompt au prochain pas. */
	taskCancelled = false;
	/** Enregistre le fichier SQLite après une rafale de modifications (analyses de notes). */
	private saveDatabaseSoon = debounce(() => this.saveDatabase(), 2000, true);
	/** Notes modifiées en attente de réanalyse. */
	private pendingNotes = new Set<TFile>();
	private reindexSoon = debounce(() => this.reindexPendingNotes(), 2000, true);
	private saveGraphSoon = debounce(() => void this.saveSettings(), 800, true);

	async onload() {
		LegifrancePlugin.instance = this;
		const legacy = await this.loadSettings();
		this.agent = new agentSearch(this.settings);
		await this.openDatabase(legacy);

		this.registerView(RESEARCH_TEXT_VIEW, (leaf) => new ResearchTextView(leaf, this));
		this.registerView(SEARCH_RESULT_VIEW, (leaf) => new SearchResultView(leaf, this));
		this.registerView(TEXT_READER_VIEW, (leaf) => new TextReaderView(leaf, this));
		this.registerView(REFERENCES_VIEW, (leaf) => new ReferencesView(leaf, this));
		this.registerView(DATABASE_VIEW, (leaf) => new DatabaseView(leaf, this));
		this.registerView(JURISPRUDENCE_VIEW, (leaf) => new JurisprudenceView(leaf, this));
		this.registerView(NOTE_TAKING_VIEW, (leaf) => new NoteTakingView(leaf, this));

		this.addRibbonIcon("scale", "Légifrance", () => this.activateResearchTextView());

		this.addCommand({
			id: "nouvelle-recherche",
			name: "Nouvelle recherche",
			callback: () => this.activateResearchTextView(),
		});

		this.addCommand({
			id: "references-juridiques",
			name: "Afficher les références juridiques de la note",
			callback: () => this.activateReferencesView(),
		});

		this.addCommand({
			id: "base-de-donnees",
			name: "Afficher la base de données et le cycle de la donnée",
			callback: () => this.activateDatabaseView(),
		});

		this.addCommand({
			id: "a-faire",
			name: "Afficher ce qui reste à faire (fiches, écarts, articles abrogés)",
			callback: () => this.activateDatabaseView("todo"),
		});

		this.addCommand({
			id: "jurisprudence",
			name: "Afficher l'analyse de la jurisprudence",
			callback: () => this.activateJurisprudenceView(),
		});

		this.addCommand({
			id: "table-des-decisions",
			name: "Insérer la table des décisions citées dans la note",
			editorCallback: (editor, view) => {
				const table = view.file && noteDecisionsTable(this, view.file);
				if (!table) {
					new Notice("Aucune décision citée dans cette note (ou la note n'est pas encore analysée).");
					return;
				}
				// À la fin de la sélection : jamais de texte remplacé.
				editor.replaceRange(`\n${table}\n`, editor.getCursor("to"));
			},
		});

		this.addCommand({
			id: "indexer-coffre",
			name: "Indexer les références juridiques du coffre",
			callback: () => this.runTask(INDEX_TASK),
		});

		this.addCommand({
			id: "completer-fiches",
			name: "Compléter toutes les fiches de décisions du coffre",
			callback: () => this.runTask(COMPLETE_FICHES_TASK),
		});

		this.addCommand({
			id: "reessayer-introuvables",
			name: "Réessayer les décisions introuvables (base de données)",
			callback: () => this.runTask(RETRY_UNRESOLVED_TASK),
		});

		this.addCommand({
			id: "analyser-genealogie",
			name: "Analyser la généalogie de la jurisprudence (base de données)",
			callback: () => this.runTask(GENEALOGY_TASK),
		});

		this.addCommand({
			id: "actualiser-articles",
			name: "Actualiser les articles et textes cités (veille, base de données)",
			callback: () => this.runTask(REFRESH_TASK),
		});

		this.addCommand({
			id: "retrouver-articles",
			name: "Retrouver les articles et textes cités (base de données)",
			callback: () => this.runTask(ARTICLES_TASK),
		});

		this.addCommand({
			id: "completer-decisions",
			name: "Compléter les fiches de décisions (base de données)",
			callback: () => this.runTask(ENRICH_TASK),
		});

		// La base suit les créations, modifications, renommages et suppressions de notes.
		const markdown = (file: unknown): file is TFile => file instanceof TFile && file.extension === "md";
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.references.rename(oldPath, file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.references.remove(file.path)));
		const reindex = (file: unknown) => {
			// Au démarrage Obsidian signale la création de chaque note existante : on les ignore.
			if (!this.app.workspace.layoutReady || !markdown(file)) return;
			this.pendingNotes.add(file);
			this.reindexSoon();
		};
		this.registerEvent(this.app.vault.on("create", reindex));
		this.registerEvent(this.app.vault.on("modify", reindex));

		// Fiches de décisions : reconnues d'après le frontmatter, bouton « Compléter » en haut des fiches.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				this.notesVersion++;
				if (!markdown(file)) return;
				if (this.syncFiche(file)) this.events.trigger(REFERENCES_EVENT);
				this.refreshFicheButtons();
			})
		);
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.notesVersion++));
		this.registerEvent(this.app.vault.on("rename", () => this.notesVersion++));
		this.registerEvent(this.app.vault.on("delete", () => this.notesVersion++));
		this.registerEvent(this.app.workspace.on("file-open", (file) => file && this.autoCompleteFiche(file)));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshFicheButtons()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshFicheButtons()));
		// Dernière écriture de la base à la fermeture d'Obsidian.
		this.registerEvent(this.app.workspace.on("quit", () => this.saveDatabase()));

		this.addSettingTab(new LegifranceSettingTab(this.app, this));

		// Une recherche ne peut pas être restaurée : on ferme les onglets de résultats orphelins.
		this.app.workspace.onLayoutReady(() => {
			this.app.workspace.detachLeavesOfType(SEARCH_RESULT_VIEW);
			this.syncFiches();
			this.refreshFicheButtons();
			// Références réécrites au démarrage : les notes sont relues en local (aucune requête) pour les rattacher aux clefs actuelles.
			if (this.migration) {
				const { rewritten, merged } = this.migration;
				this.migration = undefined;
				new Notice(`Références mises à jour : ${rewritten} réécrites, ${merged} doublons fusionnés. Les notes sont relues. Une copie de la base est conservée (legifrance.sqlite.avant-migration-v2).`, 12000);
				void this.runTask(INDEX_TASK);
			}
			// Textes déjà enregistrés : vocabulaire et articles visés, en local (décisions proches).
			if (analyzeStoredDecisions(this.references) > 0) this.events.trigger(REFERENCES_EVENT);
		});
	}

	onunload() {
		this.removeFicheButtons();
		void this.saveDatabase();
	}

	/** Charge les réglages et l'historique ; renvoie les anciennes données de références, à reprendre. */
	async loadSettings() {
		const saved: Partial<PluginData> | null = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings);
		this.historiqueDocuments = saved?.data ?? [];
		this.graphSettings = mergeGraphSettings(saved?.graph);
		return saved?.references;
	}

	private get databasePath() {
		return normalizePath(`${this.manifest.dir}/${DATABASE_FILE}`);
	}

	/**
	 * Ouvre la base (la crée si le fichier n'existe pas) et y reprend les anciens liens de `data.json`.
	 * Un fichier illisible (écriture interrompue…) est mis de côté sous un autre nom, jamais écrasé ni
	 * supprimé : la base n'est qu'un cache reconstructible, le plugin doit toujours démarrer.
	 */
	private async openDatabase(legacy: PluginData["references"]) {
		const { adapter } = this.app.vault;
		let database: LegalDatabase | undefined;
		for (const path of [this.databasePath, `${this.databasePath}.tmp`]) {
			if (!(await adapter.exists(path))) continue;
			try {
				database = await LegalDatabase.open(new Uint8Array(await adapter.readBinary(path)), () => this.saveDatabaseSoon());
				break;
			} catch (error) {
				console.error(`[Légifrance] base illisible (${path})`, error);
				const aside = `${path}.illisible-${Date.now()}`;
				await adapter.rename(path, aside).catch(() => undefined);
				new Notice(`La base de données était illisible : elle est conservée sous « ${aside} » et une base vide est recréée.`, 10000);
			}
		}
		this.database = database ?? (await LegalDatabase.open(undefined, () => this.saveDatabaseSoon()));

		// Données issues d'un ancien parseur : réécrites (doublons fusionnés, liens et textes conservés), après une sauvegarde.
		if (needsParserMigration(this.database)) {
			const backup = `${this.databasePath}.avant-migration-v2`;
			if ((await adapter.exists(this.databasePath)) && !(await adapter.exists(backup))) await adapter.copy(this.databasePath, backup).catch((error) => console.error("[Légifrance] sauvegarde avant migration", error));
		}
		this.migration = upgradeParserData(this.database);
		this.references = new ReferenceIndex(this.database);

		if (legacy?.links || legacy?.misses) {
			this.references.importLegacy(legacy);
			await this.saveSettings(); // `references` n'est plus écrit dans data.json
		}
	}

	/** Bilan de la migration des références faite à ce démarrage, s'il y en a eu une. */
	private migration?: MigrationReport;

	/** Écritures de la base, l'une après l'autre : deux écritures simultanées abîmeraient le fichier. */
	private saving: Promise<void> = Promise.resolve();

	/** Écrit le fichier SQLite. */
	private saveDatabase() {
		this.saving = this.saving.then(() => this.writeDatabase()).catch((error) => console.error("[Légifrance] enregistrement de la base", error));
		return this.saving;
	}

	/**
	 * Écrit dans un fichier temporaire complet, puis le substitue à la base : une interruption ne laisse
	 * jamais un fichier tronqué à la place de la base (au pire, le temporaire est repris à l'ouverture).
	 */
	private async writeDatabase() {
		const { adapter } = this.app.vault;
		const bytes = this.database.export();
		const temporary = `${this.databasePath}.tmp`;
		await adapter.writeBinary(temporary, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
		if (await adapter.exists(this.databasePath)) await adapter.remove(this.databasePath);
		await adapter.rename(temporary, this.databasePath);
	}

	// --- Fiches de décisions -------------------------------------------------------------------

	private frontmatterOf(file: TFile) {
		return this.app.metadataCache.getFileCache(file)?.frontmatter;
	}

	/** Met à jour la base pour une note : fiche (avec son identifiant) ou non. @returns `true` si la base a changé. */
	private syncFiche(file: TFile) {
		const frontmatter = this.frontmatterOf(file);
		return isFiche(frontmatter, this.settings)
			? this.references.setFiche(file.path, ficheId(frontmatter, this.settings))
			: this.references.removeFiche(file.path);
	}

	/** Recense les fiches de tout le coffre (d'après le cache des propriétés d'Obsidian). */
	syncFiches() {
		const files = this.app.vault.getMarkdownFiles();
		let changed = false;
		for (const file of files) changed = this.syncFiche(file) || changed;
		const present = new Set(files.map((f) => f.path));
		for (const path of this.references.fichePaths()) if (!present.has(path)) changed = this.references.removeFiche(path) || changed;
		if (changed) this.events.trigger(REFERENCES_EVENT);
		return changed;
	}

	/** Après un changement de réglage des fiches : recensement, boutons et panneaux à jour. */
	ficheSettingsChanged = debounce(() => {
		this.syncFiches();
		this.refreshFicheButtons();
		this.events.trigger(REFERENCES_EVENT);
	}, 500, true);

	/** Bouton de chaque éditeur ouvert sur une fiche : état affiché (étiquette), pour ne le recréer que s'il change. */
	private ficheButtons = new WeakMap<MarkdownView, { el: HTMLElement; state: string }>();
	/** Fiches déjà complétées automatiquement pendant cette session : une seule tentative chacune. */
	private autoCompleted = new Set<string>();

	/** Ajoute, met à jour ou retire le bouton « Compléter la fiche » de chaque éditeur ouvert. */
	refreshFicheButtons() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView) this.updateFicheButton(leaf.view);
		}
	}

	private updateFicheButton(view: MarkdownView) {
		const { file } = view;
		const frontmatter = file && this.frontmatterOf(file);
		let label: string | undefined;
		if (file && isFiche(frontmatter, this.settings)) {
			const count = completableCount(frontmatter, this.settings);
			if (!ficheId(frontmatter, this.settings)) label = "Fiche de décision : rechercher la décision (identifiant Légifrance manquant)";
			else if (count > 0) label = `Compléter la fiche depuis Légifrance (${count} propriété${count > 1 ? "s" : ""})`;
		}

		const state = file && label ? `${file.path}|${label}` : "";
		const current = this.ficheButtons.get(view);
		if (current?.state === state && current.el.isConnected) return;
		// Retire aussi les boutons d'une instance précédente du plugin (rechargement) : Obsidian ne les enlève pas.
		view.containerEl.querySelectorAll(`.${FICHE_BUTTON_CLASS}`).forEach((el) => el.remove());
		this.ficheButtons.delete(view);
		if (!state || !label) return;

		const el = view.addAction("cloud-download", label, () => view.file && void completeFiche(this, view.file));
		el.addClass(FICHE_BUTTON_CLASS);
		this.ficheButtons.set(view, { el, state });
	}

	/** Retire le bouton « Compléter la fiche » de tous les éditeurs (déchargement du plugin). */
	private removeFicheButtons() {
		document.querySelectorAll(`.${FICHE_BUTTON_CLASS}`).forEach((el) => el.remove());
	}

	/** Réglage « compléter à l'ouverture » : complète la fiche qui vient de s'ouvrir, une fois par session. */
	private autoCompleteFiche(file: TFile) {
		if (!this.settings.ficheAutoComplete || file.extension !== "md" || this.autoCompleted.has(file.path)) return;
		const frontmatter = this.frontmatterOf(file);
		if (!isFiche(frontmatter, this.settings) || !ficheId(frontmatter, this.settings) || completableCount(frontmatter, this.settings) === 0) return;
		this.autoCompleted.add(file.path);
		void completeFiche(this, file, true);
	}

	/** Réanalyse les notes modifiées ou créées (seul le contenu changé est relu, voir `forFile`). */
	private async reindexPendingNotes() {
		const files = [...this.pendingNotes];
		this.pendingNotes.clear();
		for (const file of files) await this.getReferences(file);
		this.events.trigger(REFERENCES_EVENT);
	}

	/**
	 * Lance une tâche longue sur la base, avec une notification de progression, et annonce son
	 * résultat. Une seule tâche à la fois.
	 */
	async runTask<R>({ name, run, summarize }: Task<R>) {
		if (this.taskRunning) {
			new Notice("Une tâche est déjà en cours.");
			return;
		}
		this.taskRunning = true;
		this.taskCancelled = false;
		this.taskState = { name, done: 0, total: 0, label: "", startedAt: Date.now() };
		this.events.trigger(TASK_EVENT);
		const notice = new Notice(`${name}…`, 0);
		try {
			const report = await run(this, (done, total, label) => {
				this.taskState = { name, done, total, label, startedAt: this.taskState?.startedAt ?? Date.now() };
				this.events.trigger(TASK_EVENT);
				const pause = this.agent.dilaApi.limiter.nextSlot;
				const wait = pause > Date.now() ? `\n(pause pour respecter la limite de requêtes : ${Math.ceil((pause - Date.now()) / 1000)} s)` : "";
				notice.setMessage(`${name} : ${done}/${total}\n${label}${wait}`);
			});
			notice.hide();
			new Notice(`${name} : ${summarize(report)}`, 10000);
			this.events.trigger(REFERENCES_EVENT);
			return report;
		} catch (error) {
			console.error(error);
			notice.hide();
			new Notice(`${name} : échec (${error instanceof Error ? error.message : String(error)})`, 10000);
		} finally {
			this.taskRunning = false;
			this.taskCancelled = false;
			this.taskState = undefined;
			this.events.trigger(TASK_EVENT);
		}
	}

	/** Demande l'arrêt de la tâche en cours (au prochain pas, la requête en cours n'est pas annulée). */
	cancelTask() {
		if (this.taskRunning) this.taskCancelled = true;
		this.events.trigger(TASK_EVENT);
	}

	/** Retient les réglages du graphe (écrits un instant après le dernier changement : un curseur en produit des dizaines). */
	setGraphSettings(settings: GraphSettings) {
		this.graphSettings = settings;
		this.saveGraphSoon();
	}

	async saveSettings() {
		// Nouveaux identifiants : on peut réessayer après un refus.
		const credentials = `${this.settings.clientId}:${this.settings.clientSecret}`;
		if (credentials !== this.lastCredentials) this.referenceAuthFailed = false;
		this.lastCredentials = credentials;

		await this.saveData({
			data: this.historiqueDocuments,
			settings: this.settings,
			graph: this.graphSettings,
		} satisfies PluginData);
		this.agent.dilaApi.updateConfig(this.settings);
	}

	/**
	 * Ajoute un document à l'historique s'il n'y figure pas déjà.
	 * @returns l'entrée d'historique correspondante.
	 */
	async addToHistory(data: legalDocument) {
		const existing = this.historiqueDocuments.find((e) => e.data.id === data.id);
		if (existing) return existing;

		const id = Math.max(0, ...this.historiqueDocuments.map((e) => e.id)) + 1;
		const entry = { id, data };
		this.historiqueDocuments = [...this.historiqueDocuments, entry];
		await this.historyChanged();
		return entry;
	}

	/** Retire un document de l'historique et ferme son onglet de lecture. */
	async removeFromHistory(docId: string) {
		this.historiqueDocuments = this.historiqueDocuments.filter(
			(e) => e.data.id !== docId
		);
		this.getReaderLeaves(docId).forEach((leaf) => leaf.detach());
		await this.historyChanged();
	}

	private async historyChanged() {
		this.events.trigger(HISTORY_EVENT);
		await this.saveSettings();
	}

	private getReaderLeaves(docId: string) {
		return this.app.workspace
			.getLeavesOfType(TEXT_READER_VIEW)
			.filter((leaf) => (leaf.view as TextReaderView).document?.data.id === docId);
	}

	/** Affiche (ou crée dans la barre latérale droite) le panneau de recherche. */
	async activateResearchTextView() {
		const leaf = await this.app.workspace.ensureSideLeaf(RESEARCH_TEXT_VIEW, "right", {
			active: true,
			reveal: true,
		});
		return leaf;
	}

	/** Affiche le panneau latéral des références juridiques de la note active. */
	async activateReferencesView() {
		await this.app.workspace.ensureSideLeaf(REFERENCES_VIEW, "right", {
			active: true,
			reveal: true,
		});
	}

	/** Onglet et article que la vue Jurisprudence doit afficher à son prochain rendu (lien depuis une autre vue). */
	jurisprudenceFocus?: { tab: "timeline" | "articles"; articleKey?: string };

	/** Ouvre l'analyse de la jurisprudence, éventuellement sur un onglet ou un article précis. */
	async activateJurisprudenceView(focus?: LegifrancePlugin["jurisprudenceFocus"]) {
		this.jurisprudenceFocus = focus;
		const existing = this.app.workspace.getLeavesOfType(JURISPRUDENCE_VIEW)[0];
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: JURISPRUDENCE_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.events.trigger(REFERENCES_EVENT);
	}

	/** Onglet que la vue Base de données doit afficher à son prochain rendu. */
	databaseTab?: "cycle" | "todo" | "tables";

	/** Ouvre l'onglet d'inspection de la base SQLite (cycle de la donnée, ce qui reste à faire, tables). */
	async activateDatabaseView(tab?: LegifrancePlugin["databaseTab"]) {
		this.databaseTab = tab;
		const existing = this.app.workspace.getLeavesOfType(DATABASE_VIEW)[0];
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: DATABASE_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.events.trigger(REFERENCES_EVENT);
	}

	/** Références juridiques d'une note (analysées uniquement si la note a changé). */
	getReferences(file: TFile) {
		return this.references.forFile(file.path, file.stat.mtime, () =>
			this.app.vault.cachedRead(file)
		);
	}

	/** Lien à ouvrir pour une référence : celui retrouvé, sinon une recherche Légifrance. */
	getReferenceUrl(ref: LegalRef) {
		return this.references.linkFor(ref)?.url ?? ref.fallbackUrl ?? searchUrl(ref.query);
	}

	/** Références en cours de recherche ; évite les requêtes en double entre deux analyses. */
	readonly pendingReferences = new Set<string>();
	/** Journal de la dernière recherche de chaque référence (mode débogage), par clef. Non persisté. */
	readonly referenceTraces = new Map<string, string[]>();
	/** Identifiants refusés : une seule notification par session, puis on cesse d'interroger l'API. */
	/** Les identifiants ont été refusés : on n'insiste pas tant qu'ils n'ont pas changé. */
	referenceAuthFailed = false;
	private lastCredentials = "";

	/** Peut-on interroger l'API ? (identifiants renseignés) */
	get hasCredentials() {
		return !!(this.settings.clientId && this.settings.clientSecret);
	}

	/**
	 * Retrouve via l'API le document de chaque référence sans lien connu et
	 * mémorise le résultat (ou l'échec, pour ne pas réessayer avant 24 h). Les
	 * références sont traitées l'une après l'autre ; les vues sont prévenues à
	 * chaque changement.
	 *
	 * @param force recherche aussi les références déjà introuvables (action manuelle).
	 * @param lane `background` pour une tâche de fond : ses requêtes passent après celles de l'utilisateur.
	 */
	async resolveReferences(refs: LegalRef[], force = false, lane?: Lane) {
		if (!this.hasCredentials) return;
		const todo = refs.filter(
			(ref) =>
				canResolve(ref) &&
				(force || !this.references.linkFor(ref)) &&
				!this.pendingReferences.has(ref.key) &&
				(force || this.settings.debugRefs || !this.references.isRecentMiss(ref))
		);
		if (todo.length === 0) return; // rien à faire : surtout pas d'événement (les vues relanceraient l'appel)
		todo.forEach((ref) => this.pendingReferences.add(ref.key));
		this.events.trigger(REFERENCES_EVENT);

		for (const ref of todo) {
			const trace: string[] = [];
			const log = (line: string) => {
				trace.push(line);
				if (this.settings.debugRefs) console.debug(`[Légifrance] ${ref.label} ${line}`);
			};
			try {
				const link = this.referenceAuthFailed ? null : await resolveReference(this.agent, ref, log, lane, this.settings.ficheUseRgd);
				if (link) this.references.setLink(ref, link);
				else if (!this.referenceAuthFailed) this.references.setMiss(ref);
			} catch (error) {
				log(`✘ ${error instanceof Error ? error.message : String(error)}`);
				// Autre erreur (réseau, service) : on réessaiera, mais pas à chaque ouverture de la note.
				if (!(error instanceof ApiError && [400, 401, 403, 404, 429].includes(error.status ?? 0))) {
					this.references.setMiss(ref, ERROR_RETRY_MS);
				}
				// Requête refusée partout (400/404) : on la traite comme introuvable, sans réessayer à chaque ouverture.
				if (error instanceof ApiError && [400, 404].includes(error.status ?? 0)) this.references.setMiss(ref);
				if (error instanceof ApiError && [401, 403, 429].includes(error.status ?? 0)) {
					if (!this.referenceAuthFailed) new Notice(error.message);
					this.referenceAuthFailed = error.status !== 429;
				}
				console.error(error);
			}
			if (this.settings.debugRefs) this.referenceTraces.set(ref.key, trace);
			this.pendingReferences.delete(ref.key);
			this.events.trigger(REFERENCES_EVENT);
		}
	}

	/** Ouvre le document dans un onglet de lecture, en réutilisant celui déjà ouvert. */
	async openDocument(doc: documentDataStorage) {
		const { workspace } = this.app;
		const leaf =
			this.getReaderLeaves(doc.data.id)[0] ?? workspace.getLeaf("tab");

		await leaf.setViewState({
			type: TEXT_READER_VIEW,
			state: { docId: doc.data.id },
			active: true,
		});
		await workspace.revealLeaf(leaf);
	}

	/**
	 * Ouvre dans le lecteur un document que la base de données contient (texte d'une décision, d'un
	 * article ou d'un texte), en réutilisant l'onglet déjà ouvert.
	 * @returns `false` si la base n'a pas le texte de ce document.
	 */
	async openStoredDocument(id: string) {
		if (!storedLegalDocument(this, id)) {
			new Notice("Le texte de ce document n'est pas encore dans la base (tâche « Compléter »).");
			return false;
		}
		const { workspace } = this.app;
		const leaf = this.getReaderLeaves(id)[0] ?? workspace.getLeaf("tab");
		await leaf.setViewState({ type: TEXT_READER_VIEW, state: { storedId: id }, active: true });
		await workspace.revealLeaf(leaf);
		return true;
	}

	/** Ouvre l'éditeur de note ; `newTab` force un nouvel onglet s'il n'est pas déjà ouvert. */
	async activateNoteTakingView(newTab: boolean) {
		const { workspace } = this.app;
		const leaf =
			workspace.getLeavesOfType(NOTE_TAKING_VIEW)[0] ??
			workspace.getLeaf(newTab ? "tab" : false);

		await leaf.setViewState({ type: NOTE_TAKING_VIEW, active: true });
		await workspace.revealLeaf(leaf);
	}

	/** Affiche les résultats d'une recherche dans l'onglet de résultats. */
	async activateResultsView(search: documentSearchFieldsClass) {
		const { workspace } = this.app;
		const leaf =
			workspace.getLeavesOfType(SEARCH_RESULT_VIEW)[0] ?? workspace.getLeaf("tab");

		await leaf.setViewState({ type: SEARCH_RESULT_VIEW, active: true });
		await workspace.revealLeaf(leaf);
		(leaf.view as SearchResultView).setSearch(search);
	}

	/** Crée la note d'un document de l'historique à partir du modèle des réglages. */
	async createNoteFor(data: legalDocument) {
		try {
			await createNote(this.app, this.settings, data);
		} catch (error) {
			console.error(error);
			new Notice("Impossible de créer la note.");
		}
	}
}
