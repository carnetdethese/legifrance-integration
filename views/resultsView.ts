import { getDocumentInfo, legalDocument } from "abstracts/document";
import { documentSearchFieldsClass, resultatsRecherche, resultatsRechercheClass } from "abstracts/searches";
import { getAgentChercheur, getDocumentsListe, getResultatsVariable, getValeurRecherche } from "globals/globals";
import { replaceMark } from "lib/tools";
import { isArray } from "lodash";
import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { addView } from "./viewsData";
import LegifrancePlugin from "main";
import { criteresTriGeneraux } from "api/constants";

export const SEARCH_RESULT_VIEW = "search-result-view";

export class SearchResultView extends ItemView {
  doc:documentSearchFieldsClass;
  fond:string;
  resultatsComplet:legalDocument[];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  addDocument(docu:documentSearchFieldsClass) {
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

    this.navigationPage(resultatsContent);

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

    this.navigationPage(resultatsContent);
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


  navigationPage(container:HTMLElement) {

    const pluginInstance = LegifrancePlugin.instance;
    const pageNb = this.doc.getCurrentPageNumber();
    const totalResults = getResultatsVariable().totalResultNumber;
    const totalPageNb = Math.ceil(totalResults / this.doc.getPageSize())
    
    new Setting(container)
      .setName(`Page ${pageNb} sur ${totalPageNb} (${totalResults} résultats)`)
      .addDropdown(cb => {
        cb 
          .addOption(criteresTriGeneraux.pertinence.pertinence, "Pertinence")
          .addOptions(this.doc.criteresTri)
          .setValue(this.doc.recherche.sort)
          .onChange(() => {
            this.doc.updateFacette(cb.getValue());
            this.doc.launchSearch();
          });
        })
      .addDropdown(cb => {
        cb
          .addOptions({
            "10": "10",
            "25": "25",
            "50": "50",
            "100": "100"
          })
          .setValue(this.doc.getPageSize().toString())
          .onChange((value) => {
            this.doc.updatePageSize(Number(value));
            this.doc.launchSearch();
          })
      })
      .addButton(cb => {
        if (pageNb == 1) cb.setDisabled(true);
        cb
          .setButtonText("<")
          .onClick(() => {
            if (pageNb == 1) return;
            else this.doc.updatePageNumber(pageNb - 1);
            this.doc.launchSearch();
          })
      })
      .addButton(cb => {
        if (pageNb == totalPageNb) cb.setDisabled(true);
        cb
          .setButtonText(">")
          .onClick(() => {
            if (pageNb == totalPageNb) return;
            else this.doc.updatePageNumber(pageNb + 1);
            this.doc.launchSearch();
          })
      })
  }

}