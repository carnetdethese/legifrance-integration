import * as constants from "../../../api/constants";
import { DatePicker } from "./DatePicker";
import { ChampRecherche } from "./ChampRecherche";

interface SimpleSearchEngineProps {
	fond: string;
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
}

export const SimpleSearchEngine = ({
	fond,
	handleDateChange,
	handleSearchTermChange,
	handleKeyDown,
	handleTypeRechercheChange,
	handleOperateurRechercheChange,
}: SimpleSearchEngineProps) => {
	return (
		<>
			{!constants.fondSansDate.includes(fond) ? (
				<DatePicker handleDateChange={handleDateChange} />
			) : null}
			<ChampRecherche
				handleKeyDown={handleKeyDown}
				handleOperateurRechercheChange={handleOperateurRechercheChange}
				handleSearchTermChange={handleSearchTermChange}
				handleTypeRechercheChange={handleTypeRechercheChange}
			/>
		</>
	);
};
