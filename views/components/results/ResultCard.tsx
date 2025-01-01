import { legalDocument } from "abstracts/document";
import { sectionsResultats } from "abstracts/searches";
import parse from "html-react-parser";

interface ResultCardProps {
	result: legalDocument;
	index: number;
}

export const ResultCard = ({ result, index }: ResultCardProps) => {
	console.log(index);
	return (
		<>
			<div className="resultat-document-container">
				<a className="titre-document">{parse(result.titre)}</a>
				<div className="extraitContainer">
					{result.texte ? parse(result.texte) : ""}
					{result.sections ? (
						<SectionsExtraits sections={result.sections} />
					) : (
						""
					)}
				</div>
			</div>
		</>
	);
};

interface SectionsExtraitsProps {
	sections: sectionsResultats[];
}

const SectionsExtraits = ({ sections }: SectionsExtraitsProps) => {
	return (
		<>
			{sections.map((sect) => {
				return sect.extracts.map((extract) => {
					if (extract.type == "articles") {
						return (
							<div className="extraitContainer">
								<a>Article {extract.num ? extract.num : ''}</a>
                                <div>{parse(extract.values[0])}</div>
							</div>
						);
					}
				});
			})}
		</>
	);
};
