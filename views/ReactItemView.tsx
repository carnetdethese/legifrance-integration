import { ItemView, WorkspaceLeaf } from "obsidian";
import { ReactNode, StrictMode } from "react";
import { Root, createRoot } from "react-dom/client";
import LegifrancePlugin from "main";
import { PluginContext } from "./context";

/**
 * Socle commun des vues du plugin : monte un arbre React dans `contentEl`,
 * l'enveloppe du contexte plugin et le démonte à la fermeture.
 *
 * Les sous-classes décrivent leur contenu dans `renderContent()` et appellent
 * `update()` lorsque leur état propre change.
 */
export abstract class ReactItemView extends ItemView {
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, protected plugin: LegifrancePlugin) {
		super(leaf);
	}

	protected abstract renderContent(): ReactNode;

	/** Classes de mise en page propres à la vue, ajoutées à sa zone de contenu (voir `styles.css`). */
	protected contentClasses(): string[] {
		return [];
	}

	async onOpen() {
		this.contentEl.addClasses(["legifrance-view", ...this.contentClasses()]);
		this.root = createRoot(this.contentEl);
		this.update();
	}

	/** Relance le rendu React (sans effet avant `onOpen` ou après `onClose`). */
	protected update() {
		this.root?.render(
			<StrictMode>
				<PluginContext.Provider value={this.plugin}>
					{this.renderContent()}
				</PluginContext.Provider>
			</StrictMode>
		);
	}

	async onClose() {
		this.root?.unmount();
		this.root = null;
	}
}
