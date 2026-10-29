import { Plus, Rocket, X } from "lucide-react";
import { useReducer, useState } from "react";
import { LegalDocument } from "abstracts/document";
import { removeTags } from "lib/tools";
import { useHistorique, usePlugin } from "views/hooks";
import { SettingRow } from "../SettingRow";

/** Longueur maximale d'un titre dans le sélecteur de document. */
const MAX_TITLE_LENGTH = 70;

const truncate = (text: string) =>
	text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH)}…` : text;

/** Éditeur de note : titre, contribution et champs libres, avant création du fichier. */
export const NoteTaking = () => {
	const plugin = usePlugin();
	const documents = useHistorique();
	const [selectedId, setSelectedId] = useState<string>();
	const [, refresh] = useReducer((n: number) => n + 1, 0);

	const doc = documents.find((d) => d.data.id === selectedId) ?? documents[0];
	if (!doc) {
		return (
			<p className="legifrance-empty">
				Aucun document dans l'historique : ouvrez-en un depuis une recherche.
			</p>
		);
	}
	const { data } = doc;

	/** Modifie le document de l'historique, l'enregistre et rafraîchit l'affichage. */
	function edit(mutate: (data: LegalDocument) => void) {
		mutate(data);
		void plugin.saveSettings();
		refresh();
	}

	return (
		<div className="legifrance-note-editor">
			<h1>Création d'une note</h1>

			<SettingRow name="Document" htmlFor="legifrance-note-doc">
				<select
					id="legifrance-note-doc"
					className="dropdown"
					value={data.id}
					onChange={(e) => setSelectedId(e.target.value)}
				>
					{documents.map((d) => (
						<option key={d.data.id} value={d.data.id}>
							{truncate(removeTags(d.data.titre))}
						</option>
					))}
				</select>
			</SettingRow>

			<h4>{removeTags(data.titre)}</h4>

			<SettingRow name="Titre de la note" htmlFor="legifrance-note-title">
				<input
					id="legifrance-note-title"
					type="text"
					placeholder={data.id}
					value={data.titreNote ?? ""}
					onChange={(e) => edit((d) => (d.titreNote = e.target.value))}
				/>
			</SettingRow>

			<SettingRow name="Contribution" htmlFor="legifrance-note-contribution">
				<textarea
					id="legifrance-note-contribution"
					rows={5}
					value={data.contributionNote ?? ""}
					onChange={(e) => edit((d) => (d.contributionNote = e.target.value))}
				/>
			</SettingRow>

			{data.notes?.map((champ, index) => (
				<SettingRow
					key={index}
					name={
						<input
							type="text"
							placeholder="Nom du champ"
							value={champ.titreChamp}
							onChange={(e) => edit(() => (champ.titreChamp = e.target.value))}
						/>
					}
				>
					<textarea
						placeholder="Valeur du champ"
						value={champ.valeurChamp}
						onChange={(e) => edit(() => (champ.valeurChamp = e.target.value))}
					/>
					<button
						className="clickable-icon"
						aria-label="Supprimer le champ"
						onClick={() => edit((d) => d.notes?.splice(index, 1))}
					>
						<X size={16} />
					</button>
				</SettingRow>
			))}

			<SettingRow name="Champs personnalisés">
				<button
					aria-label="Ajouter un champ"
					onClick={() =>
						edit((d) => (d.notes = [...(d.notes ?? []), { titreChamp: "", valeurChamp: "" }]))
					}
				>
					<Plus size={16} />
				</button>
			</SettingRow>

			<SettingRow name="Créer la note">
				<button
					className="mod-cta"
					aria-label="Créer la note"
					onClick={() => void plugin.createNoteFor(data)}
				>
					<Rocket size={16} />
				</button>
			</SettingRow>
		</div>
	);
};
