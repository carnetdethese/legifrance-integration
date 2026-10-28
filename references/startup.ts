/**
 * Actualisation des articles et textes cités à l'ouverture d'Obsidian (réglage `refreshOnStartup`). À part de
 * `indexer.ts`, qui ne dépend pas d'Obsidian et reste testable.
 */
import { Notice } from "obsidian";
import type LegifrancePlugin from "main";
import { REFRESH_AFTER_MS, REFRESH_TASK } from "./indexer";

/** Délai après le démarrage avant de lancer l'actualisation en fond : l'indexation du coffre et les analyses locales passent d'abord. */
const STARTUP_REFRESH_DELAY_MS = 60 * 1000;

/**
 * À l'ouverture d'Obsidian, selon le réglage `refreshOnStartup` : signale les articles et textes dont le lien
 * date de plus de six mois (avec un bouton pour lancer l'actualisation), ou la lance d'elle-même en fond.
 */
export function refreshOnStartup(plugin: LegifrancePlugin) {
	const mode = plugin.settings.refreshOnStartup;
	if (mode === "off" || !plugin.hasCredentials) return;
	const due = plugin.references.articlesToRefresh(Date.now() - REFRESH_AFTER_MS).length;
	if (due === 0) return;
	if (mode === "run") {
		window.setTimeout(() => void plugin.tasks.run(REFRESH_TASK), STARTUP_REFRESH_DELAY_MS);
		return;
	}
	const notice = new Notice("", 0);
	const message = notice.messageEl;
	message.empty();
	message.createDiv({ text: `${due} article${due > 1 ? "s" : ""} ou texte${due > 1 ? "s" : ""} cité${due > 1 ? "s" : ""} n'${due > 1 ? "ont" : "a"} pas été revérifié${due > 1 ? "s" : ""} sur Légifrance depuis plus de six mois.` });
	const actions = message.createDiv({ cls: "modal-button-container" });
	actions.createEl("button", { text: "Actualiser", cls: "mod-cta" }).onclick = () => {
		notice.hide();
		void plugin.tasks.run(REFRESH_TASK);
	};
	actions.createEl("button", { text: "Plus tard" }).onclick = () => notice.hide();
}
