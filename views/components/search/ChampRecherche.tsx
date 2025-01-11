import { SearchTerm } from "./SearchTerm";
import { OperateursBooleens } from "./OperateursBooleens";
import { documentSearchFieldsClass } from "abstracts/searchHandler";

interface ChampRechercheProps {
    recherche: documentSearchFieldsClass;
    rank: number;
	handleSearchTermChange: (event: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
	handleKeyDown: (event: React.MouseEvent<HTMLInputElement, KeyboardEvent>) => void;
	handleTypeRechercheChange: (event: React.MouseEvent<HTMLSelectElement, MouseEvent>) => void;
	handleOperateurRechercheChange: (event: React.MouseEvent<HTMLSelectElement, MouseEvent>) => void;
}

export const ChampRecherche = ({
    recherche,
    rank,
	handleSearchTermChange,
	handleKeyDown,
	handleOperateurRechercheChange,
	handleTypeRechercheChange
}: ChampRechercheProps) => {
	return (
		<>
			<SearchTerm
				rank={rank}
				handleSearchTermChange={handleSearchTermChange}
				handleKeyDown={handleKeyDown}
                recherche={recherche}
			/>
			<OperateursBooleens
				recherche={recherche}
				rank={rank}
				handleOperateurRechercheChange={handleOperateurRechercheChange}
				handleTypeRechercheChange={handleTypeRechercheChange}
			/>
		</>
	);
};
