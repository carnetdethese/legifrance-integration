import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import { LegalRef } from "references/parser";
import { ResolvedLink } from "references/resolver";

/** Fenêtre flottante affichant le texte complet d'un article, avec son lien Légifrance. */
export class ArticleModal extends Modal {
	/** Cycle de vie du rendu Markdown, lié à celui de la fenêtre. */
	private component = new Component();

	constructor(
		app: App,
		private reference: LegalRef,
		private link: ResolvedLink
	) {
		super(app);
	}

	onOpen() {
		this.component.load();
		this.setTitle(this.reference.label);
		const body = this.contentEl.createDiv({ cls: "legifrance-article-text" });
		MarkdownRenderer.render(this.app, this.link.texte ?? "", body, "", this.component);

		this.contentEl.createEl("a", {
			text: "Ouvrir sur Légifrance",
			href: this.link.url,
			cls: "legifrance-article-link",
		});
	}

	onClose() {
		this.component.unload();
		this.contentEl.empty();
	}
}
