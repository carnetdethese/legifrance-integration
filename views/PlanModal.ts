import { App, SuggestModal } from "obsidian";
import type { PlanOptions } from "references/plan";

/** Variante de plan proposée : son libellé et ses options. */
interface PlanChoice {
	label: string;
	options: PlanOptions;
}

/** Choix de la forme du plan de cours : complet, liens vers les fiches seulement, ou un seul thème. */
export class PlanModal extends SuggestModal<PlanChoice> {
	private readonly choices: PlanChoice[];

	constructor(app: App, themes: string[], private onChoose: (options: PlanOptions) => void) {
		super(app);
		this.setPlaceholder("Forme du plan");
		this.choices = [
			{ label: "Plan complet (thèmes, décisions, articles)", options: {} },
			{ label: "Liens vers les fiches seulement", options: { linksOnly: true } },
			...themes.map((theme) => ({ label: `Seulement le thème : ${theme}`, options: { theme } })),
		];
	}

	getSuggestions(query: string) {
		const needle = query.toLowerCase();
		return this.choices.filter((choice) => choice.label.toLowerCase().includes(needle));
	}

	renderSuggestion(choice: PlanChoice, el: HTMLElement) {
		el.setText(choice.label);
	}

	onChooseSuggestion(choice: PlanChoice) {
		this.onChoose(choice.options);
	}
}
