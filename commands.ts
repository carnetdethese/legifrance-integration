/**
 * Commandes de la palette d'Obsidian et icône du ruban. Chaque commande ouvre une vue (`LegifrancePlugin.activate…`)
 * la fenêtre d'insertion dans la note ou celle d'export. Les opérations de maintenance (tâches longues sur la base) sont dans les réglages.
 */
import { MarkdownView, Notice } from "obsidian";
import type LegifrancePlugin from "main";
import { CodePickerModal } from "views/CodePickerModal";
import { ExportModal } from "views/ExportModal";
import { InsertModal } from "views/InsertModal";

export function registerCommands(plugin: LegifrancePlugin) {
	plugin.addRibbonIcon("scale", "Légifrance", () => plugin.activateResearchTextView());

	// Vues
	plugin.addCommand({ id: "nouvelle-recherche", name: "Nouvelle recherche", callback: () => plugin.activateResearchTextView() });
	plugin.addCommand({ id: "parcourir-un-code", name: "Parcourir un code", callback: () => new CodePickerModal(plugin.app, plugin).open() });
	plugin.addCommand({ id: "references-juridiques", name: "Afficher les références juridiques", callback: () => plugin.activateReferencesView() });
	plugin.addCommand({ id: "articles-de-la-note", name: "Afficher les articles", callback: () => plugin.activateArticlesView() });
	plugin.addCommand({ id: "base-de-donnees", name: "Afficher la base de données et cycle", callback: () => plugin.activateDatabaseView() });
	plugin.addCommand({ id: "jurisprudence", name: "Analyse de la jurisprudence", callback: () => plugin.activateJurisprudenceView() });

	// Repérage des références dans les notes : interrupteur rapide (le réglage est aussi dans les options du plugin)
	plugin.addCommand({
		id: "reperage-des-references",
		name: "Afficher / masquer le repérage des références",
		callback: async () => {
			plugin.settings.markReferences = !plugin.settings.markReferences;
			await plugin.saveSettings();
			plugin.app.workspace.updateOptions();
			// Les notes ouvertes en mode lecture sont rendues à nouveau.
			plugin.app.workspace.getLeavesOfType("markdown").forEach((leaf) => (leaf.view as MarkdownView).previewMode?.rerender(true));
			new Notice(`Repérage des références ${plugin.settings.markReferences ? "affiché" : "masqué"}.`);
		},
	});

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
