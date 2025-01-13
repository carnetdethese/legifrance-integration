import { SearchTerm } from "./SearchTerm";
import { OperateursBooleens } from "./OperateursBooleens";
import { documentSearchFieldsClass } from "abstracts/searchHandler";

interface ChampRechercheProps {
    recherche: documentSearchFieldsClass;
    rank: number;
	handleSearchTermChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
	handleTypeRechercheChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
	handleOperateurRechercheChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
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
