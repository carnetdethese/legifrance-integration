import { getDocumentInfo, legalDocument } from "abstracts/document";
import { resultatsRechercheClass, sectionsResultats } from "abstracts/searches";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import { getAgentChercheur, getResultatsVariable, getValeurRecherche } from "globals/globals";
import { replaceMark } from "lib/tools";
import { isArray } from "lodash";
import { ItemView, setIcon, Setting, WorkspaceLeaf } from "obsidian";
import { addView } from "./viewsData";
import LegifrancePlugin from "main";
import { criteresTriGeneraux } from "api/constants";
import { testResults } from "api/testResults";

import { StrictMode } from "react";
import { Root, createRoot } from "react-dom/client";
import { ResultsView } from "./components/results/ResultsView";

export const SEARCH_RESULT_VIEW = "search-result-view";



export class SearchResultView extends ItemView {
  doc:documentSearchFieldsClass;
  fond:string;
  resultatsComplet:legalDocument[];
  root: Root | null = null;

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
    const pageNb = this.doc.getCurrentPageNumber();
    const totalResults = getResultatsVariable().totalResultNumber;
    const totalPageNb = Math.ceil(totalResults / this.doc.getPageSize())
    this.resultatsComplet = new resultatsRechercheClass(getResultatsVariable()).listeResultats();

      this.root = createRoot(this.containerEl.children[1]);
    
        this.root.render(
          <StrictMode>
            <ResultsView results={this.resultatsComplet} totalResults={totalResults} totalPageNb={totalPageNb} />
          </StrictMode>
        );

    // if (!getResultatsVariable()) return;
  }

	async onClose() {
		this.root?.unmount();
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
          .setIcon('arrow-big-left')
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
          .setIcon('arrow-big-right')
          .onClick(() => {
            if (pageNb == totalPageNb) return;
            else this.doc.updatePageNumber(pageNb + 1);
            this.doc.launchSearch();
          })
      })
  }

  sectionsExtraits(sections:sectionsResultats[], container:HTMLElement) {

    sections.forEach((section) => {
      section.extracts.forEach((extract) => {
        if (extract.type == "articles") {

          const extrait = container.createDiv();
          extrait.classList.add("extraitContainer");

          if (!extract.num) extrait.createEl('b', { text: `Article`, cls: "lienArticle" })
          else extrait.createEl('b', { text: `Article ${extract.num}`, cls: "lienArticle" })

          extrait.createEl('br');
          replaceMark(extract.values[0], extrait);
          extrait.createEl('br');
        }
      })
    })
  }

}



