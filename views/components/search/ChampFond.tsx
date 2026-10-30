import { FONDS, FondGroup } from "abstracts/fonds";
import { Field } from "./Field";

interface ChampFondProps {
	fond: string;
	onChange: (fond: string) => void;
}

/** Groupes de fonds, dans l'ordre d'affichage. */
const GROUPS = [...new Set(FONDS.map((fond) => fond.group))] as FondGroup[];

/** Liste déroulante du fond de données (jurisprudence, législation…). */
export const ChampFond = ({ fond, onChange }: ChampFondProps) => (
	<Field label="Chercher dans" htmlFor="legifrance-fond">
		<select id="legifrance-fond" className="dropdown" value={fond} onChange={(e) => onChange(e.target.value)}>
			{GROUPS.map((group) => (
				<optgroup key={group} label={group}>
					{FONDS.filter((f) => f.group === group).map((f) => (
						<option key={f.code} value={f.code}>
							{f.label}
						</option>
					))}
				</optgroup>
			))}
		</select>
	</Field>
);
