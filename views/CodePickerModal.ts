import { App, FuzzySuggestModal, Notice } from "obsidian";
import { CodeEntry, loadCodes } from "abstracts/legislation";
import type LegifrancePlugin from "main";

/** Choix d'un code en vigueur (liste de l'API, filtrée au fil de la frappe) dont on ouvre la table des matières. */
export class CodePickerModal extends FuzzySuggestModal<CodeEntry> {
	private codes: CodeEntry[] = [];

	constructor(app: App, private plugin: LegifrancePlugin) {
		super(app);
		this.setPlaceholder("Nom d'un code…");
	}

	onOpen() {
		void super.onOpen();
		if (!this.plugin.hasCredentials) {
			new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
			this.close();
			return;
		}
		loadCodes(this.plugin.api)
			.then((codes) => {
				this.codes = codes;
				// Relance la liste : elle était vide à l'ouverture.
				this.inputEl.dispatchEvent(new Event("input"));
			})
			.catch((error) => new Notice(`Liste des codes indisponible (${error instanceof Error ? error.message : "erreur inconnue"}).`));
	}

	getItems() {
		return this.codes;
	}

	getItemText(code: CodeEntry) {
		return code.title;
	}

	onChooseItem(code: CodeEntry) {
		void this.plugin.openCode(code.id, code.title);
	}
}
