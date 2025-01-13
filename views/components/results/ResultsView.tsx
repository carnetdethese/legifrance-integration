import { ResultsNav } from "./ResultsNav";
import { ResultCard } from "./ResultCard";
import { getDocumentInfo, legalDocument } from "abstracts/document";
import LegifrancePlugin from "main";
import { getAgentChercheur, getValeurRecherche } from "globals/globals";
import { documentDataStorage } from "views/viewsData";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { useEffect, useState } from "react";
import { Notice } from "obsidian";
import { resultatsRechercheClass } from "abstracts/searches";
import { usePlugin } from "views/hooks";

interface ResultsViewProps {
	searchHandler: documentSearchFieldsClass;
}

export const ResultsView = ({ searchHandler }: ResultsViewProps) => {
	const plugin = usePlugin() as LegifrancePlugin;
	const [results, setResults] = useState<legalDocument[]>();
	const [totalResults, setTotalResults] = useState(0);
	const [totalPages, setTotalPages] = useState(0);

	useEffect(() => {
		const fetchData = async () => {
			await fetchResults();
		};
		fetchData();
	}, []);

	async function fetchResults() {
		const check = await searchHandler.checkBeforeSearch();

		if (check == "false") return;

		try {
			const data = await searchHandler.search();
			const totalRes = data.totalResultNumber;
			setTotalResults(data.totalResultNumber);
			setTotalPages(Math.ceil(totalRes / searchHandler.getPageSize()));
			setResults(new resultatsRechercheClass(data).listeResultats());
		} catch (error) {
			console.error("Error performing search:", error);
			new Notice(
				"Une erreur est survenue durant la requête. Veuillez vérifier vos identifiants et réessayer."
			);
		}
	}

	async function handleClickDocument(e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) {
		const target = e.target as HTMLAnchorElement;
		if (!results) return;

		const selectedDocument = results.find(
			(elt: legalDocument) => elt.id == target.dataset.id
		) as legalDocument;

		// TODO : Revoir la logique de cette fonction pour éliminer les variables globales.
		const documentFinal = await getDocumentInfo(
			selectedDocument,
			getValeurRecherche(),
			getAgentChercheur()
		) as legalDocument;


		const historiqueLength = plugin.historiqueDocuments.length
		const id =
		historiqueLength > 0
				? plugin.historiqueDocuments.slice(-1)[0].id + 1
				: 1;

		const newView = new documentDataStorage(id, documentFinal);
		plugin.historiqueDocuments.push(newView)
		plugin.docToShow = newView;
		plugin.saveSettings();
		plugin.activateTextReaderView();
	}

	async function handlePaginationClick(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
		const way = e.currentTarget.dataset.way;

		// Check if way is defined and is either "previous" or "next"
		if (way) {
			const currentPage = searchHandler.getCurrentPageNumber();

			// Determine the new page number based on the direction
			const newPageNumber =
				way === "previous" ? currentPage - 1 : currentPage + 1;

			// Validate the new page number
			if (way === "previous" && currentPage > 0) {
				searchHandler.updatePageNumber(newPageNumber);
			} else if (way === "next" && currentPage < totalPages) {
				searchHandler.updatePageNumber(newPageNumber);
			}

			// Fetch results after updating the page number
			await fetchResults();
		}
	}

	async function handleChangeItemsPerPage(e: React.ChangeEvent<HTMLSelectElement>) {
		const target = e.currentTarget as HTMLSelectElement;
		searchHandler.updatePageSize(parseInt(target.value));
		await fetchResults();
	}

	async function handleCriteresTriChange(e: React.ChangeEvent<HTMLSelectElement>) {

		searchHandler.updateFacette(e.target.value);
		await fetchResults();
	}

	return (
		<>
			<h2>Résulats</h2>
			<ResultsNav
				totalResults={totalResults}
				totalPageNumber={totalPages}
				currentPage={searchHandler.getCurrentPageNumber()}
				handlePaginationClick={handlePaginationClick}
				resultsPerPage={searchHandler.getPageSize()}
				critereTri={searchHandler.criteresTri}
				handleChangeItemsPerPage={handleChangeItemsPerPage}
				handleCriteresTriChange={handleCriteresTriChange}
			/>
			{results
				? results.map((value) => {
						return (
							<ResultCard
								key={value.id}
								result={value}
								handleClickDocument={handleClickDocument}
							/>
						);
				})
				: "No data. Loading..."}
		</>
	);
};
