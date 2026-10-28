import { App, SuggestModal } from "obsidian";
import { DecisionCandidate, SOURCES } from "references/sources";

/** Clef du choix « aucun de ceux-là » (`CandidateOptions.otherLabel`). */
export const OTHER_CHOICE_KEY = "__autre__";

/** Variantes du choix : invite affichée, et choix supplémentaire pour préciser autrement. */
export interface CandidateOptions {
	placeholder?: string;
	/** Ajoute un dernier choix (clef `OTHER_CHOICE_KEY`) : aucun candidat ne convient. */
	otherLabel?: string;
}

/** Fait choisir à l'utilisateur la décision ou le texte qui convient ; `null` s'il renonce. */
export function pickCandidate(app: App, candidates: DecisionCandidate[], options: CandidateOptions = {}): Promise<DecisionCandidate | null> {
	return new Promise((resolve) => {
		new CandidateModal(app, candidates, resolve, options).open();
	});
}

class CandidateModal extends SuggestModal<DecisionCandidate> {
	private chosen = false;

	constructor(app: App, private candidates: DecisionCandidate[], private done: (choice: DecisionCandidate | null) => void, private options: CandidateOptions) {
		super(app);
		this.setPlaceholder(options.placeholder ?? "Plusieurs décisions correspondent : choisissez celle de la fiche");
		this.emptyStateText = "Aucun résultat.";
	}

	getSuggestions(query: string) {
		const needle = query.toLowerCase();
		const other: DecisionCandidate[] = this.options.otherLabel ? [{ source: "", key: OTHER_CHOICE_KEY, title: this.options.otherLabel, url: "" }] : [];
		return [...this.candidates.filter((c) => c.title.toLowerCase().includes(needle)), ...other];
	}

	renderSuggestion(candidate: DecisionCandidate, el: HTMLElement) {
		el.createDiv({ text: candidate.title });
		if (candidate.key === OTHER_CHOICE_KEY) return;
		const source = SOURCES.find((s) => s.id === candidate.source)?.label ?? candidate.source;
		el.createEl("small", { text: `${source} — ${candidate.url}`, cls: "setting-item-description" });
	}

	onChooseSuggestion(candidate: DecisionCandidate) {
		this.chosen = true;
		this.done(candidate);
	}

	onClose() {
		super.onClose();
		// onClose précède onChooseSuggestion : on laisse le choix aboutir avant de conclure à un abandon.
		window.setTimeout(() => !this.chosen && this.done(null), 0);
	}
}
