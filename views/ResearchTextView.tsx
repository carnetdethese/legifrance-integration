import { ResearchView } from "./components/search/ResearchView";
import { ReactItemView } from "./ReactItemView";

export const RESEARCH_TEXT_VIEW = "research-text-view";

/** Panneau latéral : formulaire de recherche et historique des documents. */
export class ResearchTextView extends ReactItemView {
	getViewType() {
		return RESEARCH_TEXT_VIEW;
	}

	getDisplayText() {
		return "Légifrance";
	}

	getIcon() {
		return "scale";
	}

	protected contentClasses() {
		return ["is-side-panel"];
	}

	protected renderContent() {
		return <ResearchView />;
	}
}
