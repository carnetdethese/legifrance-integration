import { App, Modal, Setting, TFile } from "obsidian";
import type LegifrancePlugin from "main";
import { BIB_FORMATS, BibFilter, BibFormat } from "references/bibliography";
import { ExportTarget, exportBibliography, exportableThemes } from "references/insights";

/**
 * Export de la bibliographie des décisions et textes cités (d'une note, ou de tout le coffre si `file` est
 * absent) : format, destination, et restriction éventuelle à un thème ou à une période.
 */
export class ExportModal extends Modal {
	private format: BibFormat = "bibtex";
	private target: ExportTarget = "file";
	private filter: BibFilter = {};

	constructor(app: App, private plugin: LegifrancePlugin, private file?: TFile) {
		super(app);
	}

	onOpen() {
		this.setTitle(this.file ? `Exporter les citations de « ${this.file.basename} »` : "Exporter les citations du coffre");
		const { contentEl } = this;

		new Setting(contentEl).setName("Format").addDropdown((dropdown) => {
			for (const [format, { label }] of Object.entries(BIB_FORMATS)) dropdown.addOption(format, label);
			dropdown.setValue(this.format).onChange((value) => (this.format = value as BibFormat));
		});
		new Setting(contentEl).setName("Destination").addDropdown((dropdown) =>
			dropdown
				.addOptions({ file: "Un fichier à la racine du coffre", clipboard: "Le presse-papiers" })
				.setValue(this.target)
				.onChange((value) => (this.target = value as ExportTarget))
		);

		contentEl.createEl("p", { text: "Restreindre aux décisions d'un thème ou d'une période (les articles et textes ne sont alors pas exportés).", cls: "setting-item-description" });
		new Setting(contentEl).setName("Thème").addDropdown((dropdown) => {
			dropdown.addOption("", "Tous");
			for (const theme of exportableThemes(this.plugin, this.file)) dropdown.addOption(theme, theme);
			dropdown.setValue("").onChange((value) => (this.filter.theme = value || undefined));
		});
		new Setting(contentEl)
			.setName("Période")
			.setDesc("Années, bornes comprises (par exemple 1990 à 2010).")
			.addText((text) => text.setPlaceholder("De").onChange((value) => (this.filter.from = /^\d{4}$/.test(value.trim()) ? value.trim() : undefined)))
			.addText((text) => text.setPlaceholder("À").onChange((value) => (this.filter.to = /^\d{4}$/.test(value.trim()) ? value.trim() : undefined)));

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Annuler").onClick(() => this.close()))
			.addButton((button) =>
				button.setButtonText("Exporter").setCta().onClick(async () => {
					this.close();
					await exportBibliography(this.plugin, this.format, this.file, this.filter, this.target);
				})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
