import { act, useState } from "react";
import { ResearchTypeButtons } from "./ResearchTypeButtons";

export const ResearchView = () => {
	const [activeResearchType, setActiveResearchType] = useState("simple");

	function handleResearchTypeClick(e) {
		setActiveResearchType(e.target.value);
	}

	return (
		<>
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
            
		</>
	);
};
