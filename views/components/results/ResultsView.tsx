/**
 * Résultats d'une recherche : liste paginée (`ResultCard`, `ResultsNav`). Ouvrir un résultat passe par
 * `plugin.readLegalDocument` (base d'abord, sinon l'API, puis historique et lecteur) ; un code s'ouvre par sa table des matières.
 */
import { Notice } from "obsidian";
import { useEffect, useState } from "react";
import { LegalDocument } from "abstracts/document";
import { DocumentSearch } from "abstracts/searchHandler";
import { SearchResults } from "abstracts/searches";
import { removeTags } from "lib/tools";
import { usePlugin } from "views/hooks";
import { ResultCard } from "./ResultCard";
import { Facet, FacetFilters } from "./FacetFilters";
import { Pager, ResultsNav } from "./ResultsNav";

interface ResultsViewProps {
	searchHandler: DocumentSearch;
}

type Status = "loading" | "done" | "error";

/** Résultats d'une recherche : requête, pagination et ouverture des documents. */
export const ResultsView = ({ searchHandler }: ResultsViewProps) => {
	const plugin = usePlugin();
	const [results, setResults] = useState<LegalDocument[]>([]);
	const [totalResults, setTotalResults] = useState(0);
	const [status, setStatus] = useState<Status>("loading");
	/** Tri fait sur la page (`client:…`), vide si c'est celui de l'API. */
	const [pageSort, setPageSort] = useState("");
	/** Facettes de la recherche (nature, état, code…) : celles d'une facette filtrée restent celles d'avant, pour pouvoir changer de choix. */
	const [facets, setFacets] = useState<Facet[]>([]);

	const pageSize = searchHandler.getPageSize();
	const totalPages = Math.ceil(totalResults / pageSize);

	/** Exécute la recherche avec l'état courant de `searchHandler`. */
	async function fetchResults() {
		if (!searchHandler.checkBeforeSearch()) {
			setStatus("done"); // dates invalides : la notification suffit
			return;
		}

		setStatus("loading");
		try {
			const data = await searchHandler.search();
			setTotalResults(data.totalResultNumber);
			setFacets((previous) =>
				(data.facets ?? []).map((facet) => (searchHandler.facetFilters[facet.facetElem]?.length ? previous.find((p) => p.facetElem === facet.facetElem) ?? facet : facet))
			);
			setResults(new SearchResults(data).listeResultats());
			setStatus("done");
		} catch (error) {
			console.error("Erreur lors de la recherche :", error);
			new Notice("Une erreur est survenue durant la requête. Vérifiez vos identifiants et réessayez.");
			setStatus("error");
		}
	}

	useEffect(() => {
		void fetchResults();
	}, []);

	/** Applique une modification de la recherche puis relance la requête. */
	function updateAndFetch(update: () => void) {
		update();
		void fetchResults();
	}

	async function openDocument(selected: LegalDocument) {
		// Un code entier est trop vaste pour une page de lecture : on l'ouvre par sa table des matières.
		if (selected.id.startsWith("LEGITEXT") && selected.nature?.toUpperCase() === "CODE") {
			await plugin.openCode(selected.id, removeTags(selected.titre));
			return;
		}
		await plugin.readLegalDocument(selected, { search: searchHandler.getSearchedString() });
	}

	/** Valeur du sélecteur de tri : le tri fait ici sur la page s'il y en a un, sinon celui de l'API. */
	const sortValue = pageSort || searchHandler.getFacette();

	function changeSort(value: string) {
		if (value.startsWith("client:")) {
			setPageSort(value);
			return;
		}
		setPageSort("");
		updateAndFetch(() => {
			searchHandler.updateFacette(value);
			searchHandler.updatePageNumber(1);
		});
	}

	// Tri de la page, fait ici : la page affichée est celle que l'API a donnée.
	const visible = results
		.slice()
		.sort((a, b) => {
			if (pageSort === "client:title") return removeTags(a.titre).localeCompare(removeTags(b.titre), "fr");
			if (pageSort === "client:date-desc" || pageSort === "client:date-asc") {
				// Sans date, à la fin dans les deux sens.
				if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0;
				return pageSort === "client:date-desc" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
			}
			return 0;
		});
	const currentPage = searchHandler.getCurrentPageNumber();
	const goToPage = (page: number) => {
		updateAndFetch(() => searchHandler.updatePageNumber(page));
	};

	return (
		<div className="legifrance-results">
			<h2>Résultats</h2>
			<ResultsNav
				totalResults={totalResults}
				shown={visible.length}
				resultsPerPage={pageSize}
				sort={sortValue}
				critereTri={searchHandler.criteresTri}
				onSortChange={changeSort}
				onPageSizeChange={(size) =>
					updateAndFetch(() => {
						searchHandler.updatePageSize(size);
						searchHandler.updatePageNumber(1);
					})
				}
			/>
			<FacetFilters
				facets={facets}
				selected={searchHandler.facetFilters}
				onToggle={(facette, value) =>
					updateAndFetch(() => {
						searchHandler.toggleFacet(facette, value);
						searchHandler.updatePageNumber(1);
					})
				}
				onClear={() =>
					updateAndFetch(() => {
						searchHandler.clearFacets();
						searchHandler.updatePageNumber(1);
					})
				}
			/>
			{status === "done" && facets.length === 0 && searchHandler.fond === "ALL" && (
				<p className="legifrance-row-meta">Pour affiner par nature (lois, décrets…), par état ou par code, choisissez un fond précis dans le formulaire (« Lois et règlements », « Codes »…).</p>
			)}
			{status === "loading" && <p className="legifrance-empty">Recherche en cours…</p>}
			{status === "error" && <p className="legifrance-empty">La recherche a échoué.</p>}
			{status === "done" && results.length === 0 && <p className="legifrance-empty">Aucun résultat.</p>}
			{status === "done" &&
				visible.map((result, index) => (
					<ResultCard
						key={`${result.id}-${index}`}
						result={result}
						onOpen={(selected) => void openDocument(selected)}
						onOpenToc={(selected) => void plugin.openCode(selected.id, removeTags(selected.titre))}
					/>
				))}
			<Pager current={currentPage} total={totalPages} onPageChange={goToPage} />
		</div>
	);
};
