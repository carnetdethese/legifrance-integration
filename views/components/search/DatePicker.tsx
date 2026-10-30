import { Field } from "./Field";

interface DatePickerProps {
	/** Date de version unique (codes et lois « à une date ») au lieu d'une période. */
	single?: boolean;
	onChange: (place: "start" | "end", value: string) => void;
}

/** Période de recherche (début et fin côte à côte), ou date de version unique ; champs date natifs. */
export const DatePicker = ({ single, onChange }: DatePickerProps) =>
	single ? (
		<Field label="Version en vigueur au" htmlFor="legifrance-end-date">
			<input id="legifrance-end-date" type="date" onChange={(e) => onChange("end", e.target.value)} />
		</Field>
	) : (
		<div className="legifrance-field-pair">
			<Field label="Du" htmlFor="legifrance-start-date">
				<input id="legifrance-start-date" type="date" onChange={(e) => onChange("start", e.target.value)} />
			</Field>
			<Field label="Au" htmlFor="legifrance-end-date">
				<input id="legifrance-end-date" type="date" onChange={(e) => onChange("end", e.target.value)} />
			</Field>
		</div>
	);
