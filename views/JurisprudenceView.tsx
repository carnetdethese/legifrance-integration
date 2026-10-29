import { JurisprudencePanel } from "./components/jurisprudence/JurisprudencePanel";
import { ReactItemView } from "./ReactItemView";

export const JURISPRUDENCE_VIEW = "jurisprudence-view";

/** Onglet d'analyse de la jurisprudence du coffre : à faire, chronologie, articles et décisions. */
export class JurisprudenceView extends ReactItemView {
	getViewType() {
		return JURISPRUDENCE_VIEW;
	}

	getDisplayText() {
		return "Jurisprudence";
	}

	getIcon() {
		return "gavel";
	}

	protected contentClasses() {
		return ["is-juris"];
	}

	protected renderContent() {
		return <JurisprudencePanel />;
	}
}
