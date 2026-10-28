import { App, Modal, Setting } from "obsidian";

/** Ce que l'utilisateur sait du texte ou de l'article, pour le chercher à nouveau. */
export interface RefinedText {
	/** « loi », « ordonnance », « décret »… (textes seulement). */
	nature: string;
	number: string;
	date: string;
	/** Mots du titre, pour une recherche libre (textes seulement). */
	keywords: string;
	/** Lien ou identifiant Légifrance : remplace la recherche. */
	link: string;
}

const NATURES = ["loi", "loi organique", "loi constitutionnelle", "loi de finances", "ordonnance", "décret", "décret-loi", "arrêté"];

/**
 * Formulaire de recherche d'un texte ou d'un article non retrouvé, prérempli avec ce que les notes (ou un essai
 * précédent) en disent ; `null` si annulé.
 * @param article un article n'a ni nature, ni date, ni titre : seuls le numéro et le lien comptent
 */
export function refineText(app: App, label: string, article: boolean, initial: Partial<RefinedText>): Promise<RefinedText | null> {
	return new Promise((resolve) => {
		const value: RefinedText = { nature: "", number: "", date: "", keywords: "", link: "", ...initial };
		let answered = false;
		const modal = new (class extends Modal {
			onOpen() {
				this.setTitle(article ? "Préciser l'article" : "Préciser le texte");
				this.contentEl.createEl("p", { text: `Cité comme : ${label}`, cls: "setting-item-description" });
				if (!article) {
					new Setting(this.contentEl).setName("Nature").addDropdown((dropdown) => {
						dropdown.addOption("", "—");
						for (const nature of NATURES) dropdown.addOption(nature, nature);
						dropdown.setValue(value.nature).onChange((v) => (value.nature = v));
					});
				}
				new Setting(this.contentEl)
					.setName("Numéro")
					.setDesc(article ? "Numéro de l'article (L. 121-1, 1240…)" : "Numéro du texte (2016-1321)")
					.addText((text) => text.setValue(value.number).onChange((v) => (value.number = v)));
				if (!article) {
					new Setting(this.contentEl).setName("Date").setDesc("JJ/MM/AAAA ou AAAA-MM-JJ (date de signature)").addText((text) => text.setValue(value.date).onChange((v) => (value.date = v)));
					new Setting(this.contentEl).setName("Mots du titre").setDesc("Recherche libre dans les textes : plusieurs résultats vous sont proposés.").addText((text) => text.setValue(value.keywords).onChange((v) => (value.keywords = v)));
				}
				new Setting(this.contentEl)
					.setName("Lien ou identifiant")
					.setDesc("Si vous l'avez (page Légifrance, LEGITEXT…, LEGIARTI…, JORFTEXT…) : la recherche est inutile.")
					.addText((text) => text.setValue(value.link).onChange((v) => (value.link = v)));
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
