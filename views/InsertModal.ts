import { App, Editor, Notice, SuggestModal, TFile } from "obsidian";
import type LegifrancePlugin from "main";
import { noteBibliography, noteDecisionsTable, notePlan, notePlanThemes } from "references/insights";
import { PlanModal } from "./PlanModal";

/** Ce que l'on peut insérer dans la note : son libellé et l'insertion (qui peut demander un second choix). */
interface InsertChoice {
	label: string;
	description: string;
	insert: (plugin: LegifrancePlugin, editor: Editor, file: TFile) => void;
}

const NOT_ANALYZED = "(ou la note n'est pas encore analysée)";

/** Insère `text` à la fin de la sélection : jamais de texte remplacé. */
const insertAfterSelection = (editor: Editor, text: string) => editor.replaceRange(`\n${text}\n`, editor.getCursor("to"));

const CHOICES: InsertChoice[] = [
	{
		label: "Table des décisions citées",
		description: "Un tableau des décisions citées dans la note",
		insert: (plugin, editor, file) => {
			const table = noteDecisionsTable(plugin, file);
			if (!table) return void new Notice(`Aucune décision citée dans cette note ${NOT_ANALYZED}.`);
			insertAfterSelection(editor, table);
		},
	},
	{
		label: "Plan des décisions citées",
		description: "Par thème : décisions et articles appliqués (la forme du plan se choisit ensuite)",
		insert: (plugin, editor, file) => {
			const themes = notePlanThemes(plugin, file);
			if (themes.length === 0) return void new Notice(`Aucune décision citée dans cette note ${NOT_ANALYZED}.`);
			new PlanModal(plugin.app, themes, (options) => {
				const plan = notePlan(plugin, file, options);
				if (!plan || plan.split("\n").length < 3) return void new Notice("Rien à insérer : aucune décision de cette note n'a de fiche.");
				insertAfterSelection(editor, plan);
			}).open();
		},
	},
	{
		label: "Bibliographie des décisions et textes cités",
		description: "La liste des décisions et textes cités dans la note",
		insert: (plugin, editor, file) => {
			const bibliography = noteBibliography(plugin, file);
			if (!bibliography) return void new Notice(`Aucune décision ni aucun texte cité dans cette note ${NOT_ANALYZED}.`);
			insertAfterSelection(editor, bibliography);
		},
	},
];

/** Choix de ce qu'il faut insérer dans la note ouverte (table, plan, bibliographie). */
export class InsertModal extends SuggestModal<InsertChoice> {
	constructor(app: App, private plugin: LegifrancePlugin, private editor: Editor, private file: TFile) {
		super(app);
		this.setPlaceholder("Que faut-il insérer dans la note ?");
	}

	getSuggestions(query: string) {
		const needle = query.toLowerCase();
		return CHOICES.filter((choice) => choice.label.toLowerCase().includes(needle));
	}

	renderSuggestion(choice: InsertChoice, el: HTMLElement) {
		el.createDiv({ text: choice.label });
		el.createEl("small", { text: choice.description, cls: "setting-item-description" });
	}

	onChooseSuggestion(choice: InsertChoice) {
		choice.insert(this.plugin, this.editor, this.file);
	}
}
