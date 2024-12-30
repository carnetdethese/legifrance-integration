import LegifrancePlugin from "../../main";
import * as constants from "../../api/constants";
import { useState } from "react";

export const ChampFond = () => {
	const [activeFond, setActiveFond] = useState(null);

	const buttonStyle = {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		gap: "1rem",
	};

	const pluginInstance = LegifrancePlugin.instance;
	let codesFond = new Map<string, string>();

	if (pluginInstance.settings.fondSupp) codesFond = constants.codeFondBeta;
	else codesFond = constants.codeFond;

	function handleFondSelect(e) {
		setActiveFond(e.target.value);
	}

	return (
		<>
			<div className="search-criterium">
				<label htmlFor="fond-field">Fond :</label>
				<select
					name="fond-field"
					id="fond-field"
					onChange={handleFondSelect}
				>
					{Array.from(codesFond.entries()).map(([k, v]) => (
						<option key={k} value={k}>
							{v}
						</option>
					))}
				</select>
			</div>
			<div className="search-criterium">
				<label>Opérateur général :</label>
				<select>
					{Array.from(constants.operateursRecherche.entries()).map(
						([k, v]) => (
							<option key={k} value={k}>
								{v}
							</option>
						)
					)}
				</select>
			</div>
		</>
	);
};
