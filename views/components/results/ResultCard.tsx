import parse from "html-react-parser";
import { legalDocument } from "abstracts/document";
import { sectionsResultats } from "abstracts/searches";

interface ResultCardProps {
	result: legalDocument;
	onOpen: (result: legalDocument) => void;
}

/** Un résultat de recherche : titre cliquable, extrait et articles trouvés. */
export const ResultCard = ({ result, onOpen }: ResultCardProps) => (
	<article className="legifrance-result">
		<a
			href="#"
			className="legifrance-result-title"
			onClick={(e) => {
				e.preventDefault();
				onOpen(result);
			}}
		>
			{parse(result.titre)}
		</a>
		<div className="legifrance-result-excerpt">
			{result.texte && parse(result.texte)}
			{result.sections && <SectionsExtraits sections={result.sections} />}
		</div>
	</article>
);

/** Articles (avec extrait surligné) correspondant à la recherche dans un texte. */
const SectionsExtraits = ({ sections }: { sections: sectionsResultats[] }) => (
	<>
		{sections.flatMap((section) =>
			section.extracts
				.filter((extract) => extract.type == "articles")
				.map((extract) => (
					<div key={extract.id} className="legifrance-result-article">
						<strong>Article {extract.num ?? ""}</strong>
						<div>{parse(extract.values[0])}</div>
					</div>
				))
		)}
	</>
);
