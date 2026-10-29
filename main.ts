/**
 * Point d'entrée du plugin : cycle de vie (chargement, déchargement), réglages, historique des documents consultés
 * et ouverture des vues. Le reste est réparti par sujet :
 *
 * | Sujet                              | Où                                                    |
 * |------------------------------------|-------------------------------------------------------|
 * | commandes et ruban                 | `commands.ts`                                         |
 * | appels à l'API Légifrance          | `api/legifrance.ts` (`plugin.api`)                    |
 * | fichier SQLite                     | `references/databaseFile.ts`                          |
 * | base des références                | `references/index.ts` (`plugin.references`)           |
 * | liens des références (via l'API)   | `references/linkResolver.ts` (`plugin.links`)         |
 * | fiches de décisions dans les notes | `references/ficheEditor.ts` (`plugin.fiches`)         |
 * | tâches longues                     | `references/taskRunner.ts` (`plugin.tasks`)           |
 * | événements pour les vues           | `lib/events.ts` (`plugin.events`)                     |
 */
import { Events, Notice, Plugin, TFile, debounce } from "obsidian";
import type { ConnectionSettings } from "api/client";
import { LegifranceApi } from "api/legifrance";
import { LegalDocument } from "abstracts/document";
import { DocumentSearch } from "abstracts/searchHandler";
import { registerCommands } from "commands";
import { migrateCredentials } from "settings/credentials";
import { shouldCreateNote } from "creation/linkExisting";
import { createNote } from "creation/newNote";
import { HISTORY_EVENT, REFERENCES_EVENT } from "lib/events";
import { ReferenceIndex } from "references";
import { analyzeStoredDecisions } from "references/corpus";
import { DatabaseFile } from "references/databaseFile";
import { FicheEditor, isMarkdown } from "references/ficheEditor";
import { DEFAULT_GRAPH_SETTINGS, GraphSettings, mergeGraphSettings } from "references/graph";
import { INDEX_TASK } from "references/indexer";
import { PARSER_VERSION } from "references/parser";
import { refreshArticleNotes } from "references/articleNotes";
import { refreshOnStartup } from "references/startup";
import { LinkResolver } from "references/linkResolver";
import { MigrationReport } from "references/migrate";
import { ResolvedLink } from "references/resolver";
import { storedLegalDocument } from "references/stored";
import { TaskRunner } from "references/taskRunner";
import { DEFAULT_SETTINGS, LegifranceSettings, LegifranceSettingTab } from "settings/settings";
import { DATABASE_VIEW, DatabaseView } from "views/DatabaseView";
import { JURISPRUDENCE_VIEW, JurisprudenceView } from "views/JurisprudenceView";
import { NOTE_TAKING_VIEW, NoteTakingView } from "views/NoteTakingView";
import { ARTICLES_VIEW, ArticlesView } from "views/ArticlesView";
import { REFERENCES_VIEW, ReferencesView } from "views/ReferencesView";
import { RESEARCH_TEXT_VIEW, ResearchTextView } from "views/ResearchTextView";
import { SEARCH_RESULT_VIEW, SearchResultView } from "views/SearchResultView";
import { TEXT_READER_VIEW, TextReaderView } from "views/TextReaderView";
import { DocumentData } from "views/viewsData";

/** Contenu de `data.json`. */
interface PluginData {
	/** Historique des documents consultés. */
	data: DocumentData[];
	settings: LegifranceSettings;
	/** Réglages du graphe des citations (filtres, groupes, affichage, forces). */
	graph?: Partial<GraphSettings>;
	/** Anciens liens de références, avant la base SQLite : repris une fois puis abandonnés. */
	references?: { links?: Record<string, ResolvedLink>; misses?: Record<string, number> };
}

