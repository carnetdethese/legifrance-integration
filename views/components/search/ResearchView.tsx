import { useState } from "react";
import { ResearchTypeButtons } from "./ResearchTypeButtons";
import { ChampFond } from "./ChampFond";
import { SimpleSearchEngine } from "../search/SimpleSearchEngine";
import { AdvancedSearchEngine } from "./AdvancedSearchEngine";
import { documentSearchFieldsClass } from "abstracts/searchHandler";

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

	function handleLaunchSearchClick() {
		console.log(recherche);
		recherche.launchSearch();
	}

	function handleSearchTermChange(e) {
		const newSearch = recherche;
		newSearch.updateValue(0,0,e.target.value);
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
					<SimpleSearchEngine handleDateChange={handleDateChange} handleSearchTermChange={handleSearchTermChange} />
				) : (
					<AdvancedSearchEngine handleDateChange={handleDateChange} />
				)}
				<SubmitButton
					handleLaunchSearchClick={handleLaunchSearchClick}
				/>
			</div>
		</>
	);
};
