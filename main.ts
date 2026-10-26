import { Events, Notice, Plugin, TFile, debounce, normalizePath } from "obsidian";
import { agentSearch } from "api/utilities";
import { legalDocument } from "abstracts/document";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { createNote } from "creation/newNote";
import { ERROR_RETRY_MS, ReferenceIndex } from "references";
import { LegalDatabase } from "references/database";
import { ENRICH_TASK, INDEX_TASK, Task } from "references/indexer";
import { ResolvedLink } from "references/resolver";
import { LegalRef, searchUrl } from "references/parser";
import { canResolve, resolveReference } from "references/resolver";
import { ApiError } from "api/client";
import {
	DEFAULT_SETTINGS,
	LegifranceSettings,
	LegifranceSettingTab,
} from "settings/settings";
import { NOTE_TAKING_VIEW, NoteTakingView } from "views/NoteTakingView";
import { RESEARCH_TEXT_VIEW, ResearchTextView } from "views/ResearchTextView";
import { SEARCH_RESULT_VIEW, SearchResultView } from "views/SearchResultView";
import { REFERENCES_VIEW, ReferencesView } from "views/ReferencesView";
import { TEXT_READER_VIEW, TextReaderView } from "views/TextReaderView";
import { documentDataStorage } from "views/viewsData";

/** Événement déclenché à chaque modification de l'historique. */
export const HISTORY_EVENT = "history-change";

/** Événement déclenché lorsqu'un lien de référence est retrouvé via l'API. */
export const REFERENCES_EVENT = "references-change";

/** Contenu de `data.json`. */
interface PluginData {
	data: documentDataStorage[];
	settings: LegifranceSettings;
	/** Anciens liens de références, avant la base SQLite : repris une fois puis abandonnés. */
	references?: { links?: Record<string, ResolvedLink>; misses?: Record<string, number> };
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
	/** Références juridiques détectées dans les notes du coffre, dans la base SQLite (voir `references/`). */
	references: ReferenceIndex;
	private database: LegalDatabase;
	/** Une tâche longue (indexation, complément des fiches) est en cours. */
	taskRunning = false;
	/** Enregistre le fichier SQLite après une rafale de modifications (analyses de notes). */
	private saveDatabaseSoon = debounce(() => this.saveDatabase(), 2000, true);
	/** Notes modifiées en attente de réanalyse. */
	private pendingNotes = new Set<TFile>();
	private reindexSoon = debounce(() => this.reindexPendingNotes(), 2000, true);

	async onload() {
		LegifrancePlugin.instance = this;
		const legacy = await this.loadSettings();
		this.agent = new agentSearch(this.settings);
		await this.openDatabase(legacy);

		this.registerView(RESEARCH_TEXT_VIEW, (leaf) => new ResearchTextView(leaf, this));
		this.registerView(SEARCH_RESULT_VIEW, (leaf) => new SearchResultView(leaf, this));
		this.registerView(TEXT_READER_VIEW, (leaf) => new TextReaderView(leaf, this));
		this.registerView(REFERENCES_VIEW, (leaf) => new ReferencesView(leaf, this));
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
			id: "indexer-coffre",
			name: "Indexer les références juridiques du coffre",
			callback: () => this.runTask(INDEX_TASK),
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
		// Dernière écriture de la base à la fermeture d'Obsidian.
		this.registerEvent(this.app.workspace.on("quit", () => this.saveDatabase()));

		this.addSettingTab(new LegifranceSettingTab(this.app, this));

		// Une recherche ne peut pas être restaurée : on ferme les onglets de résultats orphelins.
		this.app.workspace.onLayoutReady(() =>
			this.app.workspace.detachLeavesOfType(SEARCH_RESULT_VIEW)
		);
	}

	onunload() {
		void this.saveDatabase();
	}

	/** Charge les réglages et l'historique ; renvoie les anciennes données de références, à reprendre. */
	async loadSettings() {
		const saved: Partial<PluginData> | null = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings);
		this.historiqueDocuments = saved?.data ?? [];
		return saved?.references;
	}

	private get databasePath() {
		return normalizePath(`${this.manifest.dir}/${DATABASE_FILE}`);
	}

	/** Ouvre la base (la crée si le fichier n'existe pas) et y reprend les anciens liens de `data.json`. */
	private async openDatabase(legacy: PluginData["references"]) {
		const { adapter } = this.app.vault;
		const exists = await adapter.exists(this.databasePath);
		const bytes = exists ? new Uint8Array(await adapter.readBinary(this.databasePath)) : undefined;
		this.database = await LegalDatabase.open(bytes, () => this.saveDatabaseSoon());
		this.references = new ReferenceIndex(this.database);

		if (legacy?.links || legacy?.misses) {
			this.references.importLegacy(legacy);
			await this.saveSettings(); // `references` n'est plus écrit dans data.json
		}
	}

	/** Écrit le fichier SQLite. */
	private async saveDatabase() {
		const bytes = this.database.export();
		await this.app.vault.adapter.writeBinary(
			this.databasePath,
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
		);
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
		const notice = new Notice(`${name}…`, 0);
		try {
			const report = await run(this, (done, total, label) => notice.setMessage(`${name} : ${done}/${total}\n${label}`));
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
		}
	}

	async saveSettings() {
		// Nouveaux identifiants : on peut réessayer après un refus.
		const credentials = `${this.settings.clientId}:${this.settings.clientSecret}`;
		if (credentials !== this.lastCredentials) this.referenceAuthFailed = false;
		this.lastCredentials = credentials;

		await this.saveData({
			data: this.historiqueDocuments,
			settings: this.settings,
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
	private referenceAuthFailed = false;
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
	 */
	async resolveReferences(refs: LegalRef[], force = false) {
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
				const link = this.referenceAuthFailed ? null : await resolveReference(this.agent, ref, log);
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
