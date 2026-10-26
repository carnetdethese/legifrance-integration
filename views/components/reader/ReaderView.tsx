import parse from "html-react-parser";
import { legalDocument } from "abstracts/document";
import { InfoCard } from "./InfoCard";

interface ReaderViewProps {
	data: legalDocument;
}

/** Fiche d'information puis texte intégral d'un document. */
export const ReaderView = ({ data }: ReaderViewProps) => (
	<div className="legifrance-reader">
		<InfoCard data={data} />

		<h1>Texte intégral</h1>
		{data.texteIntegralHTML ? parse(data.texteIntegralHTML) : <p className="legifrance-empty">Aucun texte disponible.</p>}
		{data.sommaires?.map((sommaire, index) => (
			<p key={index}>{sommaire.resume}</p>
		))}
	</div>
);
