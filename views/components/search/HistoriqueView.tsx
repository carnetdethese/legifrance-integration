import { ExternalLink, X } from "lucide-react";
import { removeTags } from "lib/tools";
import { useHistorique, usePlugin } from "views/hooks";

/** Liste des documents déjà consultés : réouverture ou retrait de l'historique. */
export const HistoriqueView = () => {
	const plugin = usePlugin();
	const documents = useHistorique();

	return (
		<section className="legifrance-historique">
			<h5>Historique</h5>
			{documents.length === 0 && (
				<p className="legifrance-empty">
					Rien à afficher. Et si vous faisiez une recherche ?
				</p>
			)}
			{documents.map((doc) => (
				<div key={doc.data.id} className="setting-item">
					<div className="setting-item-info">
						<div className="setting-item-name">{doc.data.id}</div>
						<div className="setting-item-description">{removeTags(doc.data.titre)}</div>
					</div>
					<div className="setting-item-control">
						<button
							className="clickable-icon"
							aria-label="Ouvrir"
							onClick={() => void plugin.openDocument(doc)}
						>
							<ExternalLink size={16} />
						</button>
						<button
							className="clickable-icon"
							aria-label="Retirer de l'historique"
							onClick={() => void plugin.removeFromHistory(doc.data.id)}
						>
							<X size={16} />
						</button>
					</div>
				</div>
			))}
		</section>
	);
};
