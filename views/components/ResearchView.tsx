import { act, useState } from "react";
import { ResearchTypeButtons } from "./ResearchTypeButtons";
import { ChampFond } from "./ChampFond";
import { SimpleSearchEngine } from "./SimpleSearchEngine";

export const ResearchView = () => {
	const [activeResearchType, setActiveResearchType] = useState("simple");

	function handleResearchTypeClick(e) {
		setActiveResearchType(e.target.value);
	}

	return (
		<>
			<div className="research-view-legifrance">
				<div className="research-type">
					<ResearchTypeButtons
						activeType={"simple"}
						handleClick={handleResearchTypeClick}
					/>
					<ResearchTypeButtons
						activeType={"avancee"}
						handleClick={handleResearchTypeClick}
					/>
				</div>
				
				<ChampFond />
				{activeResearchType == "simple" ? <SimpleSearchEngine /> : ""}
			</div>
    
		</>
	);
};
