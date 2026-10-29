import parse from "html-react-parser";
import { LegalDocument } from "abstracts/document";
import { sanitizeHTMLToDom } from "obsidian";
import { InfoCard } from "./InfoCard";

interface ReaderViewProps {
	data: LegalDocument;
}

/**
 * HTML d'un document sans script, gestionnaire d'événement ni lien `javascript:` : le texte vient de sites tiers
 * (Revue générale du droit, ArianeWeb) et s'affiche dans l'application, qui n'est pas un navigateur cloisonné.
 */
const sanitized = (html: string) => {
	const holder = document.createElement("div");
	holder.appendChild(sanitizeHTMLToDom(html));
	return holder.innerHTML;
};

/** Fiche d'information puis texte intégral d'un document. */
export const ReaderView = ({ data }: ReaderViewProps) => (
	<div className="legifrance-reader">
		<InfoCard data={data} />

		<h1>Texte intégral</h1>
		{data.texteIntegralHTML ? parse(sanitized(data.texteIntegralHTML)) : <p className="legifrance-empty">Aucun texte disponible.</p>}
		{data.sommaires?.map((sommaire, index) => (
			<p key={index}>{sommaire.resume}</p>
		))}
	</div>
);
