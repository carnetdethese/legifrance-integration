import { ChevronLeft, ChevronRight } from "lucide-react";
import { SettingRow } from "../SettingRow";

const PAGE_SIZES = [10, 25, 50, 100];

interface ResultsNavProps {
	totalResults: number;
	totalPageNumber: number;
	currentPage: number;
	resultsPerPage: number;
	/** Critère de tri actif. */
	sort: string;
	/** Critères de tri propres au fond (code API → libellé). */
	critereTri: Record<string, string>;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	onSortChange: (sort: string) => void;
}

/** Barre de navigation des résultats : tri, taille de page, pagination. */
export const ResultsNav = ({
	totalResults,
	totalPageNumber,
	currentPage,
	resultsPerPage,
	sort,
	critereTri,
	onPageChange,
	onPageSizeChange,
	onSortChange,
}: ResultsNavProps) => (
	<SettingRow
		name={`${totalResults} résultat${totalResults > 1 ? "s" : ""}`}
		desc={`Page ${currentPage} sur ${totalPageNumber}`}
	>
		<select
			className="dropdown"
			aria-label="Tri"
			value={sort}
			onChange={(e) => onSortChange(e.target.value)}
		>
			<option value="PERTINENCE">Pertinence</option>
			{Object.entries(critereTri)
				.filter(([key]) => key !== "pertinence")
				.map(([key, label]) => (
					<option key={key} value={key}>
						{label}
					</option>
				))}
		</select>
		<select
			className="dropdown"
			aria-label="Résultats par page"
			value={resultsPerPage}
			onChange={(e) => onPageSizeChange(Number(e.target.value))}
		>
			{PAGE_SIZES.map((size) => (
				<option key={size} value={size}>
					{size}
				</option>
			))}
		</select>
		<button
			aria-label="Page précédente"
			disabled={currentPage <= 1}
			onClick={() => onPageChange(currentPage - 1)}
		>
			<ChevronLeft size={16} />
		</button>
		<button
			aria-label="Page suivante"
			disabled={currentPage >= totalPageNumber}
			onClick={() => onPageChange(currentPage + 1)}
		>
			<ChevronRight size={16} />
		</button>
	</SettingRow>
);
