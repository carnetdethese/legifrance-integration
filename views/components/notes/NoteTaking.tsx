import LegifrancePlugin from "main";
import { useEffect, useState } from "react";
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

	function handleChangeDoc(e) {
		const doc = documentsListe.find((elt) => elt.data.id == e.target.value);
		if (doc) {
			setChosenDoc(doc);
		}
	}

	function HandleContributionChange(e) {
		const newContributionNote = e.target.value;
		const newDoc = new documentDataStorage(chosenDoc.id, chosenDoc.data, chosenDoc.template);
		newDoc.data.contributionNote = newContributionNote;
		setChosenDoc(newDoc);
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
										<option value={elt.data.id}>
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
					<h2>{chosenDoc.data.titre}</h2>
					<div>
						<label htmlFor="contribution">Contribution</label>
						<textarea value={chosenDoc.data.contributionNote} rows={5} cols={50} id="contribution" name="contribution" onChange={(e) => HandleContributionChange(e)}/>
					</div>
					<div>
						<label>Faits</label>
						<textarea rows={5} cols={50} />
					</div>
					<div>
						<label>Procédure</label>
						<textarea rows={5} cols={50} />
					</div>
				</div>
			</div>
		</>
	);
};
