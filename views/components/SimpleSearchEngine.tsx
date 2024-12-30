import { React, useState } from "react";
import * as constants from "../../api/constants";

export const SimpleSearchEngine = () => {
	const [counter, setCounter] = useState(0);

	return (
		<>
			<div className="search-criterium">
				<label>Recherche</label>
				<input type="text" />
			</div>
			<div className="search-criterium">
				<select>
					{Array.from(constants.typeRecherche.entries()).map(
						([v, k]) => {
							return <option value={v} key={v}>{k}</option>;
						}
					)}
				</select>
				<select>
					{Array.from(constants.operateursRecherche.entries()).map(
						([v, k]) => {
							return <option value={v} key={v}>{k}</option>;
						}
					)}
				</select>
			</div>
		</>
	);
};
