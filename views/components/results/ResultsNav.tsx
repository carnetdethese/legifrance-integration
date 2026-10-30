import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZES = [10, 25, 50, 100];

/** Tris faits ici, sur les résultats de la page, quand le fond n'en propose pas lui-même (codes, tous les fonds…). */
export const PAGE_SORTS: Record<string, string> = {
	"client:date-desc": "Date, la plus récente (cette page)",
	"client:date-asc": "Date, la plus ancienne (cette page)",
	"client:title": "Titre, de A à Z (cette page)",
};

interface ResultsNavProps {
	totalResults: number;
	/** Résultats affichés sur la page (moins que `resultsPerPage` si un filtre en écarte). */
	shown: number;
	resultsPerPage: number;
	/** Valeur du tri actif : un critère de l'API, ou `client:…`. */
	sort: string;
	/** Critères de tri propres au fond (code API → libellé). */
	critereTri: Record<string, string>;
	onPageSizeChange: (size: number) => void;
	onSortChange: (sort: string) => void;
}

/** En-tête des résultats : leur nombre, le tri et la taille de page. */
export const ResultsNav = ({ totalResults, shown, resultsPerPage, sort, critereTri, onPageSizeChange, onSortChange }: ResultsNavProps) => {
	const serverSorts = Object.entries(critereTri).filter(([key]) => key !== "pertinence");
	return (
		<div className="legifrance-results-bar">
			<p className="legifrance-results-count">
				<strong>{totalResults.toLocaleString("fr-FR")}</strong> résultat{totalResults > 1 ? "s" : ""}
				{shown < resultsPerPage && shown < totalResults && <span className="legifrance-row-meta"> — {shown} sur cette page</span>}
			</p>
			<label className="legifrance-results-control">
				Trier par
				<select className="dropdown" value={sort} onChange={(event) => onSortChange(event.target.value)}>
					<option value="PERTINENCE">Pertinence</option>
					{serverSorts.map(([key, label]) => (
						<option key={key} value={key}>{label}</option>
					))}
					{serverSorts.length === 0 && Object.entries(PAGE_SORTS).map(([key, label]) => (
						<option key={key} value={key}>{label}</option>
					))}
				</select>
			</label>
			<label className="legifrance-results-control">
				Par page
				<select className="dropdown" value={resultsPerPage} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
					{PAGE_SIZES.map((size) => (
						<option key={size} value={size}>{size}</option>
					))}
				</select>
			</label>
		</div>
	);
};

/** Pagination : page précédente et suivante. */
export const Pager = ({ current, total, onPageChange }: { current: number; total: number; onPageChange: (page: number) => void }) =>
	total > 1 ? (
		<div className="legifrance-pager">
			<button disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
				<ChevronLeft size={16} /> Précédente
			</button>
			<span>Page {current} sur {total}</span>
			<button disabled={current >= total} onClick={() => onPageChange(current + 1)}>
				Suivante <ChevronRight size={16} />
			</button>
		</div>
	) : null;
