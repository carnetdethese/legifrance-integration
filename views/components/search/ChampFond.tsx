import { codeFond, codeFondBeta } from "api/constants";
import { usePlugin } from "views/hooks";
import { SettingRow } from "../SettingRow";

interface ChampFondProps {
	fond: string;
	onChange: (fond: string) => void;
}

/** Sélecteur du fond de données (jurisprudence, législation…). */
export const ChampFond = ({ fond, onChange }: ChampFondProps) => {
	const codesFond = usePlugin().settings.fondSupp ? codeFondBeta : codeFond;

	return (
		<SettingRow name="Fond" htmlFor="legifrance-fond">
			<select
				id="legifrance-fond"
				className="dropdown"
				value={fond}
				onChange={(e) => onChange(e.target.value)}
			>
				{Array.from(codesFond, ([code, label]) => (
					<option key={code} value={code}>
						{label}
					</option>
				))}
			</select>
		</SettingRow>
	);
};