export default class LegifrancePlugin extends Plugin {
	static instance: LegifrancePlugin;
	settings: LegifranceSettings;
	/** Appels à l'API Légifrance (`api/legifrance.ts`). */
	api: LegifranceApi;
	/** Événements internes : les vues React s'y abonnent par les hooks de `views/hooks.tsx` (voir `lib/events.ts`). */
	readonly events = new Events();
	/** Documents consultés. Toujours remplacé, jamais muté, pour le rendu React. */
	historiqueDocuments: DocumentData[] = [];
	/** Réglages du graphe des citations, conservés d'une ouverture à l'autre. Toujours remplacés, jamais mutés. */
	graphSettings: GraphSettings = DEFAULT_GRAPH_SETTINGS;
	/** Références juridiques détectées dans les notes du coffre, dans la base SQLite (voir `references/`). */
	references: ReferenceIndex;
	/** Recherche des liens des références via l'API (état : en cours, journal, identifiants refusés). */
	readonly links = new LinkResolver(this);
	/** Fiches de décisions : reconnaissance, bouton « Compléter », complément automatique. */
	readonly fiches = new FicheEditor(this);
	/** Tâches longues sur la base (une à la fois). */
	readonly tasks = new TaskRunner(this);
	/** Incrémenté quand les notes ou leurs liens changent : périme le recensement des décisions (`decisionsOf`). */
	notesVersion = 0;

	private databaseFile: DatabaseFile;
	/** Bilan de la migration des références faite à ce démarrage, s'il y en a eu une. */
	private migration?: MigrationReport;
	/** Enregistre le fichier SQLite après une rafale de modifications (analyses de notes). */
	private saveDatabaseSoon = debounce(() => this.databaseFile.save(), 2000, true);
	/** Notes modifiées en attente de réanalyse. */
	private pendingNotes = new Set<TFile>();
	private reindexSoon = debounce(() => this.reindexPendingNotes(), 2000, true);
	/** Met à jour les notes d'articles un instant après le dernier changement de la base. */
	private refreshArticleNotesSoon!: () => void;
	private saveGraphSoon = debounce(() => void this.saveSettings(), 800, true);

	async onload() {
		LegifrancePlugin.instance = this;
		const legacy = await this.loadSettings();
		this.api = new LegifranceApi(() => this.connection);
		await this.moveCredentialsToKeychain();
		await this.openDatabase(legacy);

		this.registerView(RESEARCH_TEXT_VIEW, (leaf) => new ResearchTextView(leaf, this));
		this.registerView(SEARCH_RESULT_VIEW, (leaf) => new SearchResultView(leaf, this));
		this.registerView(TEXT_READER_VIEW, (leaf) => new TextReaderView(leaf, this));
		this.registerView(REFERENCES_VIEW, (leaf) => new ReferencesView(leaf, this));
		this.registerView(ARTICLES_VIEW, (leaf) => new ArticlesView(leaf, this));
		this.registerView(DATABASE_VIEW, (leaf) => new DatabaseView(leaf, this));
		this.registerView(JURISPRUDENCE_VIEW, (leaf) => new JurisprudenceView(leaf, this));
		this.registerView(NOTE_TAKING_VIEW, (leaf) => new NoteTakingView(leaf, this));
		registerCommands(this);
		this.addSettingTab(new LegifranceSettingTab(this.app, this));

		this.watchVault();
		// Les notes d'articles suivent la base (texte, statut, décisions) ; rafale d'événements : on attend qu'elle se calme.
		const refreshArticleNotesSoon = debounce(() => this.settings.articleNotesAutoRefresh && void refreshArticleNotes(this), 5000, true);
		this.registerEvent(this.events.on(REFERENCES_EVENT, refreshArticleNotesSoon));
		this.refreshArticleNotesSoon = refreshArticleNotesSoon;
		this.fiches.register();
		// Dernière écriture de la base à la fermeture d'Obsidian.
		this.registerEvent(this.app.workspace.on("quit", () => this.databaseFile.save()));

		this.app.workspace.onLayoutReady(() => this.afterLayoutReady());
	}

