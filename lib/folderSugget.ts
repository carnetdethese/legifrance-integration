import { AbstractInputSuggest, App, TFolder } from "obsidian";

/** Complétion des dossiers du coffre dans un champ texte (API native d'Obsidian). */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const needle = query.toLowerCase();
		return this.app.vault
			.getAllFolders(true)
			.filter((folder) => folder.path.toLowerCase().includes(needle));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder) {
		this.setValue(folder.path);
		// Notifie le `onChange` du réglage, qui n'écoute que l'événement `input`.
		this.inputEl.trigger("input");
		this.close();
	}
}
