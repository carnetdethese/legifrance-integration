import { ExternalLink, Search } from "lucide-react";
import { Notice, setTooltip } from "obsidian";
import { useState } from "react";
import { ArticleModal } from "views/ArticleModal";
import { canResolve } from "references/resolver";
import { LegalRef, RefKind } from "references/parser";
import { useNoteReferences, usePlugin } from "views/hooks";
import LegifrancePlugin from "main";

/** Rubriques d'affichage, dans l'ordre. */
const GROUPS: { kind: RefKind; title: string }[] = [
	{ kind: "decision", title: "Décisions" },
	{ kind: "texte", title: "Textes" },
	{ kind: "article", title: "Articles" },
	{ kind: "eu", title: "Droit de l'Union" },
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

			{plugin.settings.debugRefs && (
				<div className="legifrance-debug-bar">
					<button disabled={busy} onClick={() => resolve(refs.filter((ref) => canResolve(ref)))}>
						Relancer toutes les recherches
					</button>
					<button onClick={() => copyDiagnostic(plugin, file.path, refs)}>Copier le diagnostic</button>
				</div>
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

/** Diagnostic de la note (références, données, journal de recherche), copié dans le presse-papiers. */
async function copyDiagnostic(plugin: LegifrancePlugin, path: string, refs: LegalRef[]) {
	const lines = [`Note : ${path}`, `Identifiants PISTE : ${plugin.hasCredentials ? "renseignés" : "ABSENTS"}`, ""];
	for (const ref of refs) {
		const link = plugin.references.linkFor(ref);
		lines.push(`## ${ref.label}`, `type : ${ref.kind} | données : ${JSON.stringify(ref.data)}`);
		lines.push(`lien : ${link?.url ?? "aucun"} | repli : ${ref.fallbackUrl ?? plugin.getReferenceUrl(ref)}`);
		lines.push(...(plugin.referenceTraces.get(ref.key) ?? ["(aucune recherche pendant cette session)"]), "");
	}
	await navigator.clipboard.writeText(lines.join("\n"));
	new Notice("Diagnostic copié dans le presse-papiers.");
}

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

	let status = reference.url || reference.fallbackUrl ? "Lien vers la page du texte." : "Lien de recherche Légifrance.";
	if (link) status = link.titre;
	else if (pending) status = "Recherche sur Légifrance…";
	else if (missed) status = "Introuvable via l'API : lien de recherche.";

	const texte = link?.texte;
	const trace = plugin.settings.debugRefs ? plugin.referenceTraces.get(reference.key) : undefined;

	return (
		<div className="setting-item">
			<div className="setting-item-info">
				<div className="setting-item-name">{reference.label}</div>
				<div className="setting-item-description">{status}</div>
				{plugin.settings.debugRefs && (
					<details className="legifrance-trace">
						<summary>Diagnostic</summary>
						<pre>{trace ? trace.join("\n") : "Aucune recherche pendant cette session (résultat en cache, ou recherche non lancée)."}</pre>
					</details>
				)}
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