	onunload() {
		this.fiches.removeButtons();
		void this.databaseFile.save();
	}

	/** La base suit les créations, modifications, renommages et suppressions de notes. */
	private watchVault() {
		const { vault, metadataCache } = this.app;
		this.registerEvent(vault.on("rename", (file, oldPath) => this.references.rename(oldPath, file.path)));
		this.registerEvent(vault.on("delete", (file) => this.references.remove(file.path)));
		const reindex = (file: unknown) => {
			// Au démarrage Obsidian signale la création de chaque note existante : on les ignore.
			if (!this.app.workspace.layoutReady || !isMarkdown(file)) return;
			this.pendingNotes.add(file);
			this.reindexSoon();
		};
		this.registerEvent(vault.on("create", reindex));
		this.registerEvent(vault.on("modify", reindex));

		// Ce qui change dans les notes ou leurs liens périme le recensement des décisions.
		const notesChanged = () => this.notesVersion++;
		this.registerEvent(metadataCache.on("changed", notesChanged));
		this.registerEvent(metadataCache.on("resolved", notesChanged));
		this.registerEvent(vault.on("rename", notesChanged));
		this.registerEvent(vault.on("delete", notesChanged));
	}

	/** Une fois l'espace de travail prêt : nettoyage des onglets, fiches, migration à annoncer, analyses locales. */
	private afterLayoutReady() {
		const { workspace } = this.app;
		// Une recherche ne peut pas être restaurée : on ferme les onglets de résultats orphelins.
		workspace.detachLeavesOfType(SEARCH_RESULT_VIEW);
		this.fiches.sync();
		this.fiches.refreshButtons();
		// Références réécrites au démarrage : les notes sont relues en local (aucune requête) pour les rattacher aux clefs actuelles.
		if (this.migration) {
			const { rewritten, merged } = this.migration;
			this.migration = undefined;
			new Notice(`Références mises à jour : ${rewritten} réécrites, ${merged} doublons fusionnés. Les notes sont relues. Une copie de la base est conservée (legifrance.sqlite.avant-migration-v2).`, 12000);
			void this.tasks.run(INDEX_TASK);
		}
		// Parseur amélioré depuis la dernière analyse : les notes sont relues (en local) avec ses nouvelles règles.
		if (this.references.parserChanged(PARSER_VERSION)) {
			new Notice("Reconnaissance des références améliorée : les notes sont relues (aucune requête).", 8000);
			void this.tasks.run(INDEX_TASK);
		}
		// Textes déjà enregistrés : vocabulaire et articles visés, en local (décisions proches).
		if (analyzeStoredDecisions(this.references) > 0) this.events.trigger(REFERENCES_EVENT);
		// Liens d'articles anciens : rappel ou actualisation en fond, selon le réglage.
		refreshOnStartup(this);
		// Notes d'articles : une passe au démarrage, la base a pu changer pendant que le plugin était fermé.
		this.refreshArticleNotesSoon();
	}

