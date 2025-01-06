import { useState } from "react";
import { ResearchTypeButtons } from "./ResearchTypeButtons";
import { HistoriqueView } from './HistoriqueView';
import { ChampFond } from "./ChampFond";
import { SimpleSearchEngine } from "../search/SimpleSearchEngine";
import { AdvancedSearchEngine } from "./AdvancedSearchEngine";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import LegifrancePlugin from "main";
import { usePlugin } from "../../hooks";


const SubmitButton = ({ handleLaunchSearchClick }) => {
	return (
		<div className="setting-item">
			<div className="setting-item-control">
				<button className="mod-cta" onClick={handleLaunchSearchClick}>
					Valider
				</button>
			</div>
		</div>
	);
};

export const ResearchView = () => {
	const plugin = usePlugin() as LegifrancePlugin;
	const [recherche, setRecherche] = useState<documentSearchFieldsClass>(
		new documentSearchFieldsClass()
	);
	const [activeResearchType, setActiveResearchType] = useState("simple");


	function handleResearchTypeClick(e) {
		setActiveResearchType(e.target.value);
	}

	function handleFondSelect(e) {
		const newSearch = recherche;
		newSearch.updatingFond(e.target.value);
		setRecherche(newSearch);
	}

	function handleDateChange(e) {
		if (e.target.name == "start-date") {
			const newSearch = recherche;
			newSearch.recherche.filtres[0].dates.start = e.target.value;
			setRecherche(newSearch);
		} else if (e.target.name == "end-date") {
			const newSearch = recherche;
			newSearch.recherche.filtres[0].dates.end = e.target.value;
			setRecherche(newSearch);
		}
	}

	async function handleLaunchSearchClick() {
		const pluginInstance = LegifrancePlugin.instance;
		pluginInstance.activateResultsView(recherche);
	}

	function handleSearchTermChange(e) {
		const newSearch = recherche;
		newSearch.updateValue(0, 0, e.target.value);
	}

	function handleKeyDown(e) {
		if (e.key == "Enter") handleLaunchSearchClick();
	}

	return (
		<>
			<div className="view-content">
				<div className="setting-item">
					<div className="setting-item-control">
						<ResearchTypeButtons
							type={"simple"}
							handleClick={handleResearchTypeClick}
							activeType={activeResearchType}
						/>
						<ResearchTypeButtons
							type={"avancee"}
							handleClick={handleResearchTypeClick}
							activeType={activeResearchType}
						/>
					</div>
				</div>

				<ChampFond handleFondSelect={handleFondSelect} />
				{activeResearchType == "simple" ? (
					<SimpleSearchEngine
						fond={recherche.fond}
						handleDateChange={handleDateChange}
						handleSearchTermChange={handleSearchTermChange}
						handleKeyDown={handleKeyDown}

					/>
				) : (
					<AdvancedSearchEngine handleDateChange={handleDateChange} />
				)}
				<SubmitButton
					handleLaunchSearchClick={handleLaunchSearchClick}
				/>
				<HistoriqueView />
			</div>
		</>
	);
};
