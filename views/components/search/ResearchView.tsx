import { Notice } from "obsidian";
import { useState } from "react";
import { DocumentSearch } from "abstracts/searchHandler";
import { usePlugin } from "views/hooks";
import { ChampFond } from "./ChampFond";
import { HistoriqueView } from "./HistoriqueView";
import { SearchForm } from "./SearchForm";

/** Panneau de recherche : mode simple ou avancé, lancement, historique. */
export const ResearchView = () => {
	const plugin = usePlugin();
	const [recherche, setRecherche] = useState(() => new DocumentSearch());
	const [advanced, setAdvanced] = useState(false);

	/** Le mode simple n'affiche qu'un critère : on écarte les autres pour qu'ils ne faussent pas la recherche. */
	function selectMode(isAdvanced: boolean) {
		setAdvanced(isAdvanced);
		if (!isAdvanced) setRecherche(recherche.keepFirstCritere());
	}

	function submit() {
		if (!recherche.fond) {
			new Notice("Choisissez un fond.");
			return;
		}
		void plugin.activateResultsView(recherche);
	}

	return (
		<div className="legifrance-search">
			<div className="legifrance-tabs" role="tablist">
				{[
					[false, "Recherche simple"],
					[true, "Recherche avancée"],
				].map(([isAdvanced, label]) => (
					<button
						key={label as string}
						role="tab"
						aria-selected={advanced === isAdvanced}
						className={advanced === isAdvanced ? "is-active" : ""}
						onClick={() => selectMode(isAdvanced as boolean)}
					>
						{label}
					</button>
				))}
			</div>

			<ChampFond
				fond={recherche.fond}
				onChange={(fond) => setRecherche(recherche.updatingFond(fond, true)!)}
			/>
			<SearchForm
				recherche={recherche}
				onChange={setRecherche}
				onSubmit={submit}
				advanced={advanced}
			/>

			<button className="mod-cta legifrance-submit" onClick={submit}>
				Rechercher
			</button>

			<HistoriqueView />
		</div>
	);
};
