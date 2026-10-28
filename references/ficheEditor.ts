/**
 * Les fiches de décisions dans les notes du coffre : reconnaissance d'une fiche d'après les propriétés de la
 * note (`isFiche`), enregistrement dans la base, bouton « Compléter la fiche » en haut de l'éditeur, complément
 * automatique à l'ouverture. Ce qui se passe quand on complète (requêtes, propriétés écrites) est dans
 * `ficheSync.ts` ; les règles de lecture des propriétés, dans `fiches.ts`.
 */
import { MarkdownView, TFile, debounce } from "obsidian";
import { REFERENCES_EVENT } from "lib/events";
import type LegifrancePlugin from "main";
import { completableCount, ficheId, isFiche } from "./fiches";
import { completeFiche } from "./ficheSync";

/** Classe des boutons « Compléter la fiche » ajoutés aux éditeurs. */
const FICHE_BUTTON_CLASS = "legifrance-fiche-action";

/** Une note Markdown du coffre (et non une image, un PDF, un dossier…). */
export const isMarkdown = (file: unknown): file is TFile => file instanceof TFile && file.extension === "md";

export class FicheEditor {
	/** Bouton de chaque éditeur ouvert sur une fiche : état affiché (étiquette), pour ne le recréer que s'il change. */
	private buttons = new WeakMap<MarkdownView, { el: HTMLElement; state: string }>();
	/** Fiches déjà complétées automatiquement pendant cette session : une seule tentative chacune. */
	private autoCompleted = new Set<string>();

	constructor(private readonly plugin: LegifrancePlugin) {}

	/** Branche les événements d'Obsidian qui concernent les fiches (à appeler au chargement du plugin). */
	register() {
		const { plugin } = this;
		const { workspace, metadataCache } = plugin.app;
		plugin.registerEvent(
			metadataCache.on("changed", (file) => {
				if (!isMarkdown(file)) return;
				if (this.syncNote(file)) plugin.events.trigger(REFERENCES_EVENT);
				this.refreshButtons();
			})
		);
		plugin.registerEvent(workspace.on("file-open", (file) => file && this.autoComplete(file)));
		plugin.registerEvent(workspace.on("active-leaf-change", () => this.refreshButtons()));
		plugin.registerEvent(workspace.on("layout-change", () => this.refreshButtons()));
	}

	private frontmatterOf(file: TFile) {
		return this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	}

	/** Met à jour la base pour une note : fiche (avec son identifiant) ou non. @returns `true` si la base a changé. */
	private syncNote(file: TFile) {
		const { settings, references } = this.plugin;
		const frontmatter = this.frontmatterOf(file);
		return isFiche(frontmatter, settings) ? references.setFiche(file.path, ficheId(frontmatter, settings)) : references.removeFiche(file.path);
	}

	/** Recense les fiches de tout le coffre (d'après le cache des propriétés d'Obsidian). */
	sync() {
		const { references, events } = this.plugin;
		const files = this.plugin.app.vault.getMarkdownFiles();
		let changed = false;
		for (const file of files) changed = this.syncNote(file) || changed;
		const present = new Set(files.map((f) => f.path));
		for (const path of references.fichePaths()) if (!present.has(path)) changed = references.removeFiche(path) || changed;
		if (changed) events.trigger(REFERENCES_EVENT);
		return changed;
	}

	/** Après un changement de réglage des fiches : recensement, boutons et panneaux à jour. */
	settingsChanged = debounce(() => {
		this.sync();
		this.refreshButtons();
		this.plugin.events.trigger(REFERENCES_EVENT);
	}, 500, true);

	/** Ajoute, met à jour ou retire le bouton « Compléter la fiche » de chaque éditeur ouvert. */
	refreshButtons() {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView) this.updateButton(leaf.view);
		}
	}

	private updateButton(view: MarkdownView) {
		const { settings } = this.plugin;
		const { file } = view;
		const frontmatter = file && this.frontmatterOf(file);
		let label: string | undefined;
		if (file && isFiche(frontmatter, settings)) {
			const count = completableCount(frontmatter, settings);
			if (!ficheId(frontmatter, settings)) label = "Fiche de décision : rechercher la décision (identifiant Légifrance manquant)";
			else if (count > 0) label = `Compléter la fiche depuis Légifrance (${count} propriété${count > 1 ? "s" : ""})`;
		}

		const state = file && label ? `${file.path}|${label}` : "";
		const current = this.buttons.get(view);
		if (current?.state === state && current.el.isConnected) return;
		// Retire aussi les boutons d'une instance précédente du plugin (rechargement) : Obsidian ne les enlève pas.
		view.containerEl.querySelectorAll(`.${FICHE_BUTTON_CLASS}`).forEach((el) => el.remove());
		this.buttons.delete(view);
		if (!state || !label) return;

		const el = view.addAction("cloud-download", label, () => view.file && void completeFiche(this.plugin, view.file));
		el.addClass(FICHE_BUTTON_CLASS);
		this.buttons.set(view, { el, state });
	}

	/** Retire le bouton « Compléter la fiche » de tous les éditeurs (déchargement du plugin). */
	removeButtons() {
		document.querySelectorAll(`.${FICHE_BUTTON_CLASS}`).forEach((el) => el.remove());
	}

	/** Réglage « compléter à l'ouverture » : complète la fiche qui vient de s'ouvrir, une fois par session. */
	private autoComplete(file: TFile) {
		const { settings } = this.plugin;
		if (!settings.ficheAutoComplete || file.extension !== "md" || this.autoCompleted.has(file.path)) return;
		const frontmatter = this.frontmatterOf(file);
		if (!isFiche(frontmatter, settings) || !ficheId(frontmatter, settings) || completableCount(frontmatter, settings) === 0) return;
		this.autoCompleted.add(file.path);
		void completeFiche(this.plugin, file, true);
	}
}
