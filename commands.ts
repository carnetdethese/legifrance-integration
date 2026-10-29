/**
 * Commandes de la palette d'Obsidian et icône du ruban. Chaque commande ouvre une vue (`LegifrancePlugin.activate…`)
 * la fenêtre d'insertion dans la note ou celle d'export. Les opérations de maintenance (tâches longues sur la base) sont dans les réglages.
 */
import type LegifrancePlugin from "main";
import { ExportModal } from "views/ExportModal";
import { InsertModal } from "views/InsertModal";

export function registerCommands(plugin: LegifrancePlugin) {
	plugin.addRibbonIcon("scale", "Légifrance", () => plugin.activateResearchTextView());

	// Vues
	plugin.addCommand({ id: "nouvelle-recherche", name: "Nouvelle recherche", callback: () => plugin.activateResearchTextView() });
	plugin.addCommand({ id: "references-juridiques", name: "Afficher les références juridiques", callback: () => plugin.activateReferencesView() });
	plugin.addCommand({ id: "articles-de-la-note", name: "Afficher les articles", callback: () => plugin.activateArticlesView() });
	plugin.addCommand({ id: "base-de-donnees", name: "Afficher la base de données et cycle", callback: () => plugin.activateDatabaseView() });
	plugin.addCommand({ id: "jurisprudence", name: "Analyse de la jurisprudence", callback: () => plugin.activateJurisprudenceView() });

	// Texte inséré dans la note : table, plan ou bibliographie, au choix dans la fenêtre
	plugin.addCommand({
		id: "inserer",
		name: "Insérer…",
		editorCallback: (editor, view) => {
			if (view.file) new InsertModal(plugin.app, plugin, editor, view.file).open();
		},
	});

	// Export dans un fichier (Markdown, CSV, BibTeX, RIS) : la note ouverte ou tout le coffre, au choix dans la fenêtre
	plugin.addCommand({
		id: "exporter-bibliographie",
		name: "Exporter la bibliographie (CSV, BibTeX, RIS…)",
		callback: () => new ExportModal(plugin.app, plugin, plugin.app.workspace.getActiveFile() ?? undefined).open(),
	});
}
