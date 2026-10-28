import { App, SuggestModal, TFile } from "obsidian";
import type LegifrancePlugin from "main";
import { BIB_FORMATS, BibFormat } from "references/bibliography";
import { exportBibliography } from "references/insights";

/** Choix du format d'export de la bibliographie (d'une note, ou de tout le coffre si `file` est absent). */
export class ExportModal extends SuggestModal<BibFormat> {
	constructor(app: App, private plugin: LegifrancePlugin, private file?: TFile) {
		super(app);
		this.setPlaceholder(file ? `Exporter les décisions et textes cités par « ${file.basename} »` : "Exporter les décisions et textes cités dans le coffre");
	}

	getSuggestions(query: string) {
		const needle = query.toLowerCase();
		return (Object.keys(BIB_FORMATS) as BibFormat[]).filter((format) => BIB_FORMATS[format].label.toLowerCase().includes(needle));
	}

	renderSuggestion(format: BibFormat, el: HTMLElement) {
		el.setText(BIB_FORMATS[format].label);
	}

	onChooseSuggestion(format: BibFormat) {
		void exportBibliography(this.plugin, format, this.file);
	}
}
