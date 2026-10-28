/**
 * Vue Base de données, onglet « Cycle de la donnée » : les cinq étapes (notes analysées → articles retrouvés →
 * décisions complétées → généalogie → fiches reliées), leur avancement tiré de `cycleProgress`, un bouton par tâche
 * (`plugin.tasks.run`) et la légende des pastilles d'état d'une source.
 */
import { useMemo } from "react";
import { COMPLETE_FICHES_TASK } from "references/ficheSync";
import { ARTICLES_TASK, ENRICH_TASK, GENEALOGY_TASK, INDEX_TASK, Task } from "references/indexer";
import { CycleTask, cycleProgress } from "references/lifecycle";
import { canResolve } from "references/resolver";
import { SourceBadge } from "views/components/jurisprudence/Shared";
import { useDatabaseVersion, usePlugin } from "views/hooks";

/** Tâche qui fait avancer chaque étape, et libellé du bouton. */
const TASKS: Record<CycleTask, { task: Task<unknown>; button: string }> = {
	index: { task: INDEX_TASK as Task<unknown>, button: "Analyser les notes" },
	articles: { task: ARTICLES_TASK as Task<unknown>, button: "Retrouver" },
	enrich: { task: ENRICH_TASK as Task<unknown>, button: "Compléter" },
	genealogy: { task: GENEALOGY_TASK as Task<unknown>, button: "Analyser" },
	fiches: { task: COMPLETE_FICHES_TASK as Task<unknown>, button: "Compléter les fiches" },
};

/**
 * Le cycle de la donnée, étape par étape : note → références → textes → décisions → généalogie → fiches.
 * Chaque étape dit où elle en est et peut être relancée ; la légende explique les pastilles
 * (fichée / citée) qui reviennent dans toutes les listes.
 */
export const CycleOverview = () => {
	const plugin = usePlugin();
	const version = useDatabaseVersion();
	const steps = useMemo(
		() => cycleProgress(plugin.references, plugin.app.vault.getMarkdownFiles().map((file) => ({ path: file.path, mtime: file.stat.mtime })), canResolve),
		[plugin, version]
	);

	return (
		<div className="legifrance-cycle">
			<p className="setting-item-description">
				Vos notes citent des décisions, des textes et des articles. Le plugin les repère, les retrouve sur Légifrance, lit les décisions, puis les relie à vos fiches.
				Chaque étape s'appuie sur la précédente ; lancez-les dans l'ordre.
			</p>
			{steps.map((step) => {
				const { task, button } = TASKS[step.task];
				const done = step.total > 0 && step.done >= step.total;
				return (
					<section key={step.id} className="legifrance-cycle-step">
						<div className="legifrance-cycle-head">
							<h5>{step.title}</h5>
							<button disabled={plugin.tasks.running} onClick={() => void plugin.tasks.run(task)}>{done ? `${button} à nouveau` : button}</button>
						</div>
						<p className="setting-item-description">{step.what}</p>
						<progress max={Math.max(step.total, 1)} value={Math.min(step.done, Math.max(step.total, 1))} />
						<div className="setting-item-description">{step.detail}</div>
					</section>
				);
			})}
			<section className="legifrance-cycle-legend">
				<h5>Pastilles</h5>
				<div><SourceBadge fiche notes={1} /> la décision a une fiche et vos notes la citent.</div>
				<div><SourceBadge fiche={false} notes={1} /> vos notes la citent, mais elle n'a pas de fiche : « À faire » permet d'en créer une.</div>
				<div><SourceBadge fiche notes={0} /> une fiche existe, mais aucune note ne cite la décision.</div>
				<p className="setting-item-description">« Texte intégral » (icône de lecture) indique en plus que la décision a été lue sur Légifrance et se consulte sans requête.</p>
			</section>
		</div>
	);
};
