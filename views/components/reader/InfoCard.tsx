import { FilePlus, Sparkles } from "lucide-react";
import { legalDocument } from "abstracts/document";
import { removeTags } from "lib/tools";
import { templateContext } from "creation/newNote";
import { usePlugin } from "views/hooks";

interface InfoCardProps {
	data: legalDocument;
}

/** Métadonnées du document et actions de création de note. */
export const InfoCard = ({ data }: InfoCardProps) => {
	const plugin = usePlugin();

	const fields: [string, string | undefined][] = [
		["Titre", removeTags(data.titre)],
		["Juridiction", data.juridiction],
		["Auteur", data.auteur],
		["Formation", data.formation],
		["Date", data.date],
		["Numéro", data.numero],
		["Solution", templateContext(data).solution],
	];
	const pdfLink =
		data.origin == "CIRC"
			? `https://www.legifrance.gouv.fr/download/pdf/circ?id=${data.id}`
			: undefined;

	return (
		<div className="legifrance-info-box">
			<div className="legifrance-info-box-header">
				<h3>Informations</h3>
				<div>
					<button
						className="clickable-icon"
						aria-label="Créer une note rapidement"
						onClick={() => plugin.createNoteFor(data)}
					>
						<Sparkles size={18} />
					</button>
					<button
						className="clickable-icon"
						aria-label="Éditer une note"
						onClick={(e) => plugin.activateNoteTakingView(e.metaKey || e.ctrlKey)}
					>
						<FilePlus size={18} />
					</button>
				</div>
			</div>
			{fields.map(
				([label, value]) =>
					value && (
						<p key={label}>
							<strong>{label} :</strong> {value}
						</p>
					)
			)}
			{data.lien && (
				<p>
					<a href={data.lien}>Légifrance - {data.id}</a>
				</p>
			)}
			{data.urlCC && (
				<p>
					<a href={data.urlCC}>Conseil constitutionnel - {data.numero}</a>
				</p>
			)}
			{pdfLink && (
				<p>
					<a href={pdfLink}>Télécharger le document</a>
				</p>
			)}
		</div>
	);
};
