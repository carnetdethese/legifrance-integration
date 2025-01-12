import { StrictMode } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { NoteTaking } from './components/notes/NoteTaking';
import React from 'react';

const NOTE_TAKING_VIEW = 'note-taking-view';

class NoteTakingView extends ItemView {
	root: Root | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return NOTE_TAKING_VIEW;
	}

	getDisplayText() {
		return 'Notes';
	}

	async onOpen() {
		this.root = createRoot(this.containerEl.children[1]);
		this.root.render(
			<StrictMode>
				<NoteTaking />,
			</StrictMode>,
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}