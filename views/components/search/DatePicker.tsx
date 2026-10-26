import { SettingRow } from "../SettingRow";

interface DatePickerProps {
	onChange: (place: "start" | "end", value: string) => void;
}

/** Bornes de la période de recherche (champs date natifs). */
export const DatePicker = ({ onChange }: DatePickerProps) => (
	<>
		<SettingRow name="Date de début" htmlFor="legifrance-start-date">
			<input
				id="legifrance-start-date"
				type="date"
				onChange={(e) => onChange("start", e.target.value)}
			/>
		</SettingRow>
		<SettingRow name="Date de fin" htmlFor="legifrance-end-date">
			<input
				id="legifrance-end-date"
				type="date"
				onChange={(e) => onChange("end", e.target.value)}
			/>
		</SettingRow>
	</>
);
