import { ItemView, WorkspaceLeaf } from "obsidian";

export const SEARCH_RESULT_VIEW = "search-result-view";

export class SearchResultView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return SEARCH_RESULT_VIEW;
  }

  getDisplayText() {
    return "Example view";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h4", { text: "Example view" });
  }

  async onClose() {
    // Nothing to clean up.
  }
}