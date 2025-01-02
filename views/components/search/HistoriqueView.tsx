import { ExternalLink, X } from "lucide-react";
import LegifrancePlugin from "main";
import { documentDataStorage } from "views/viewsData";
import { usePlugin } from "views/hooks";

interface HistoriqueViewProps {
	historiqueDocuments: documentDataStorage[];
}

export const HistoriqueView = ({
	historiqueDocuments,
}: HistoriqueViewProps) => {
	const plugin = usePlugin() as LegifrancePlugin;
	const documentsListe = plugin.historiqueDocuments;

	function handleCloseClick(doc: documentDataStorage) {
		const result = plugin.historiqueDocuments.find((l) => l.id == doc.id);
		plugin.historiqueDocuments.remove(result as documentDataStorage);
		plugin.saveSettings();
		plugin.instancesOfDocumentViews -= 1;
	}

	function handleOpenClick(doc: documentDataStorage) {
		doc.status = true;
		plugin.activateTextReaderView();
	}

	return (
		<>
			<h5>Historique</h5>
			{documentsListe && documentsListe.length > 0
				? documentsListe.map((elt) => {
						return (
							<div className="setting-item">
								<div className="setting-item-info">
									<div className="setting-item-name">
										{elt.data.id}
									</div>
									<div className="setting-item-description">
										{elt.data.titre}
									</div>
								</div>
								<div className="setting-item-control">
									<div
										className="clickable-icon extra-setting-button"
										onClick={(e) => handleOpenClick(elt)}
									>
										<ExternalLink className="svg-icon"  key={elt.id} />
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
		</>
	);
};
