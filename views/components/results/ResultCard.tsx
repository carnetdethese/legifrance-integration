import parse from "html-react-parser";
import { legalDocument } from "abstracts/document";
import { extractsResultats } from "abstracts/searches";
import { legifranceUrl } from "api/urls";
import { removeTags } from "lib/tools";

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
			{result.sections && <SectionsExtraits result={result} onOpen={onOpen} />}
		</div>
	</article>
);

/** Document que désigne un extrait (article d'un code ou d'un texte) : on l'ouvre comme un résultat à part. */
const documentOfExtract = (result: legalDocument, extract: extractsResultats): legalDocument => ({
	...result,
	id: extract.id,
	titre: `${removeTags(result.titre)} — article ${extract.num ?? ""}`.trim(),
	lien: legifranceUrl(extract.id),
	sections: undefined,
	texte: "",
});

/** Articles (avec extrait surligné) correspondant à la recherche dans un texte ; un clic ouvre l'article. */
const SectionsExtraits = ({ result, onOpen }: { result: legalDocument; onOpen: (doc: legalDocument) => void }) => (
	<>
		{(result.sections ?? []).flatMap((section) =>
			section.extracts
				.filter((extract) => extract.id)
				.map((extract) => (
					<div key={extract.id} className="legifrance-result-article">
						<a
							href="#"
							onClick={(e) => {
								e.preventDefault();
								onOpen(documentOfExtract(result, extract));
							}}
						>
							<strong>{extract.type === "articles" ? `Article ${extract.num ?? ""}` : extract.type}</strong>
						</a>
						<div>{extract.values?.[0] && parse(extract.values[0])}</div>
					</div>
				))
		)}
	</>
);
