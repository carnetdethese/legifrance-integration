import { noteChampsPersonnalises } from "abstracts/document";
import { newNote } from "creation/newNote";
import { Rocket } from "lucide-react";
import LegifrancePlugin from "main";
import { ChangeEvent, MouseEvent, useEffect, useState } from "react";
import { usePlugin } from "views/hooks";
import { documentDataStorage } from "views/viewsData";

export const NoteTaking = () => {
	const plugin = usePlugin() as LegifrancePlugin;
	const [documentsListe, setDocumentsListe] = useState<documentDataStorage[]>(
		plugin.historiqueDocuments
	);
	const [chosenDoc, setChosenDoc] = useState<documentDataStorage>(
		documentsListe[0]
	);

	useEffect(() => {
		setDocumentsListe([...plugin.historiqueDocuments]);
	}, [plugin.historiqueDocuments]);

	const removeHtmlTags = /(<([^>]+)>)/gi;

	function handleChangeDoc(e: ChangeEvent<HTMLSelectElement>) {
		const doc = documentsListe.find((elt) => elt.data.id == e.target.value);
		if (doc) {
			setChosenDoc(doc);
		}
	}

	function handleFieldClick(
		e: MouseEvent<HTMLButtonElement, globalThis.MouseEvent>
	) {
		// Ajoute ou supprime un champ pour la note finale en ajoutant un item dans la variable dédié de <legalDocument>.
		const newDoc = new documentDataStorage(
			chosenDoc.id,
			chosenDoc.data,
			chosenDoc.template
		);

		const target = e.target as HTMLButtonElement;

		if (target.value == "-") {
			if (newDoc.data.notes) {
				if (newDoc.data.notes.length == 0) return;
				newDoc.data.notes.pop();
			}
		} else if (target.value == "+") {
			const newChamp = {
				titreChamp: "",
				valeurChamp: "",
			} as noteChampsPersonnalises;

			newDoc.data.notes = newDoc.data.notes || [];

			newDoc.data.notes?.push(newChamp);
		}

		setChosenDoc(newDoc);
		plugin.saveSettings();
	}

	function HandleContributionChange(e: ChangeEvent<HTMLTextAreaElement>) {
		const newContributionNote = e.target.value;
		const newDoc = new documentDataStorage(
			chosenDoc.id,
			chosenDoc.data,
			chosenDoc.template
		);
		newDoc.data.contributionNote = newContributionNote;

		setChosenDoc(newDoc);
		plugin.saveSettings();
	}

	function handleNoteFieldChange(
		e: ChangeEvent<HTMLTextAreaElement> | ChangeEvent<HTMLInputElement>
	) {
		const index = e.target.dataset.index;
		const champ = e.target.dataset.field;

		const newDoc = new documentDataStorage(
			chosenDoc.id,
			chosenDoc.data,
			chosenDoc.template
		);

		if (newDoc.data.notes && index) {
			newDoc.data.notes[parseInt(index)][
				champ as keyof noteChampsPersonnalises
			] = e.target.value;
		}
		setChosenDoc(newDoc);
		plugin.saveSettings();
	}

	function handleClickCreateNoteButton(
		e: MouseEvent<HTMLButtonElement, globalThis.MouseEvent>
	) {
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

	function handleTitreNoteChange(e: ChangeEvent<HTMLInputElement>) {
		const target = e.target as HTMLInputElement;
		const newDoc = new documentDataStorage(
			chosenDoc.id,
			chosenDoc.data,
			chosenDoc.template
		);

		newDoc.data.titreNote = target.value;
		setChosenDoc(newDoc);
		plugin.saveSettings();
	}

	return (
		<>
			<div className="view-text">
				<h1>Création d'une note de document</h1>
				<div>
					<label htmlFor="select-document">Document : </label>
					<select
						name="select-document"
						onChange={(e) => handleChangeDoc(e)}
					>
						{documentsListe && documentsListe.length > 0
							? documentsListe.map((elt, index) => {
									return (
										<option key={index} value={elt.data.id}>
											{elt.data.titre
												.replace(removeHtmlTags, "")
												.substring(0, 70)}
											{elt.data.titre.length > 70
												? "..."
												: ""}
										</option>
									);
							})
							: ""}
					</select>
				</div>

				<div className="note-taking-box">
					<h4>{chosenDoc.data.titre}</h4>

					<div className="setting-item">
						<div className="setting-item-info">
							<div className="setting-item-name">
								Titre de la note
							</div>
						</div>
						<div className="setting-item-control">
							<input
								value={chosenDoc.data.titreNote}
								type="text"
								name="titre-note"
								id="titre-note"
								onChange={(e) => handleTitreNoteChange(e)}
							/>
						</div>
					</div>

					<div className="setting-item">
						<div className="setting-item-info">
							<div className="setting-item-name">
								<label htmlFor="contribution">
									Contribution
								</label>
							</div>
						</div>
						<div className="setting-item-control">
							<textarea
								value={
									chosenDoc.data.contributionNote
										? chosenDoc.data.contributionNote
										: ""
								}
								rows={5}
								cols={50}
								id="contribution"
								name="contribution"
								onChange={(e) => HandleContributionChange(e)}
							/>
						</div>
					</div>
					{chosenDoc.data.notes && chosenDoc.data.notes.length > 0
						? chosenDoc.data.notes.map((elt, index) => {
								return (
									<div key={index} className="setting-item">
										<div className="setting-item-info">
											<div className="setting-item-name">
												<input
													data-index={index}
													data-field="titreChamp"
													type="text"
													placeholder="Nom du champ"
													value={
														elt.titreChamp
															? elt.titreChamp
															: ""
													}
													onChange={(e) =>
														handleNoteFieldChange(e)
													}
												/>
											</div>
										</div>
										<div className="setting-item-control">
											<textarea
												data-field="valeurChamp"
												data-index={index}
												placeholder="Valeur du champ"
												value={
													elt.valeurChamp
														? elt.valeurChamp
														: ""
												}
												onChange={(e) =>
													handleNoteFieldChange(e)
												}
											/>
										</div>
									</div>
								);
						})
						: ""}

					<div className="setting-item">
						<div className="setting-item-info">
							<div className="setting-item-name">
								Ajouter ou supprimer un champ
							</div>
						</div>
						<div className="setting-item-control">
							<button
								value="+"
								onClick={(e) => handleFieldClick(e)}
							>
								+
							</button>
							<button
								value="-"
								onClick={(e) => handleFieldClick(e)}
							>
								-
							</button>
						</div>
					</div>
				</div>
				<div className="setting-item">
					<div className="setting-item-info">
						<div className="setting-item-name">
							Créer une nouvelle note
						</div>
					</div>
					<div className="setting-item-control">
						<button
							onClick={(e) => handleClickCreateNoteButton(e)}
							className="clickable-icon"
						>
							<Rocket />
						</button>
					</div>
				</div>
			</div>
		</>
	);
};
