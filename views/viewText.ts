import { ItemView, WorkspaceLeaf } from "obsidian";

export const TEXT_READER_VIEW = "text-reader-view";

export class textReaderView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return TEXT_READER_VIEW;
  }

  getDisplayText() {
    return "Résultat recherche";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h4", { text: "Résultat recherche" });
  }

  async onClose() {
    // Nothing to clean up.
  }
}