import { Events, Notice, Plugin, TFile, debounce } from "obsidian";
import { agentSearch } from "api/utilities";
import { legalDocument } from "abstracts/document";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { createNote } from "creation/newNote";
import { ReferenceData, ReferenceIndex, emptyReferenceData } from "references";
import { LegalRef, searchUrl } from "references/parser";
import { resolveReference } from "references/resolver";
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
	references?: ReferenceData;
}

export default class LegifrancePlugin extends Plugin {
	static instance: LegifrancePlugin;
	settings: LegifranceSettings;
	agent: agentSearch;
	/** Événements internes : les vues React s'y abonnent via `useHistorique`. */
	readonly events = new Events();
	/** Documents consultés. Toujours remplacé, jamais muté, pour le rendu React. */
	historiqueDocuments: documentDataStorage[] = [];
	/** Références juridiques détectées dans les notes du coffre (voir `references/`). */
	references: ReferenceIndex;
	/** Enregistre les données après une rafale de modifications (analyses de notes). */
	private saveSoon = debounce(() => this.saveSettings(), 1000, true);

	async onload() {
		LegifrancePlugin.instance = this;
		await this.loadSettings();
		this.agent = new agentSearch(this.settings);

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

		// Le cache des références suit les renommages et suppressions de notes.
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => this.references.rename(oldPath, file.path))
		);
		this.registerEvent(this.app.vault.on("delete", (file) => this.references.remove(file.path)));

		this.addSettingTab(new LegifranceSettingTab(this.app, this));

		// Une recherche ne peut pas être restaurée : on ferme les onglets de résultats orphelins.
		this.app.workspace.onLayoutReady(() =>
			this.app.workspace.detachLeavesOfType(SEARCH_RESULT_VIEW)
		);
	}

	async loadSettings() {
		const saved: Partial<PluginData> | null = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings);
		this.historiqueDocuments = saved?.data ?? [];
		this.references = new ReferenceIndex(
			saved?.references ?? emptyReferenceData(),
			() => this.saveSoon()
		);
	}

	async saveSettings() {
		await this.saveData({
			data: this.historiqueDocuments,
			settings: this.settings,
			references: this.references.data,
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
		return this.references.linkFor(ref)?.url ?? searchUrl(ref.query);
	}

	/**
	 * Retrouve via l'API le document d'une référence et mémorise son lien.
	 * @returns `true` si un document a été trouvé.
	 */
	async resolveReference(ref: LegalRef) {
		try {
			const link = await resolveReference(this.agent, ref);
			if (!link) return false;
			this.references.setLink(ref, link);
			this.events.trigger(REFERENCES_EVENT);
			return true;
		} catch (error) {
			console.error(error);
			new Notice("Impossible de contacter Légifrance. Vérifiez vos identifiants dans les réglages.");
			return false;
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
