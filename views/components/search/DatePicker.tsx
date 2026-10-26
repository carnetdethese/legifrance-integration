import { SettingRow } from "../SettingRow";

interface DatePickerProps {
	/** Date de version unique (codes et lois « à une date ») au lieu d'une période. */
	single?: boolean;
	onChange: (place: "start" | "end", value: string) => void;
}

/** Période de recherche (début et fin), ou date de version unique ; champs date natifs. */
export const DatePicker = ({ single, onChange }: DatePickerProps) => (
	<>
		{!single && (
			<SettingRow name="Date de début" htmlFor="legifrance-start-date">
				<input id="legifrance-start-date" type="date" onChange={(e) => onChange("start", e.target.value)} />
			</SettingRow>
		)}
		<SettingRow name={single ? "Version en vigueur au" : "Date de fin"} htmlFor="legifrance-end-date">
			<input id="legifrance-end-date" type="date" onChange={(e) => onChange("end", e.target.value)} />
		</SettingRow>
	</>
);
