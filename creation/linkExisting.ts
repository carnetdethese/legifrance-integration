import { App, Notice, SuggestModal, TFile } from "obsidian";
import { LegalDocument } from "abstracts/document";
import type LegifrancePlugin from "main";
import { ficheUpdates, isFiche } from "references/fiches";
import { mayBeFicheOf, mentionsId, valuesOfDocument } from "./existing";

/** Choix de la fenêtre : une note du coffre, ou `null` pour créer une nouvelle note. */
type Choice = TFile | null;

/** Notes du coffre qui sont, ou pourraient être, la fiche du document. */
export interface ExistingNotes {
	/** Notes qui portent l'identifiant du document : c'est bien lui. */
	sure: TFile[];
	/** Fiches sans identifiant dont le numéro (ou la date et le nom) correspond : à confirmer. */
	maybe: TFile[];
}

/** Cherche dans le coffre les notes du document : par identifiant Légifrance, puis par numéro pour les fiches sans identifiant. */
export function findExistingNotes(plugin: LegifrancePlugin, data: LegalDocument): ExistingNotes {
	const { app, settings, references } = plugin;
	const sure = new Map<string, TFile>();
	const maybe: TFile[] = [];

	const registered = references.ficheByLegifranceId(data.id);
	const registeredFile = registered ? app.vault.getFileByPath(registered) : null;
	if (registeredFile) sure.set(registeredFile.path, registeredFile);

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (mentionsId(frontmatter, data.id)) sure.set(file.path, file);
		else if (data.type === "jurisprudence" && mayBeFicheOf(frontmatter, settings, data)) maybe.push(file);
	}
	return { sure: [...sure.values()], maybe };
}

/**
 * Lie la note à la décision : l'identifiant Légifrance est écrit dans la propriété prévue, et les propriétés vides de
 * la fiche sont renseignées d'après le document (celles déjà remplies sont conservées, sauf réglage « remplacer »).
 */
async function linkFiche(plugin: LegifrancePlugin, file: TFile, data: LegalDocument) {
	const { settings } = plugin;
	if (!isFiche(plugin.app.metadataCache.getFileCache(file)?.frontmatter, settings)) return;
	await plugin.app.fileManager.processFrontMatter(file, (front) => Object.assign(front, ficheUpdates(front, settings, valuesOfDocument(data), data.id)));
}

/**
 * Fait choisir à l'utilisateur la note du document parmi `files`, ou une nouvelle note.
 * @returns la note choisie, `null` pour en créer une nouvelle, `undefined` s'il renonce
 */
function pickNote(app: App, files: TFile[], sureCount: number): Promise<Choice | undefined> {
	return new Promise((resolve) => new NoteModal(app, files, sureCount, resolve).open());
}

class NoteModal extends SuggestModal<Choice> {
	private chosen = false;

	constructor(app: App, private files: TFile[], private sureCount: number, private done: (choice: Choice | undefined) => void) {
		super(app);
		this.setPlaceholder("Ce document a peut-être déjà une note : choisissez-la, ou créez-en une nouvelle");
		this.emptyStateText = "Aucune note.";
	}

	getSuggestions(query: string): Choice[] {
		const needle = query.toLowerCase();
		return [...this.files.filter((f) => f.path.toLowerCase().includes(needle)), null];
	}

	renderSuggestion(file: Choice, el: HTMLElement) {
		if (!file) return void el.createDiv({ text: "Créer une nouvelle note" });
		el.createDiv({ text: file.basename });
		const sure = this.files.indexOf(file) < this.sureCount;
		el.createEl("small", { text: `${sure ? "Porte l'identifiant de ce document" : "Fiche possible (même numéro)"} — ${file.path}`, cls: "setting-item-description" });
	}

	onChooseSuggestion(file: Choice) {
		this.chosen = true;
		this.done(file);
	}

	onClose() {
		super.onClose();
		// onClose précède onChooseSuggestion : on laisse le choix aboutir avant de conclure à un abandon.
		window.setTimeout(() => !this.chosen && this.done(undefined), 0);
	}
}

/**
 * Avant de créer la note d'un document, vérifie que le coffre ne l'a pas déjà. Une seule note porte son identifiant :
 * on l'ouvre. En cas de doute (plusieurs notes, ou seulement des fiches de même numéro), l'utilisateur choisit la note,
 * qui est alors liée au document, ou demande une nouvelle note.
 * @returns `true` s'il faut créer une nouvelle note
 */
export async function shouldCreateNote(plugin: LegifrancePlugin, data: LegalDocument): Promise<boolean> {
	const { app } = plugin;
	const { sure, maybe } = findExistingNotes(plugin, data);
	if (sure.length === 0 && maybe.length === 0) return true;

	let note: TFile | null | undefined;
	if (sure.length === 1 && maybe.length === 0) note = sure[0];
	else {
		note = await pickNote(app, [...sure, ...maybe], sure.length);
		if (note === undefined) return false;
	}
	if (note === null) return true;

	try {
		await linkFiche(plugin, note, data);
	} catch (error) {
		console.error(error);
		new Notice("La note n'a pas pu être liée au document.");
	}
	await app.workspace.getLeaf("tab").openFile(note);
	new Notice(`Ce document a déjà une note : ${note.path}`);
	return false;
}
