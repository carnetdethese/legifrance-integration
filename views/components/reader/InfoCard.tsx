import { legalDocument } from "abstracts/document";
import { newNote } from "creation/newNote";
import { FilePlus, Sparkles } from "lucide-react";
import LegifrancePlugin from "main";
import { Notice } from "obsidian";
import { usePlugin } from "views/hooks";

interface InfoCardProps {
	data: legalDocument;
}

export const InfoCard = ({ data }: InfoCardProps) => {
	const plugin = usePlugin() as LegifrancePlugin;
	let lienPdf;

	if (data.origin == "CIRC") {
		lienPdf = `https://www.legifrance.gouv.fr/download/pdf/circ?id=${data.id}`;
	}

	const removeHtmlTags = /(<([^>]+)>)/gi;
	const titre = data.titre.replace(removeHtmlTags, "");

	function handleNoteTakingViewClick(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {

		plugin.activateNoteTakingView(e.metaKey)
	}

	function handleQuickNoteClick(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
		const chosenDoc = plugin.historiqueDocuments.find(elt => elt.data.id == data.id)

		if (!chosenDoc) {
			new Notice('Erreur dans la création rapide de la note.');
			return
		}

		chosenDoc.template = plugin.settings.templateAll;

		const nouvelleNote = new newNote(
			plugin.app,
			chosenDoc.template,
			plugin.settings.fileTitle,
			chosenDoc.data,
			plugin.settings.dossierBase
		);

		nouvelleNote.createNote();
	}




	return (
		<>
			<div className="info-box">
				<div className="info-box__top">
					<h3>Informations</h3>

					{/* Nouveau bouton pour créer une fiche rapidement sans passer par l'éditeur. */}

					<div style={{
						display: 'flex',
						flexDirection: 'row'
					}}>
						<button data-doc={data.id} onClick={(e) => handleQuickNoteClick(e)} className="clickable-icon" title="Quick note">
							<Sparkles />
						</button>
						<button data-doc={data.id} onClick={(e) => handleNoteTakingViewClick(e)} className="clickable-icon" title="Editer une note">
							<FilePlus />
						</button>
					</div>
				</div>
				<div>
					{data.titre ? <p>Titre : {titre}</p> : ""}
					{data.juridiction ? (
						<p>Juridiction : {data.juridiction}</p>
					) : (
						""
					)}
					{data.auteur ? <p>Auteur : {data.auteur}</p> : ""}
					{data.formation ? <p>Formation : {data.formation}</p> : ""}
					{data.date ? <p>Date : {data.date}</p> : ""}
					{data.numero ? <p>Numéro : {data.numero}</p> : ""}
					{data.abstract ? <p>Solution : {data.abstract}</p> : ""}
					{data.lien ? (
						<p>
							<a href={data.lien}>Légifrance - {data.id}</a>
						</p>
					) : (
						""
					)}
					{data.urlCC ? (
						<p>
							<a href={data.urlCC}>
								Conseil constitutionnel - {data.numero}
							</a>
						</p>
					) : (
						""
					)}
					{lienPdf != null ? (
						<p>
							<a href={lienPdf}>Télécharger le document</a>
						</p>
					) : (
						""
					)}
				</div>
			</div>
		</>
	);
};
