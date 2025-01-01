import React from "react";
import { ArrowBigLeft, ArrowBigRight } from "lucide-react";

interface ResultsNavProps {
	totalResults: number;
	totalPageNumber: number
}

export const ResultsNav = ({ totalResults, totalPageNumber }: ResultsNavProps) => {
	return (
		<>
			<div className="setting-item">
				<div className="setting-item-info">
					<div className="setting-item-name">
						Page 1 sur {totalPageNumber}({totalResults} résultats)
					</div>
				</div>
				<div className="setting-item-control">
					<select
						className="dropdown"
						name="critere-tri"
						id="critere-tri"
					></select>
					<select
						className="dropdown"
						name="results-page"
						id="results-page"
					></select>
                    <button className="button"><ArrowBigLeft /></button><button className="button"><ArrowBigRight /></button>
				</div>
			</div>
		</>
	);
};
