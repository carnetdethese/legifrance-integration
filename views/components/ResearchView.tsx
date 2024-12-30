import { useState } from "react";
import { ResearchTypeButtons } from "./ResearchTypeButtons";
import { ChampFond } from "./ChampFond";
import { SimpleSearchEngine } from "./SimpleSearchEngine";
import { AdvancedSearchEngine } from "./AdvancedSearchEngine";

const SubmitButton = ({ handleLaunchSearchClick }) => {
	return (
		<div className="setting-item">
			<div className="setting-item-control">
				<button className="mod-cta" onClick={handleLaunchSearchClick}>Valider</button>
			</div>
		</div>
	);
};

export const ResearchView = () => {
	const [activeResearchType, setActiveResearchType] = useState("simple");
	const [activeFond, setActiveFond] = useState(null);
	const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
	const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));

	function handleResearchTypeClick(e) {
		setActiveResearchType(e.target.value);
	}

	function handleFondSelect(e) {
		setActiveFond(e.target.value);
	}

	function handleDateChange(e) {
		if (e.target.name == "start-date") setStartDate(e.target.value);
		else if (e.target.name == "end-date") setEndDate(e.target.value);
	}

	function handleLaunchSearchClick() {
		console.log(activeFond, startDate, endDate)
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
				{activeResearchType == "simple" ? <SimpleSearchEngine handleDateChange={handleDateChange} /> : <AdvancedSearchEngine handleDateChange={handleDateChange} />}
				<SubmitButton handleLaunchSearchClick={handleLaunchSearchClick} />
			</div>
		</>
	);
};
