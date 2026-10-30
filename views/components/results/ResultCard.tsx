import { ExternalLink, ListTree } from "lucide-react";
import parse from "html-react-parser";
import { useState } from "react";
import { LegalDocument } from "abstracts/document";
import { originLabel } from "abstracts/fonds";
import { ResultExtract, ResultSection } from "abstracts/searches";
import { legifranceUrl } from "api/urls";
import { longDate, natureLabel } from "lib/display";
import { removeTags } from "lib/tools";
import { statusLabel } from "references/corpus";
import { sanitizeHtml } from "../sanitize";

/** HTML d'un résultat (termes surlignés), assaini. */
const html = (value: string) => parse(sanitizeHtml(value));

interface ResultCardProps {
	result: LegalDocument;
	onOpen: (result: LegalDocument) => void;
	/** Ouvre la table des matières d'un texte consolidé. */
	onOpenToc: (result: LegalDocument) => void;
}

/** Nombre de passages montrés avant « Afficher les autres ». */
const HITS_SHOWN = 4;

/** Document que désigne un extrait (article d'un code ou d'un texte) : on l'ouvre comme un résultat à part. */
const documentOfExtract = (result: LegalDocument, extract: ResultExtract): LegalDocument => ({
	...result,
	id: extract.id,
	titre: `${removeTags(result.titre)} — article ${extract.num ?? ""}`.trim(),
	lien: legifranceUrl(extract.id),
	sections: undefined,
	texte: "",
	status: extract.legalStatus,
});

/** Passage trouvé : un article (qui s'ouvre) ou une rubrique du texte (« Visas »…), avec son extrait surligné. */
interface Hit {
	key: string;
	extract: ResultExtract;
	section?: ResultSection;
}

const hitsOf = (result: LegalDocument): Hit[] =>
	(result.sections ?? []).flatMap((section, s) =>
		(section.extracts ?? []).map((extract, e): Hit => ({ key: `${s}-${e}-${extract.id ?? extract.searchFieldName}`, extract, section }))
	);

/** Un résultat de recherche : nature, date et état, titre, extrait, passages trouvés dans le texte, et accès rapides. */
export const ResultCard = ({ result, onOpen, onOpenToc }: ResultCardProps) => {
	const [all, setAll] = useState(false);
	const hits = hitsOf(result);
	const shown = all ? hits : hits.slice(0, HITS_SHOWN);
	const isCode = result.id.startsWith("LEGITEXT") && result.nature?.toUpperCase() === "CODE";
	const consolidated = result.id.startsWith("LEGITEXT");
	const inForce = !result.status || ["VIGUEUR", "VIGUEUR_DIFF"].includes(result.status);

	return (
		<article className="legifrance-result">
			<div className="legifrance-result-chips">
				<span className="legifrance-doc-kind">{originLabel(result.origin)}</span>
				{result.nature && <span className="legifrance-chip">{natureLabel(result.nature)}</span>}
				{result.date && <span className="legifrance-chip">{longDate(result.date)}</span>}
				{result.status && !inForce && <span className="legifrance-chip is-warning">{statusLabel(result.status)}</span>}
			</div>
			<a
				href="#"
				className="legifrance-result-title"
				onClick={(event) => {
					event.preventDefault();
					if (isCode) onOpenToc(result);
					else onOpen(result);
				}}
			>
				{html(result.titre ?? "")}
			</a>
			{result.texte && <div className="legifrance-result-excerpt">{html(result.texte)}</div>}
			{shown.length > 0 && (
				<ul className="legifrance-result-hits">
					{shown.map(({ key, extract, section }) => (
						<li key={key}>
							{extract.id ? (
								<a
									href="#"
									onClick={(event) => {
										event.preventDefault();
										onOpen(documentOfExtract(result, extract));
									}}
								>
									{extract.type === "articles" ? `Art. ${extract.num ?? ""}` : extract.type ?? "Passage"}
								</a>
							) : (
								<span className="legifrance-result-field">{extract.searchFieldName ?? "Passage"}</span>
							)}
							{extract.legalStatus && !["VIGUEUR", "VIGUEUR_DIFF", "INITIALE"].includes(extract.legalStatus) && (
								<span className="legifrance-chip is-warning">{statusLabel(extract.legalStatus)}</span>
							)}
							{section?.title && <span className="legifrance-row-meta"> {html(section.title)}</span>}
							{extract.values?.[0] && <div className="legifrance-result-snippet">{html(extract.values[0])}</div>}
						</li>
					))}
				</ul>
			)}
			{hits.length > HITS_SHOWN && (
				<a className="legifrance-row-meta" onClick={() => setAll(!all)}>
					{all ? "Réduire" : `Afficher les ${hits.length - HITS_SHOWN} autres passages`}
				</a>
			)}
			<div className="legifrance-result-actions">
				<button onClick={() => (isCode ? onOpenToc(result) : onOpen(result))}>{isCode ? "Table des matières" : "Ouvrir"}</button>
				{consolidated && !isCode && (
					<button onClick={() => onOpenToc(result)}>
						<ListTree size={14} /> Plan
					</button>
				)}
				{result.lien && (
					<a className="legifrance-doc-link" data-site="" href={result.lien}>
						<ExternalLink size={14} /> Légifrance
					</a>
				)}
			</div>
		</article>
	);
};
