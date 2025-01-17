import { legalDocument } from "abstracts/document";
import { sectionsResultats } from "abstracts/searches";
import parse from "html-react-parser";

interface ResultCardProps {
	result: legalDocument;
	handleClickDocument: (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
}


export const ResultCard = ({
	result,
	handleClickDocument,
}: ResultCardProps) => {
	return (
		<>
			<div className="resultat-document-container">
				<a
					data-id={result.id}
					className="titre-document"
					onClick={(e) => handleClickDocument(e)}
				>
					{parse(result.titre)}
				</a>
				<div className="extraitContainer">
					{result.texte ? parse(result.texte) : ""}
					{result.sections ? (
						<SectionsExtraits sections={result.sections} handleClickDocument={handleClickDocument} />
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
    handleClickDocument: (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
}

const SectionsExtraits = ({ sections, handleClickDocument }: SectionsExtraitsProps) => {
	return (
		<>
			{sections.map((sect) => {
				return sect.extracts.map((extract) => {
					if (extract.type == "articles") {
						return (
							<div className="extraitContainer">
								<a
									data-id={extract.id}
								>
									Article {extract.num ? extract.num : ""}
								</a>

								<div>{parse(extract.values[0])}</div>
							</div>
						);
					}
				});
			})}
		</>
	);
};
