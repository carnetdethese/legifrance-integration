import * as constants from "../../../api/constants";
import React from "react";
import { DatePicker } from "./DatePicker";
import { SearchTerm } from "./SearchTerm";
import { OperateursBooleens } from "./OperateursBooleens";
import { ChampRecherche } from "./ChampRecherche";

interface AdvancedSearchEngineProps {
	fond: string;
	handleDateChange: (
		event: React.MouseEvent<HTMLInputElement, MouseEvent>
	) => void;
	handleSearchTermChange: (
		event: React.MouseEvent<HTMLInputElement, MouseEvent>
	) => void;
	handleKeyDown: (
		event: React.MouseEvent<HTMLInputElement, KeyboardEvent>
	) => void;
	handleTypeRechercheChange: (
		event: React.MouseEvent<HTMLSelectElement, MouseEvent>
	) => void;
	handleOperateurRechercheChange: (
		event: React.MouseEvent<HTMLSelectElement, MouseEvent>
	) => void;
}

export const AdvancedSearchEngine = ({
	fond,
	handleDateChange,
	handleSearchTermChange,
	handleKeyDown,
	handleTypeRechercheChange,
	handleOperateurRechercheChange,
}: AdvancedSearchEngineProps) => {
	return (
		<>
			{!constants.fondSansDate.includes(fond) ? (
				<DatePicker handleDateChange={handleDateChange} />
			) : null}{" "}
			
			<ChampRecherche
				handleKeyDown={handleKeyDown}
				handleOperateurRechercheChange={handleOperateurRechercheChange}
				handleSearchTermChange={handleSearchTermChange}
				handleTypeRechercheChange={handleTypeRechercheChange}
			/>
		</>
	);
};
