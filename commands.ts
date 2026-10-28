/**
 * Commandes de la palette d'Obsidian et icône du ruban. Chaque commande ouvre une vue (`LegifrancePlugin.activate…`),
 * lance une tâche longue sur la base (`TaskRunner`, tâches définies dans `references/indexer.ts` et
 * `references/ficheSync.ts`) ou insère du texte dans la note ouverte.
 */
import { Notice } from "obsidian";
import type LegifrancePlugin from "main";
import { COMPLETE_FICHES_TASK } from "references/ficheSync";
import { ARTICLES_TASK, ENRICH_TASK, GENEALOGY_TASK, INDEX_TASK, REFRESH_TASK, RETRY_UNRESOLVED_TASK, Task } from "references/indexer";
import { noteBibliography, noteDecisionsTable, notePlan, notePlanThemes } from "references/insights";
import { PlanModal } from "views/PlanModal";
import { ExportModal } from "views/ExportModal";

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

	plugin.addCommand({
		id: "plan-des-decisions",
		name: "Insérer le plan des décisions citées dans la note (thème, décisions, articles)",
		editorCallback: (editor, view) => {
			const file = view.file;
			const themes = file ? notePlanThemes(plugin, file) : [];
			if (!file || themes.length === 0) {
				new Notice("Aucune décision citée dans cette note (ou la note n'est pas encore analysée).");
				return;
			}
			new PlanModal(plugin.app, themes, (options) => {
				const plan = notePlan(plugin, file, options);
				if (!plan || plan.split("\n").length < 3) {
					new Notice("Rien à insérer : aucune décision de cette note n'a de fiche.");
					return;
				}
				editor.replaceRange(`\n${plan}\n`, editor.getCursor("to"));
			}).open();
		},
	});
	plugin.addCommand({
		id: "bibliographie-de-la-note",
		name: "Insérer la bibliographie des décisions et textes cités dans la note",
		editorCallback: (editor, view) => {
			const bibliography = view.file && noteBibliography(plugin, view.file);
			if (!bibliography) {
				new Notice("Aucune décision ni aucun texte cité dans cette note (ou la note n'est pas encore analysée).");
				return;
			}
			editor.replaceRange(`\n${bibliography}\n`, editor.getCursor("to"));
		},
	});

	// Export dans un fichier (Markdown, CSV, BibTeX, RIS)
	plugin.addCommand({
		id: "exporter-bibliographie-note",
		name: "Exporter la bibliographie de la note (CSV, BibTeX, RIS…)",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;
			if (!checking) new ExportModal(plugin.app, plugin, file).open();
			return true;
		},
	});
	plugin.addCommand({ id: "exporter-bibliographie-coffre", name: "Exporter la bibliographie de tout le coffre (CSV, BibTeX, RIS…)", callback: () => new ExportModal(plugin.app, plugin).open() });

	// Tâches longues sur la base
	for (const [id, name, task] of TASK_COMMANDS) {
		plugin.addCommand({ id, name, callback: () => plugin.tasks.run(task) });
	}
}
