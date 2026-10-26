import { ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { Notice } from "obsidian";
import { LegalRef, RefKind } from "references/parser";
import { usePlugin, useNoteReferences } from "views/hooks";

/** Rubriques d'affichage, dans l'ordre. */
const GROUPS: { kind: RefKind[]; title: string }[] = [
	{ kind: ["decision"], title: "Décisions" },
	{ kind: ["texte"], title: "Textes" },
	{ kind: ["article"], title: "Articles de code" },
	{ kind: ["identifiant"], title: "Identifiants Légifrance" },
];

/** Références juridiques de la note active, chacune avec son lien Légifrance. */
export const ReferencesPanel = () => {
	const plugin = usePlugin();
	const { file, refs } = useNoteReferences();
	const [busy, setBusy] = useState(false);

	/** Références que l'API peut encore retrouver (fond connu, pas de lien mémorisé). */
	const resolvable = refs.filter((ref) => ref.fond && !plugin.references.linkFor(ref));

	async function resolve(targets: LegalRef[]) {
		setBusy(true);
		let found = 0;
		for (const ref of targets) {
			if (await plugin.resolveReference(ref)) found++;
		}
		setBusy(false);
		new Notice(`${found} référence${found > 1 ? "s" : ""} retrouvée${found > 1 ? "s" : ""} sur ${targets.length}.`);
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

			{resolvable.length > 0 && (
				<button disabled={busy} onClick={() => resolve(resolvable)}>
					{busy ? "Recherche…" : `Retrouver ${resolvable.length} lien${resolvable.length > 1 ? "s" : ""} via l'API`}
				</button>
			)}

			{GROUPS.map(({ kind, title }) => {
				const group = refs.filter((ref) => kind.includes(ref.kind));
				return (
					group.length > 0 && (
						<section key={title}>
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

	return (
		<div className="setting-item">
			<div className="setting-item-info">
				<div className="setting-item-name">{reference.label}</div>
				<div className="setting-item-description">
					{link ? link.titre : "Lien non vérifié : ouvre une recherche Légifrance."}
				</div>
			</div>
			<div className="setting-item-control">
				{reference.fond && !link && (
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
