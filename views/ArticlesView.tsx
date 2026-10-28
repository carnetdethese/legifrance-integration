import { ArticlesPanel } from "./components/articles/ArticlesPanel";
import { ReactItemView } from "./ReactItemView";

export const ARTICLES_VIEW = "articles-view";

/** Panneau latéral : les articles cités par la note active (statut, texte, versions, décisions) et leurs notes. */
export class ArticlesView extends ReactItemView {
	getViewType() {
		return ARTICLES_VIEW;
	}

	getDisplayText() {
		return "Articles de la note";
	}

	getIcon() {
		return "scroll-text";
	}

	protected renderContent() {
		return <ArticlesPanel />;
	}
}