	/** Charge les réglages et l'historique ; renvoie les anciennes données de références, à reprendre. */
	async loadSettings() {
		const saved: Partial<PluginData> | null = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings);
		this.historiqueDocuments = saved?.data ?? [];
		this.graphSettings = mergeGraphSettings(saved?.graph);
		return saved?.references;
	}

	/**
	 * Les anciennes versions gardaient les identifiants PISTE en clair dans `data.json` : ils passent dans le trousseau
	 * d'Obsidian, puis disparaissent des données du plugin.
	 */
	private async moveCredentialsToKeychain() {
		const { changed, stranded } = migrateCredentials(this.settings, this.app.secretStorage);
		if (changed) {
			await this.saveSettings();
			new Notice("Vos identifiants PISTE sont maintenant dans le trousseau d'Obsidian et ne figurent plus dans les données du plugin.", 10000);
		}
		if (stranded.length) new Notice("Les identifiants PISTE n'ont pas pu être mis dans le trousseau d'Obsidian : saisissez-les à nouveau dans les réglages.", 10000);
	}

	/** Ouvre la base et y reprend les anciens liens de `data.json` (avant la base SQLite). */
	private async openDatabase(legacy: PluginData["references"]) {
		this.databaseFile = new DatabaseFile(this.app, this.manifest.dir!, () => this.saveDatabaseSoon());
		this.migration = await this.databaseFile.open();
		this.references = new ReferenceIndex(this.databaseFile.database);

		if (legacy?.links || legacy?.misses) {
			this.references.importLegacy(legacy);
			await this.saveSettings(); // `references` n'est plus écrit dans data.json
		}
	}

	/** Réanalyse les notes modifiées ou créées (seul le contenu changé est relu, voir `forFile`). */
	private async reindexPendingNotes() {
		const files = [...this.pendingNotes];
		this.pendingNotes.clear();
		for (const file of files) await this.getReferences(file);
		this.events.trigger(REFERENCES_EVENT);
	}

	/** Retient les réglages du graphe (écrits un instant après le dernier changement : un curseur en produit des dizaines). */
	setGraphSettings(settings: GraphSettings) {
		this.graphSettings = settings;
		this.saveGraphSoon();
	}

	async saveSettings() {
		this.links.settingsSaved();

		await this.saveData({
			data: this.historiqueDocuments,
			settings: this.settings,
			graph: this.graphSettings,
		} satisfies PluginData);
		this.api.updateConfig();
	}

	/**
	 * Ajoute un document à l'historique s'il n'y figure pas déjà.
	 * @returns l'entrée d'historique correspondante.
	 */
	async addToHistory(data: LegalDocument) {
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

	/** Affiche le panneau latéral des articles cités par la note active. */
	async activateArticlesView() {
		await this.app.workspace.ensureSideLeaf(ARTICLES_VIEW, "right", { active: true, reveal: true });
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

	/** Peut-on interroger l'API ? (identifiants renseignés) */
	get hasCredentials() {
		const { clientId, clientSecret } = this.credentials;
		return !!(clientId && clientSecret);
	}

	/** Identifiants PISTE, lus dans le trousseau d'Obsidian (vides si aucun secret n'est choisi). */
	get credentials() {
		const { secretStorage } = this.app;
		const read = (name: string) => (name ? secretStorage.getSecret(name)?.trim() ?? "" : "");
		return { clientId: read(this.settings.clientIdSecret), clientSecret: read(this.settings.clientSecretSecret) };
	}

	/** Paramètres de connexion à l'API : réglages et identifiants du trousseau. */
	get connection(): ConnectionSettings {
		const { apiHost, tokenHost, maxRequestsPerMinute } = this.settings;
		return { apiHost, tokenHost, maxRequestsPerMinute, ...this.credentials };
	}

	/** Ouvre le document dans un onglet de lecture, en réutilisant celui déjà ouvert. */
	async openDocument(doc: DocumentData) {
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
	async activateResultsView(search: DocumentSearch) {
		const { workspace } = this.app;
		const leaf =
			workspace.getLeavesOfType(SEARCH_RESULT_VIEW)[0] ?? workspace.getLeaf("tab");

		await leaf.setViewState({ type: SEARCH_RESULT_VIEW, active: true });
		await workspace.revealLeaf(leaf);
		(leaf.view as SearchResultView).setSearch(search);
	}

	/**
	 * Crée la note d'un document de l'historique à partir du modèle des réglages, sauf si le coffre en a déjà une
	 * (ouverte à la place, ou choisie par l'utilisateur en cas de doute).
	 */
	async createNoteFor(data: LegalDocument) {
		try {
			if (!(await shouldCreateNote(this, data))) return;
			await createNote(this.app, this.settings, data);
		} catch (error) {
			console.error(error);
			new Notice("Impossible de créer la note.");
		}
	}
}
