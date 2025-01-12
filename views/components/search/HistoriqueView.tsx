import { ExternalLink, X } from "lucide-react";
import LegifrancePlugin from "main";
import { documentDataStorage } from "views/viewsData";
import { usePlugin } from "views/hooks";
import { useEffect, useRef, useState } from "react";

export const HistoriqueView = () => {
	const plugin = usePlugin() as LegifrancePlugin;
	const [documentsListe, setDocumentsListe] = useState<documentDataStorage[]>(
		plugin.historiqueDocuments
	);
	const scrollRefElement = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setDocumentsListe([...plugin.historiqueDocuments]);
	}, [plugin.historiqueDocuments]);

	function handleCloseClick(doc: documentDataStorage) {
		const resultIndex = plugin.historiqueDocuments.findIndex(
			(l) => l === doc
		);

		if (resultIndex !== -1) {
			const newHistorique = [
				...plugin.historiqueDocuments.slice(0, resultIndex),
				...plugin.historiqueDocuments.slice(resultIndex + 1),
			];

			plugin.historiqueDocuments = newHistorique; // Remove the document
			plugin.saveSettings();
			setDocumentsListe(plugin.historiqueDocuments);
		}
	}

	function handleOpenClick(doc: documentDataStorage) {
		doc.status = true;
		plugin.docToShow = doc;
		plugin.activateTextReaderView();
	}

	return (
		<div ref={scrollRefElement}>
			<h5>Historique</h5>
			{documentsListe && documentsListe.length > 0
				? documentsListe.map((elt, index) => {
						const removeHtmlTags = /(<([^>]+)>)/gi;
						const titre = elt.data.titre.replace(removeHtmlTags, "");

						return (
							<div key={index} className="setting-item">
								<div className="setting-item-info">
									<div className="setting-item-name">
										{elt.data.id}
									</div>
									<div className="setting-item-description">
										{titre}
									</div>
								</div>
								<div className="setting-item-control">
									<div
										className="clickable-icon extra-setting-button"
										onClick={(e) => handleOpenClick(elt)}
									>
										<ExternalLink
											className="svg-icon"
											key={elt.id}
										/>
									</div>
									<div
										className="clickable-icon extra-setting-button"
										onClick={(e) => handleCloseClick(elt)}
									>
										<X className="svg-icon" />
									</div>
								</div>
							</div>
						);
				  })
				: "Rien à afficher. Et si vous faisiez une recherche ?"}
		</div>
	);
};
