import { useEffect, useState } from "react";
import * as constants from "../../../api/constants";
import { DatePicker } from "./DatePicker";
import { SearchTerm } from "./SearchTerm";

interface SimpleSearchEngineProps {
	fond: string;
	handleDateChange: (event: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
	handleSearchTermChange: (event: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
	handleKeyDown: (event: React.MouseEvent<HTMLInputElement, KeyboardEvent>) => void;
}

export const SimpleSearchEngine = ({ fond, handleDateChange, handleSearchTermChange, handleKeyDown }: SimpleSearchEngineProps) => {

	return (
		<>
			{!constants.fondSansDate.includes(fond) ? (<DatePicker handleDateChange={handleDateChange}  />) : (null)}
			<SearchTerm rank={0} handleSearchTermChange={handleSearchTermChange} handleKeyDown={handleKeyDown}/>
			<div className="setting-item">
				<div className="setting-item-control">
					<select className="dropdown">
						{Array.from(constants.typeRecherche.entries()).map(
							([v, k]) => {
								return (
									<option value={v} key={v}>
										{k}
									</option>
								);
							}
						)}
					</select>
					<select className="dropdown">
						{Array.from(
							constants.operateursRecherche.entries()
						).map(([v, k]) => {
							return (
								<option value={v} key={v}>
									{k}
								</option>
							);
						})}
					</select>
				</div>
			</div>
		</>
	);
};
