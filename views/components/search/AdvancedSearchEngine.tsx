import * as constants from "../../../api/constants";
import React, { useState } from "react";
import { DatePicker } from "./DatePicker";
import { ChampRecherche } from "./ChampRecherche";
import { documentSearchFieldsClass } from "abstracts/searchHandler";

interface AdvancedSearchEngineProps {
	recherche: documentSearchFieldsClass;
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
	handleCritereAddOrRemove: (
		ope: string,
		critere?: number
	) => void;
}

export const AdvancedSearchEngine = ({
	recherche,
	handleDateChange,
	handleSearchTermChange,
	handleKeyDown,
	handleTypeRechercheChange,
	handleOperateurRechercheChange,
	handleCritereAddOrRemove
}: AdvancedSearchEngineProps) => {
	const [counter, setCounter] = useState(1);
	const champs = [];

	for (let i = 0; i < counter; i++) {
		champs.push(<ChampRecherche
			key={i}
			rank={i}
			handleKeyDown={handleKeyDown}
			handleOperateurRechercheChange={handleOperateurRechercheChange}
			handleSearchTermChange={handleSearchTermChange}
			handleTypeRechercheChange={handleTypeRechercheChange}
			recherche={recherche}
		/>)
	}

	function handleClick(e) {
		let newValue = 1;
		if (e.target.value == "plus") {
			newValue = counter + 1;
			if (newValue > 4) return;
			handleCritereAddOrRemove('add', newValue);
		}
		else if (e.target.value == "moins") {
			newValue = counter - 1;
			if (newValue == 0) return;
			handleCritereAddOrRemove('remove', newValue);
		}
		setCounter(newValue);
	}

	return (
		<>
			{!constants.fondSansDate.includes(recherche.fond) ? (
				<DatePicker handleDateChange={handleDateChange} />
			) : null}{" "}

			{champs}
			<div className="setting-item">
			<div className="setting-item-info">
				<label className="setting-item-name">Champs</label>
			</div>
			<div className="setting-item-control">
				<button disabled={counter == 4 ? true : false}  value={"plus"} onClick={(e) => handleClick(e)}>+</button>
				<button disabled={counter == 1 ? true : false}  value={"moins"} onClick={(e) => handleClick(e)}>-</button>
			</div>
		</div>
		</>
	);
};
