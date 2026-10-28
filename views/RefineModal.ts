import { App, Modal, Setting } from "obsidian";
import { COURT_NAMES, CourtCode } from "references/fiches";

/** Ce que l'utilisateur sait de la décision, pour la chercher à nouveau. */
export interface RefinedDecision {
	court?: CourtCode;
	name: string;
	date: string;
	number: string;
	/** Lien ou identifiant Légifrance / ArianeWeb : remplace la recherche. */
	link: string;
}

/** Formulaire de recherche d'une décision introuvable, prérempli avec ce que les notes en disent ; `null` si annulé. */
export function refineDecision(app: App, label: string, initial: Partial<RefinedDecision>): Promise<RefinedDecision | null> {
	return new Promise((resolve) => {
		const value: RefinedDecision = { name: "", date: "", number: "", link: "", ...initial };
		let answered = false;
		const modal = new (class extends Modal {
			onOpen() {
				this.setTitle("Préciser la décision");
				this.contentEl.createEl("p", { text: `Citée comme : ${label}`, cls: "setting-item-description" });
				new Setting(this.contentEl).setName("Juridiction").addDropdown((dropdown) => {
					dropdown.addOption("", "—");
					for (const [code, name] of Object.entries(COURT_NAMES)) dropdown.addOption(code, name);
					dropdown.setValue(value.court ?? "").onChange((v) => (value.court = (v || undefined) as CourtCode | undefined));
				});
				new Setting(this.contentEl).setName("Nom des parties").addText((text) => text.setValue(value.name).onChange((v) => (value.name = v)));
				new Setting(this.contentEl).setName("Date").setDesc("JJ/MM/AAAA ou AAAA-MM-JJ").addText((text) => text.setValue(value.date).onChange((v) => (value.date = v)));
				new Setting(this.contentEl).setName("Numéro").setDesc("Numéro de requête ou de pourvoi").addText((text) => text.setValue(value.number).onChange((v) => (value.number = v)));
				new Setting(this.contentEl).setName("Lien ou identifiant").setDesc("Si vous l'avez (Légifrance, ArianeWeb) : la recherche est inutile.").addText((text) => text.setValue(value.link).onChange((v) => (value.link = v)));
				new Setting(this.contentEl)
					.addButton((button) => button.setButtonText("Annuler").onClick(() => this.close()))
					.addButton((button) =>
						button
							.setButtonText("Rechercher")
							.setCta()
							.onClick(() => {
								answered = true;
								this.close();
								resolve(value);
							})
					);
			}
			onClose() {
				this.contentEl.empty();
				if (!answered) resolve(null);
			}
		})(app);
		modal.open();
	});
}
