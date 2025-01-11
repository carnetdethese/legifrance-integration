import * as constants from "../../../api/constants";
import { DatePicker } from "./DatePicker";
import { ChampRecherche } from "./ChampRecherche";
import { documentSearchFieldsClass } from "abstracts/searchHandler";

interface SimpleSearchEngineProps {
	recherche: documentSearchFieldsClass;
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
	recherche,
	handleDateChange,
	handleSearchTermChange,
	handleKeyDown,
	handleTypeRechercheChange,
	handleOperateurRechercheChange,
}: SimpleSearchEngineProps) => {
	return (
		<>
			{!constants.fondSansDate.includes(recherche.fond) ? (
				<DatePicker handleDateChange={handleDateChange} />
			) : null}
			<ChampRecherche
				rank={0}
				recherche={recherche}
				handleKeyDown={handleKeyDown}
				handleOperateurRechercheChange={handleOperateurRechercheChange}
				handleSearchTermChange={handleSearchTermChange}
				handleTypeRechercheChange={handleTypeRechercheChange}
			/>
		</>
	);
};
