import { ReactNode } from "react";
import { DocumentSearch } from "abstracts/searchHandler";
import { ResultsView } from "./components/results/ResultsView";
import { ReactItemView } from "./ReactItemView";

export const SEARCH_RESULT_VIEW = "search-result-view";

/** Onglet de résultats ; réutilisé (et rechargé) à chaque nouvelle recherche. */
export class SearchResultView extends ReactItemView {
	private search?: DocumentSearch;
	/** Change à chaque recherche pour remonter `ResultsView` et relancer la requête. */
	private searchCount = 0;

	getViewType() {
		return SEARCH_RESULT_VIEW;
	}

	getDisplayText() {
		return "Résultats";
	}

	getIcon() {
		return "search";
	}

	setSearch(search: DocumentSearch) {
		this.search = search;
		this.searchCount++;
		this.update();
	}

	protected renderContent(): ReactNode {
		return this.search ? (
			<ResultsView key={this.searchCount} searchHandler={this.search} />
		) : null;
	}
}
