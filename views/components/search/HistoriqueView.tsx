import { ExternalLink, X } from "lucide-react";
import LegifrancePlugin from "main";
import { documentDataStorage } from "views/viewsData";
import { usePlugin } from "views/hooks";
import { useEffect, useState } from "react";

export const HistoriqueView = () => {
	const plugin = usePlugin() as LegifrancePlugin;
	const [documentsListe, setDocumentsListe] = useState<documentDataStorage[]>(
		plugin.historiqueDocuments
	);

	useEffect(() => {
		setDocumentsListe([...plugin.historiqueDocuments]);
	}, [plugin.historiqueDocuments]);

	function handleCloseClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
		const target = e.target as HTMLDivElement;
		const docId = target.dataset.id as string;

		const newHistorique = plugin.historiqueDocuments.filter(elt => elt.data.id != docId);

		setDocumentsListe(newHistorique);
		// plugin.historiqueDocuments = newHistorique;
		plugin.saveSettings();
	}

	function handleOpenClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
		const target = e.target as HTMLDivElement;
		const docId = target.dataset.id as string;

		const doc = plugin.historiqueDocuments.find((l) => l.data.id === docId);
		console.log(doc);

		if (doc) {
			plugin.docToShow = doc;
			plugin.activateTextReaderView();
		}
	}

	return (
		<div>
			<h5>Historique</h5>
			{documentsListe && documentsListe.length > 0
				? documentsListe.map((elt, index) => {
						const removeHtmlTags = /(<([^>]+)>)/gi;
						const titre = elt.data.titre.replace(
							removeHtmlTags,
							""
						);

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
										data-id={elt.data.id}
										className="clickable-icon extra-setting-button"
										onClick={(e) => handleOpenClick(e)}
									>
										<ExternalLink
											className="svg-icon"
											key={elt.id}
										/>
									</div>
									<div
										data-id={elt.data.id}
										className="clickable-icon extra-setting-button"
										onClick={(e) => handleCloseClick(e)}
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
