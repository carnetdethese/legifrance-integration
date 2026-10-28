/**
 * Commandes de la palette d'Obsidian et icône du ruban. Chaque commande ouvre une vue (`LegifrancePlugin.activate…`),
 * lance une tâche longue sur la base (`TaskRunner`, tâches définies dans `references/indexer.ts` et
 * `references/ficheSync.ts`) ou insère du texte dans la note ouverte.
 */
import { Notice } from "obsidian";
import type LegifrancePlugin from "main";
import { COMPLETE_FICHES_TASK } from "references/ficheSync";
import { ARTICLES_TASK, ENRICH_TASK, GENEALOGY_TASK, INDEX_TASK, REFRESH_TASK, RETRY_UNRESOLVED_TASK, Task } from "references/indexer";
import { noteDecisionsTable } from "references/insights";

/** Commandes qui lancent une tâche longue : identifiant, libellé, tâche. */
const TASK_COMMANDS: [string, string, Task<unknown>][] = [
	["indexer-coffre", "Indexer les références juridiques du coffre", INDEX_TASK],
	["completer-fiches", "Compléter toutes les fiches de décisions du coffre", COMPLETE_FICHES_TASK],
	["reessayer-introuvables", "Réessayer les décisions introuvables (base de données)", RETRY_UNRESOLVED_TASK],
	["analyser-genealogie", "Analyser la généalogie de la jurisprudence (base de données)", GENEALOGY_TASK],
	["actualiser-articles", "Actualiser les articles et textes cités (veille, base de données)", REFRESH_TASK],
	["retrouver-articles", "Retrouver les articles et textes cités (base de données)", ARTICLES_TASK],
	["completer-decisions", "Compléter les fiches de décisions (base de données)", ENRICH_TASK],
];

export function registerCommands(plugin: LegifrancePlugin) {
	plugin.addRibbonIcon("scale", "Légifrance", () => plugin.activateResearchTextView());

	// Vues
	plugin.addCommand({ id: "nouvelle-recherche", name: "Nouvelle recherche", callback: () => plugin.activateResearchTextView() });
	plugin.addCommand({ id: "references-juridiques", name: "Afficher les références juridiques de la note", callback: () => plugin.activateReferencesView() });
	plugin.addCommand({ id: "base-de-donnees", name: "Afficher la base de données et le cycle de la donnée", callback: () => plugin.activateDatabaseView() });
	plugin.addCommand({ id: "a-faire", name: "Afficher ce qui reste à faire (fiches, écarts, articles abrogés)", callback: () => plugin.activateDatabaseView("todo") });
	plugin.addCommand({ id: "jurisprudence", name: "Afficher l'analyse de la jurisprudence", callback: () => plugin.activateJurisprudenceView() });

	// Texte inséré dans la note
	plugin.addCommand({
		id: "table-des-decisions",
		name: "Insérer la table des décisions citées dans la note",
		editorCallback: (editor, view) => {
			const table = view.file && noteDecisionsTable(plugin, view.file);
			if (!table) {
				new Notice("Aucune décision citée dans cette note (ou la note n'est pas encore analysée).");
				return;
			}
			// À la fin de la sélection : jamais de texte remplacé.
			editor.replaceRange(`\n${table}\n`, editor.getCursor("to"));
		},
	});

	// Tâches longues sur la base
	for (const [id, name, task] of TASK_COMMANDS) {
		plugin.addCommand({ id, name, callback: () => plugin.tasks.run(task) });
	}
}
