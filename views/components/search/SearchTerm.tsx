import { documentSearchFieldsClass } from "abstracts/searchHandler";

interface SearchTermProps {
	recherche: documentSearchFieldsClass;
	rank: number;
	handleSearchTermChange: (
		event: React.ChangeEvent<HTMLInputElement>
	) => void;
	handleKeyDown: (
		event: React.KeyboardEvent<HTMLInputElement>
	) => void;
}

export const SearchTerm = ({
	recherche,
	rank,
	handleSearchTermChange,
	handleKeyDown,
}: SearchTermProps) => {
	return (
		<div className="setting-item">
			<div className="setting-item-info">
				<label className="setting-item-name">Recherche</label>
			</div>
			<div className="setting-item-control">
				<input
					type="text"
					name={String(rank)}
					onChange={(e) => handleSearchTermChange(e)}
					onKeyDown={(e) => handleKeyDown(e)}
					data-rank={rank}
					value={recherche.recherche.champs[0].criteres[rank].valeur}
				/>
			</div>
		</div>
	);
};
