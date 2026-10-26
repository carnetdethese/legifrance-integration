import { ExternalLink, Search } from "lucide-react";
import { Notice, setTooltip } from "obsidian";
import { useState } from "react";
import { ArticleModal } from "views/ArticleModal";
import { canResolve } from "references/resolver";
import { LegalRef, RefKind } from "references/parser";
import { useNoteReferences, usePlugin } from "views/hooks";

/** Rubriques d'affichage, dans l'ordre. */
const GROUPS: { kind: RefKind; title: string }[] = [
	{ kind: "decision", title: "Décisions" },
	{ kind: "texte", title: "Textes" },
	{ kind: "article", title: "Articles de code" },
	{ kind: "identifiant", title: "Identifiants Légifrance" },
];

/** Longueur de l'aperçu d'un article dans la liste ; le texte entier s'affiche au survol et au clic. */
const EXCERPT_LENGTH = 50;
/** Longueur maximale du texte de l'infobulle (les articles peuvent être très longs). */
const TOOLTIP_LENGTH = 800;

/** Références juridiques de la note active, chacune avec son lien Légifrance. */
export const ReferencesPanel = () => {
	const plugin = usePlugin();
	const { file, refs } = useNoteReferences();
	const [busy, setBusy] = useState(false);

	/** Références que l'API peut encore retrouver (sans lien mémorisé, ni recherche en cours). */
	const missing = refs.filter(
		(ref) => canResolve(ref) && !plugin.references.linkFor(ref) && !plugin.pendingReferences.has(ref.key)
	);

	async function resolve(targets: LegalRef[]) {
		if (!plugin.hasCredentials) {
			new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
			return;
		}
		setBusy(true);
		await plugin.resolveReferences(targets, true);
		setBusy(false);
	}

	if (!file) {
		return <p className="legifrance-empty">Ouvrez une note pour en lister les références juridiques.</p>;
	}

	return (
		<div className="legifrance-references">
			<h4>{file.basename}</h4>
			{refs.length === 0 && (
				<p className="legifrance-empty">Aucune référence juridique détectée dans cette note.</p>
			)}

			{missing.length > 0 && !plugin.settings.autoResolveRefs && (
				<button disabled={busy} onClick={() => resolve(missing)}>
					{busy ? "Recherche…" : `Retrouver ${missing.length} lien${missing.length > 1 ? "s" : ""} via l'API`}
				</button>
			)}

			{GROUPS.map(({ kind, title }) => {
				const group = refs.filter((ref) => ref.kind === kind);
				return (
					group.length > 0 && (
						<section key={kind}>
							<h5>{title}</h5>
							{group.map((ref) => (
								<ReferenceItem key={ref.key} reference={ref} disabled={busy} onResolve={() => resolve([ref])} />
							))}
						</section>
					)
				);
			})}
		</div>
	);
};

interface ReferenceItemProps {
	reference: LegalRef;
	disabled: boolean;
	onResolve: () => void;
}

const ReferenceItem = ({ reference, disabled, onResolve }: ReferenceItemProps) => {
	const plugin = usePlugin();
	const link = plugin.references.linkFor(reference);
	const pending = plugin.pendingReferences.has(reference.key);
	const missed = plugin.references.isRecentMiss(reference);

	let status = "Lien de recherche Légifrance.";
	if (link) status = link.titre;
	else if (pending) status = "Recherche sur Légifrance…";
	else if (missed) status = "Introuvable via l'API : lien de recherche Légifrance.";

	const texte = link?.texte;

	return (
		<div className="setting-item">
			<div className="setting-item-info">
				<div className="setting-item-name">{reference.label}</div>
				<div className="setting-item-description">{status}</div>
				{texte && link && (
					<div
						className="legifrance-excerpt"
						role="button"
						tabIndex={0}
						// Survol : début du texte dans une infobulle ; clic : texte entier dans une fenêtre.
						ref={(el) => el && setTooltip(el, texte.slice(0, TOOLTIP_LENGTH) + (texte.length > TOOLTIP_LENGTH ? "…" : ""), { delay: 300 })}
						onClick={() => new ArticleModal(plugin.app, reference, link).open()}
						onKeyDown={(e) => e.key === "Enter" && new ArticleModal(plugin.app, reference, link).open()}
					>
						{texte.length > EXCERPT_LENGTH ? `${texte.slice(0, EXCERPT_LENGTH).trimEnd()}…` : texte}
					</div>
				)}
			</div>
			<div className="setting-item-control">
				{!link && !pending && canResolve(reference) && (
					<button
						className="clickable-icon"
						aria-label="Retrouver le document via l'API"
						disabled={disabled}
						onClick={onResolve}
					>
						<Search size={16} />
					</button>
				)}
				<a
					className="clickable-icon"
					aria-label={link ? "Ouvrir sur Légifrance" : "Rechercher sur Légifrance"}
					href={plugin.getReferenceUrl(reference)}
				>
					<ExternalLink size={16} />
				</a>
			</div>
		</div>
	);
};
