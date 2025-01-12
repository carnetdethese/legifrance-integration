import { legalDocument } from "abstracts/document";
import parse from "html-react-parser";
import { InfoCard } from "./InfoCard";
import { JSX } from "react/jsx-runtime";

interface ReaderViewProps {
	data: legalDocument;
}

export const ReaderView = ({ data }: ReaderViewProps) => {


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
