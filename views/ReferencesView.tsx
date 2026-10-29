import { ReferencesPanel } from "./components/references/ReferencesPanel";
import { ReactItemView } from "./ReactItemView";

export const REFERENCES_VIEW = "references-view";

/** Panneau latéral : références juridiques de la note active, avec liens Légifrance. */
export class ReferencesView extends ReactItemView {
	getViewType() {
		return REFERENCES_VIEW;
	}

	getDisplayText() {
		return "Références juridiques";
	}

	getIcon() {
		return "landmark";
	}

	protected contentClasses() {
		return ["is-side-panel"];
	}

	protected renderContent() {
		return <ReferencesPanel />;
	}
}
