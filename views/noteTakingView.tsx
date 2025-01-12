import { StrictMode } from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import { NoteTaking } from "./components/notes/NoteTaking";
import LegifrancePlugin from "main";
import { PluginContext } from "./context";

export const NOTE_TAKING_VIEW = "note-taking-view";

export class noteTakingView extends ItemView {
	root: Root | null = null;
	plugin: LegifrancePlugin;

	constructor(leaf: WorkspaceLeaf, plugin: LegifrancePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return NOTE_TAKING_VIEW;
	}

	getDisplayText() {
		return "Notes";
	}

	async onOpen() {
		this.root = createRoot(this.containerEl.children[1]);
		this.root.render(
			<StrictMode>
				<PluginContext.Provider value={this.plugin}>
					<NoteTaking />
				</PluginContext.Provider>
			</StrictMode>
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}
