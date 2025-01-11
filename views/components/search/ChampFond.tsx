import LegifrancePlugin from "../../../main";
import * as constants from "../../../api/constants";

interface ChampFondProps {
	fond: string,
	handleFondSelect: (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
}

export const ChampFond = ({ fond, handleFondSelect }: ChampFondProps) => {
	const pluginInstance = LegifrancePlugin.instance;
	let codesFond = new Map<string, string>();

	if (pluginInstance.settings.fondSupp) codesFond = constants.codeFondBeta;
	else codesFond = constants.codeFond;

	return (
		<>
			<div className="setting-item">
				<div className="setting-item-info">
					<label htmlFor="fond-field" className="setting-item-name">
						Fond
					</label>
				</div>

				<div className="setting-item-control">
					<select
						className="dropdown"
						name="fond-field"
						id="fond-field"
						onChange={(e) => handleFondSelect(e)}
						value={fond}
					>
						{Array.from(codesFond.entries()).map(([k, v]) => (
							<option key={k} value={k}>
								{v}
							</option>
						))}
					</select>
				</div>
			</div>
		</>
	);
};
