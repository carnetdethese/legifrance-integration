import { SearchTerm } from "./SearchTerm";
import { OperateursBooleens } from "./OperateursBooleens";

interface ChampRechercheProps {
	handleSearchTermChange: (event: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
	handleKeyDown: (event: React.MouseEvent<HTMLInputElement, KeyboardEvent>) => void;
	handleTypeRechercheChange: (event: React.MouseEvent<HTMLSelectElement, MouseEvent>) => void;
	handleOperateurRechercheChange: (event: React.MouseEvent<HTMLSelectElement, MouseEvent>) => void;
}

export const ChampRecherche = ({
	handleSearchTermChange,
	handleKeyDown,
	handleOperateurRechercheChange,
	handleTypeRechercheChange,
}: ChampRechercheProps) => {
	return (
		<>
			<SearchTerm
				rank={0}
				handleSearchTermChange={handleSearchTermChange}
				handleKeyDown={handleKeyDown}
			/>
			<OperateursBooleens
				handleOperateurRechercheChange={handleOperateurRechercheChange}
				handleTypeRechercheChange={handleTypeRechercheChange}
			/>
		</>
	);
};
