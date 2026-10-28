import { Notice } from "obsidian";
import { useEffect, useState } from "react";
import { getDocumentInfo, legalDocument } from "abstracts/document";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { resultatsRechercheClass } from "abstracts/searches";
import { documentRow, storedLegalDocument } from "references/stored";
import { usePlugin } from "views/hooks";
import { ResultCard } from "./ResultCard";
import { ResultsNav } from "./ResultsNav";

interface ResultsViewProps {
	searchHandler: documentSearchFieldsClass;
}

type Status = "loading" | "done" | "error";

/** Résultats d'une recherche : requête, pagination et ouverture des documents. */
export const ResultsView = ({ searchHandler }: ResultsViewProps) => {
	const plugin = usePlugin();
	const [results, setResults] = useState<legalDocument[]>([]);
	const [totalResults, setTotalResults] = useState(0);
	const [status, setStatus] = useState<Status>("loading");

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
			setResults(new resultatsRechercheClass(data).listeResultats());
			setStatus("done");
		} catch (error) {
			console.error("Erreur lors de la recherche :", error);
			new Notice("Une erreur est survenue durant la requête. Vérifiez vos identifiants et réessayez.");
			setStatus("error");
		}
	}

	useEffect(() => {
		fetchResults();
	}, []);

	/** Applique une modification de la recherche puis relance la requête. */
	function updateAndFetch(update: () => void) {
		update();
		fetchResults();
	}

	async function openDocument(selected: legalDocument) {
		try {
			// La base d'abord : un document déjà connu (cité dans le coffre, ou consulté avant) n'est pas redemandé à l'API.
			const stored = storedLegalDocument(plugin, selected.id);
			if (stored) {
				await plugin.openDocument(await plugin.addToHistory(stored));
				return;
			}
			const full = await getDocumentInfo(selected, searchHandler.getSearchedString(), plugin.agent);
			if (!full) throw new Error("Document vide");
			// Le texte consulté rejoint la base : le lecteur et les fiches pourront le relire sans requête.
			if (full.texteIntegralHTML || full.texteIntegral) plugin.references.saveDocument(documentRow(full));
			await plugin.openDocument(await plugin.addToHistory(full));
		} catch (error) {
			console.error("Erreur lors de l'ouverture du document :", error);
			new Notice(`Impossible de récupérer ce document (${error instanceof Error ? error.message : "erreur inconnue"}).`);
		}
	}

	return (
		<>
			<h2>Résultats</h2>
			<ResultsNav
				totalResults={totalResults}
				totalPageNumber={totalPages}
				currentPage={searchHandler.getCurrentPageNumber()}
				resultsPerPage={pageSize}
				sort={searchHandler.getFacette()}
				critereTri={searchHandler.criteresTri}
				onPageChange={(page) => updateAndFetch(() => searchHandler.updatePageNumber(page))}
				onPageSizeChange={(size) =>
					updateAndFetch(() => {
						searchHandler.updatePageSize(size);
						searchHandler.updatePageNumber(1);
					})
				}
				onSortChange={(sort) =>
					updateAndFetch(() => {
						searchHandler.updateFacette(sort);
						searchHandler.updatePageNumber(1);
					})
				}
			/>
			{status === "loading" && <p className="legifrance-empty">Recherche en cours…</p>}
			{status === "error" && <p className="legifrance-empty">La recherche a échoué.</p>}
			{status === "done" && results.length === 0 && (
				<p className="legifrance-empty">Aucun résultat.</p>
			)}
			{status === "done" &&
				results.map((result) => (
					<ResultCard key={result.id} result={result} onOpen={openDocument} />
				))}
		</>
	);
};
