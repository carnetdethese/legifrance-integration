import { legalDocument } from "abstracts/document";
import parse from "html-react-parser";
import { InfoCard } from "./InfoCard";

interface ReaderViewProps {
	data: legalDocument;
}

export const ReaderView = ({ data }: ReaderViewProps) => {
    // TODO :
    // Il faut ajouter une logique pour s'assurer que lorsqu'il s'agit d'une loi, les parties s'affichent correctement. Pour l'instant, c'est encore brut.

	return (
		<div className="view-text">
			<InfoCard data={data} />

			<h1>Texte intégral</h1>
			{data.texteIntegralHTML
				? parse(data.texteIntegralHTML)
				: "No data."}
			{data.sommaires ? data.sommaires.map((elt) => {
                return <p>{elt.resume}</p>
            }) : ""}
		</div>
	);
};
