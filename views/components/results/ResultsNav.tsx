import { ArrowBigLeft, ArrowBigRight } from "lucide-react";
import * as React from "react";

interface ResultsNavProps {
	totalResults: number;
	totalPageNumber: number;
	currentPage: number;
	resultsPerPage: number;
	critereTri: Record<string, string>;
	handlePaginationClick: (
		event: React.MouseEvent<HTMLButtonElement, MouseEvent>
	) => void;
	handleChangeItemsPerPage: (
		event: React.ChangeEvent<HTMLSelectElement>
	) => void;
	handleCriteresTriChange: (
		event: React.ChangeEvent<HTMLSelectElement>
	) => void;
}

export const ResultsNav = ({
	totalResults,
	totalPageNumber,
	currentPage,
	resultsPerPage,
	critereTri,
	handlePaginationClick,
	handleChangeItemsPerPage,
	handleCriteresTriChange,
}: ResultsNavProps) => {
	return (
		<>
			<div className="setting-item">
				<div className="setting-item-info">
					<div className="setting-item-name">
						Page {currentPage} sur {totalPageNumber} ({totalResults}{" "}
						résultats)
					</div>
				</div>
				<div className="setting-item-control">
					<select
						className="dropdown"
						name="critere-tri"
						id="critere-tri"
						onChange={(e) => handleCriteresTriChange(e)}
					>
						<option value={"pertinence"}>Pertinence</option>
						{Object.entries(critereTri).map(([key, value]) => (
							<option key={key} value={key}>{value}</option>
						))}

					</select>
					<select
						className="dropdown"
						name="results-page"
						id="results-page"
						value={resultsPerPage}
						onChange={(e) => handleChangeItemsPerPage(e)}
					>
						<option value={10}>10</option>
						<option value={25}>25</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
					</select>
					<button
						disabled={currentPage > 1 ? false : true}
						className="button"
						data-way="previous"
						onClick={(e) => handlePaginationClick(e)}
					>
						<ArrowBigLeft />
					</button>
					<button
						disabled={currentPage < totalPageNumber ? false : true}
						className="button"
						data-way="next"
						onClick={(e) => handlePaginationClick(e)}
					>
						<ArrowBigRight />
					</button>
				</div>
			</div>
		</>
	);
};
