import { App, Modal, Setting, TFile } from "obsidian";
import type LegifrancePlugin from "main";
import { BIB_FORMATS, BibFilter, BibFormat } from "references/bibliography";
import { ExportTarget, exportBibliography, exportableThemes } from "references/insights";

/**
 * Export de la bibliographie des décisions et textes cités : portée (la note `file` si elle est donnée, ou tout le
 * coffre), format, destination, et restriction éventuelle à un thème ou à une période.
 */
export class ExportModal extends Modal {
	private format: BibFormat = "bibtex";
	private target: ExportTarget = "file";
	private filter: BibFilter = {};
	/** Note exportée, ou `undefined` pour tout le coffre. */
	private exported?: TFile;

	/** @param file note proposée à l'export (retenue par défaut) ; sans elle, seul le coffre entier est proposé */
	constructor(app: App, private plugin: LegifrancePlugin, private file?: TFile) {
		super(app);
		this.exported = file;
	}

	onOpen() {
		this.setTitle("Exporter la bibliographie");
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		if (this.file) {
			new Setting(contentEl).setName("Portée").addDropdown((dropdown) =>
				dropdown
					.addOptions({ note: `La note « ${this.file!.basename} »`, vault: "Tout le coffre" })
					.setValue(this.exported ? "note" : "vault")
					.onChange((value) => {
						this.exported = value === "note" ? this.file : undefined;
						// Les thèmes proposés dépendent de la portée.
						this.filter.theme = undefined;
						this.render();
					})
			);
		}

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
			for (const theme of exportableThemes(this.plugin, this.exported)) dropdown.addOption(theme, theme);
			dropdown.setValue("").onChange((value) => (this.filter.theme = value || undefined));
		});
		new Setting(contentEl)
			.setName("Période")
			.setDesc("Années, bornes comprises (par exemple 1990 à 2010).")
			.addText((text) => text.setPlaceholder("De").setValue(this.filter.from ?? "").onChange((value) => (this.filter.from = /^\d{4}$/.test(value.trim()) ? value.trim() : undefined)))
			.addText((text) => text.setPlaceholder("À").setValue(this.filter.to ?? "").onChange((value) => (this.filter.to = /^\d{4}$/.test(value.trim()) ? value.trim() : undefined)));

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Annuler").onClick(() => this.close()))
			.addButton((button) =>
				button.setButtonText("Exporter").setCta().onClick(async () => {
					this.close();
					await exportBibliography(this.plugin, this.format, this.exported, this.filter, this.target);
				})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
