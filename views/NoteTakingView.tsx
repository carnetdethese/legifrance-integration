import { NoteTaking } from "./components/notes/NoteTaking";
import { ReactItemView } from "./ReactItemView";

export const NOTE_TAKING_VIEW = "note-taking-view";

/** Éditeur de note : champs personnalisés avant création du fichier. */
export class NoteTakingView extends ReactItemView {
	getViewType() {
		return NOTE_TAKING_VIEW;
	}

	getDisplayText() {
		return "Notes";
	}

	getIcon() {
		return "file-pen";
	}

	protected renderContent() {
		return <NoteTaking />;
	}
}
