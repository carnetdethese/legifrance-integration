import * as constants from "../../../api/constants";
import { DatePicker } from "./DatePicker";
import { ChampRecherche } from "./ChampRecherche";
import { documentSearchFieldsClass } from "abstracts/searchHandler";

interface SimpleSearchEngineProps {
	recherche: documentSearchFieldsClass;
	handleDateChange: (
		event: React.ChangeEvent<HTMLInputElement>
	) => void;
	handleSearchTermChange: (
		event: React.ChangeEvent<HTMLInputElement>
	) => void;
	handleKeyDown: (
		event: React.KeyboardEvent<HTMLInputElement>
	) => void;
	handleTypeRechercheChange: (
		event: React.ChangeEvent<HTMLSelectElement>
	) => void;
	handleOperateurRechercheChange: (
		event: React.ChangeEvent<HTMLSelectElement>
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
