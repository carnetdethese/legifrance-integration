import { Copy, ExternalLink, FilePlus, Sparkles } from "lucide-react";
import { Notice } from "obsidian";
import { LegalDocument } from "abstracts/document";
import { originLabel } from "abstracts/fonds";
import { templateContext } from "creation/newNote";
import { longDate, natureLabel } from "lib/display";
import { removeTags } from "lib/tools";
import { statusLabel } from "references/corpus";
import { usePlugin } from "views/hooks";

interface InfoCardProps {
	data: LegalDocument;
}

/** Ce que le document est : décision, article, loi, code… (d'après son identifiant, sa nature et son origine). */
export function kindOf(data: LegalDocument) {
	if (/^(?:LEGIARTI|JORFARTI|KALIARTI)/.test(data.id)) return "Article";
	if (data.type === "jurisprudence" || /^(?:JURI|CETAT|CONSTEXT|JUFI|CNIL)/.test(data.id)) return "Décision";
	return natureLabel(data.nature) || "Document";
}

/** Copie un texte dans le presse-papiers et le dit. */
async function copy(text: string, what: string) {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(`${what} copié.`);
	} catch {
		new Notice("Copie impossible.");
	}
}

/** Citation d'une décision (« Conseil d'État, 7 avril 2017, n° 401742 »), ou le titre pour un texte. */
function citation(data: LegalDocument) {
	const parts = [data.juridiction, data.formation, longDate(data.date), data.numero && `n° ${data.numero}`].filter(Boolean);
	return parts.length >= 2 ? parts.join(", ") : removeTags(data.titre);
}

/** Fiche du document : titre, nature et état, métadonnées (selon ce que l'on sait), sommaire, et actions (note, copie, Légifrance). */
export const InfoCard = ({ data }: InfoCardProps) => {
	const plugin = usePlugin();
	const solution = templateContext(data).solution;
	const kind = kindOf(data);
	const origin = data.origin ? originLabel(data.origin) : "";
	const subtitle = [data.juridiction ?? (kind === "Décision" ? origin : ""), data.formation, longDate(data.date), data.numero && `n° ${data.numero}`].filter(Boolean).join(" · ");

	/** Métadonnées : celles que l'on connaît seulement ; une valeur copiable a son bouton. */
	const fields: [label: string, value: string | undefined, copyable?: boolean][] = [
		["Juridiction", data.juridiction],
		["Formation", data.formation],
		["Date", longDate(data.date)],
		["Numéro", data.numero],
		["Affaire", data.affaires?.join(", ")],
		["Solution", solution],
		["Nature", data.decisionType],
		["ECLI", data.ecli, true],
		["NOR", data.nor, true],
		["Publication", data.publication],
		["Auteur", data.auteur],
		["Origine", origin],
		["Identifiant", data.id, true],
	];
	const pdfLink = data.origin == "CIRC" ? `https://www.legifrance.gouv.fr/download/pdf/circ?id=${data.id}` : undefined;
	const inForce = !data.status || ["VIGUEUR", "VIGUEUR_DIFF"].includes(data.status);

	return (
		<section className="legifrance-doc">
			<div className="legifrance-doc-chips">
				<span className="legifrance-doc-kind">{kind}</span>
				{data.status && <span className={`legifrance-chip ${inForce ? "" : "is-warning"}`}>{statusLabel(data.status)}</span>}
				{solution && kind === "Décision" && <span className="legifrance-chip">{solution}</span>}
			</div>
			<h2 className="legifrance-doc-title">{removeTags(data.titre)}</h2>
			{subtitle && <p className="legifrance-doc-subtitle">{subtitle}</p>}

			<div className="legifrance-doc-actions">
				<button className="mod-cta" onClick={() => void plugin.createNoteFor(data)}>
					<Sparkles size={16} /> Créer une note
				</button>
				<button onClick={(event) => void plugin.activateNoteTakingView(event.metaKey || event.ctrlKey)}>
					<FilePlus size={16} /> Éditer une note
				</button>
				<button onClick={() => void copy(citation(data), "Citation")}>
					<Copy size={16} /> Copier la citation
				</button>
				{data.lien && (
					<a className="legifrance-doc-link" data-site="" href={data.lien}>
						<ExternalLink size={14} /> Sur Légifrance
					</a>
				)}
				{data.urlCC && (
					<a className="legifrance-doc-link" data-site="" href={data.urlCC}>
						<ExternalLink size={14} /> Conseil constitutionnel
					</a>
				)}
				{pdfLink && (
					<a className="legifrance-doc-link" data-site="" href={pdfLink}>
						<ExternalLink size={14} /> PDF
					</a>
				)}
			</div>

			<dl className="legifrance-doc-fields">
				{fields.map(
					([label, value, copyable]) =>
						value && (
							<div key={label}>
								<dt>{label}</dt>
								<dd>
									{value}
									{copyable && (
										<button className="clickable-icon" aria-label={`Copier : ${label}`} onClick={() => void copy(value, label)}>
											<Copy size={13} />
										</button>
									)}
								</dd>
							</div>
						)
				)}
			</dl>

			{!!data.sommaires?.length && (
				<details className="legifrance-doc-summary" open>
					<summary>Sommaire</summary>
					{data.sommaires.map((sommaire, index) => (
						<p key={index}>{sommaire.resume}</p>
					))}
				</details>
			)}
			{!data.sommaires?.length && data.abstract && data.abstract !== solution && (
				<details className="legifrance-doc-summary" open>
					<summary>Résumé</summary>
					<p>{removeTags(data.abstract)}</p>
				</details>
			)}
		</section>
	);
};
