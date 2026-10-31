import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Notice } from "obsidian";
import { useState } from "react";
import { typeRecherche } from "api/constants";
import { openExternal } from "lib/links";
import { searchUrl } from "references/parser";
import { DocumentSearch } from "abstracts/searchHandler";
import { usePlugin } from "views/hooks";
import { ChampFond } from "./ChampFond";
import { Field } from "./Field";
import { HistoriqueView } from "./HistoriqueView";
import { SearchOptions } from "./SearchOptions";

/**
 * Panneau de recherche : un seul formulaire. La recherche courante tient en trois champs (les termes, le fond, la façon de
 * chercher) ; les critères supplémentaires et la période sont sous « Options », dépliées à la demande. Puis l'historique.
 */
export const ResearchView = () => {
	const plugin = usePlugin();
	const [recherche, setRecherche] = useState(() => new DocumentSearch());
	const [showOptions, setShowOptions] = useState(false);
	const criteres = recherche.recherche.champs[0].criteres;
	const first = criteres[0];

	// Ce que les options contiennent d'actif, pour le dire sur le bouton quand elles sont repliées.
	const [filter] = recherche.recherche.filtres;
	const hasDate = !!filter && (filter.dates.start.toString() !== "" || filter.dates.end.toString() !== "");
	const active = criteres.length - 1 + (hasDate ? 1 : 0);

	function submit() {
		if (!recherche.fond) {
			new Notice("Choisissez un fond.");
			return;
		}
		// Sans identifiants PISTE, pas de recherche dans l'API : la recherche s'ouvre sur le site de Légifrance.
		if (!plugin.hasCredentials) {
			if (first.valeur.trim()) openExternal(searchUrl(first.valeur.trim()));
			else new Notice("Saisissez les termes à rechercher.");
			return;
		}
		void plugin.activateResultsView(recherche);
	}

	return (
		<div className="legifrance-search">
			<form
				className="legifrance-search-form"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<div className="legifrance-searchbox">
					<Search size={16} />
					<input
						type="search"
						aria-label="Termes recherchés"
						placeholder="Rechercher…"
						value={first.valeur}
						onChange={(e) => setRecherche(recherche.updateValue(0, 0, e.target.value, true) as DocumentSearch)}
					/>
				</div>
				<ChampFond fond={recherche.fond} onChange={(fond) => setRecherche(recherche.updatingFond(fond, true)!)} />
				<Field label="Correspondance" htmlFor="legifrance-type">
					<select
						id="legifrance-type"
						className="dropdown"
						value={first.typeRecherche}
						onChange={(e) => setRecherche(recherche.updateTypeRechercheChamp(0, 0, e.target.value, true) as DocumentSearch)}
					>
						{Array.from(typeRecherche, ([code, label]) => (
							<option key={code} value={code}>{label}</option>
						))}
					</select>
				</Field>

				<button type="button" className="legifrance-options-toggle" aria-expanded={showOptions} onClick={() => setShowOptions(!showOptions)}>
					{showOptions ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
					Options
					{active > 0 && <span className="legifrance-badge is-alert">{active}</span>}
				</button>
				{showOptions && <SearchOptions recherche={recherche} onChange={setRecherche} onSubmit={submit} />}

				<button type="submit" className="mod-cta legifrance-submit">
					{plugin.hasCredentials ? "Rechercher" : "Rechercher sur legifrance.gouv.fr"}
				</button>
				{!plugin.hasCredentials && (
					<p className="legifrance-empty">
						Mode sans API : la recherche s'ouvre dans votre navigateur. Avec des identifiants PISTE (réglages, « Premiers pas »), les résultats s'affichent ici et les textes se lisent dans Obsidian.
					</p>
				)}
			</form>

			<HistoriqueView />
		</div>
	);
};
