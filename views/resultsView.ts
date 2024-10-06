import { getDocumentInfo, legalDocument } from "abstracts/document";
import { documentHandlerBase, resultatsRecherche, resultatsRechercheClass } from "abstracts/searches";
import { getAgentChercheur, getDocumentsListe, getResultatsVariable, getValeurRecherche } from "globals/globals";
import { replaceMark } from "lib/tools";
import { isArray } from "lodash";
import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { addView } from "./viewsData";
import LegifrancePlugin from "main";

export const SEARCH_RESULT_VIEW = "search-result-view";

export class SearchResultView extends ItemView {
  doc:documentHandlerBase;
  fond:string;
  resultatsComplet:legalDocument[];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  addDocument(docu:documentHandlerBase) {
    if (!this.doc) this.doc = docu;
    return;
  }

  getViewType() {
    return SEARCH_RESULT_VIEW;
  }

  getDisplayText() {
    return "Résultats";
  }

  addFond(fond:string) {
    this.fond = fond;
  }

  async onOpen() {
    if (!getResultatsVariable()) return; 

    const container = this.containerEl.children[1];
    container.empty();

    const titre = container.createEl("h2", { text: "Résultats" });
    titre.style.textAlign = "center";
    titre.style.marginBottom = "20px";

    this.resultatsComplet = new resultatsRechercheClass(getResultatsVariable()).listeResultats();

    const resultatsContent = container.createDiv();
    resultatsContent.style.maxWidth = "700px";
    resultatsContent.style.width = "100%";
    resultatsContent.style.margin = "auto";

    if (this.resultatsComplet && this.resultatsComplet && isArray(this.resultatsComplet)) {
      this.resultatsComplet.forEach(async (resultat, index) => {
        const resultatContainer = createDiv();
        resultatContainer.classList.add("resultat-document-container")

        const titre = replaceMark(resultat.titre, document.createElement('b'));
        titre.classList.add('titre-document');
        resultatContainer.appendChild(titre);
        resultatContainer.createEl('br');

        const contenu = replaceMark(resultat.texte, document.createElement('small'));
        resultatContainer.appendChild(contenu);

        resultatsContent.appendChild(resultatContainer);
        resultatContainer.addEventListener('click', () => {
          new Notice(resultat.titre);
          this.selectedDocument(resultat.id);
        })

      });
    }

    this.previousPage(resultatsContent);
  }

  async onClose() {
    // Nothing to clean up.

  }

  async selectedDocument(id:string) {
    const pluginInstance = LegifrancePlugin.instance;
    const selectedDocument = this.resultatsComplet.find(elt => elt.id == id) as legalDocument
    await getDocumentInfo(selectedDocument, getValeurRecherche(), getAgentChercheur());

    addView(this.resultatsComplet.find(elt => elt.id == id) as legalDocument);
    pluginInstance.instancesOfDocumentViews += 1;
    pluginInstance.activateTextReaderView();
  }



  previousPage(container:HTMLElement) {
    const previous = new Setting(container)
      .addButton(cb => {
        cb.setButtonText("<")
      })

      // previous.setClass("side-buttons");
  }

  nextPage() {

  }
}