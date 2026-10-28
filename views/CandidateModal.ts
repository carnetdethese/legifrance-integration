import { App, SuggestModal } from "obsidian";
import { DecisionCandidate, SOURCES } from "references/sources";

/** Fait choisir à l'utilisateur la décision qui correspond à la fiche ; `null` s'il renonce. */
export function pickCandidate(app: App, candidates: DecisionCandidate[]): Promise<DecisionCandidate | null> {
	return new Promise((resolve) => {
		new CandidateModal(app, candidates, resolve).open();
	});
}

class CandidateModal extends SuggestModal<DecisionCandidate> {
	private chosen = false;

	constructor(app: App, private candidates: DecisionCandidate[], private done: (choice: DecisionCandidate | null) => void) {
		super(app);
		this.setPlaceholder("Plusieurs décisions correspondent : choisissez celle de la fiche");
		this.emptyStateText = "Aucune décision.";
	}

	getSuggestions(query: string) {
		const needle = query.toLowerCase();
		return this.candidates.filter((c) => c.title.toLowerCase().includes(needle));
	}

	renderSuggestion(candidate: DecisionCandidate, el: HTMLElement) {
		el.createDiv({ text: candidate.title });
		const source = SOURCES.find((s) => s.id === candidate.source)?.label ?? candidate.source;
		el.createEl("small", { text: `${source} · ${candidate.url}`, cls: "setting-item-description" });
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
