import LegifrancePlugin from "main";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { isDecision, newNote } from "creation/newNote";
import { ResearchTextView, RESEARCH_TEXT_VIEW } from "./researchText";
import { removeTags, replaceMark } from "lib/tools";
import { documentDataStorage, findViewById } from "./viewsData";
import { legalDocument } from "abstracts/document";
import { documentsListe, getDocumentsListe } from "globals/globals";

export const TEXT_READER_VIEW = "text-reader-view";

export class textReaderView extends ItemView {
  document:documentDataStorage;
  plugin:LegifrancePlugin;
  nouvelleNote:newNote;
  researchTab:ResearchTextView;
  id:number;
  data:legalDocument;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    const pluginInstance = LegifrancePlugin.instance;

    
    if (pluginInstance.tabViewIdToShow && pluginInstance.tabViewIdToShow != -1) {
      this.id = pluginInstance.tabViewIdToShow;
      pluginInstance.tabViewIdToShow = -1;
      this.document = getDocumentsListe()[this.id];
    }
    else this.id = pluginInstance.instancesOfDocumentViews;

    if (findViewById(this.id) != undefined) {
      this.document = findViewById(this.id) as documentDataStorage;
      this.data = this.document.data;
    }
    else {
      this.data = {
        fond: "",
        titre: "",
        id: "",
        texte: "",
        lien: "",
        origin: "",
        type: ""
      };
      this.document = new documentDataStorage(0, this.data);
    }

    // // console.log(this.id, plugin.document);

    this.document.template = this.document.data.type == "jurisprudence" ? pluginInstance.settings.templateDecision : pluginInstance.settings.templateDocument;

    if (this.document != undefined) this.nouvelleNote = new newNote(pluginInstance.app, this.document.template, pluginInstance.settings.fileTitle, this.document.data, pluginInstance.settings.dossierBase);

    if (pluginInstance.app.workspace.getLeavesOfType(RESEARCH_TEXT_VIEW).length > 0){
      this.researchTab = pluginInstance.app.workspace.getLeavesOfType(RESEARCH_TEXT_VIEW)[0].view as ResearchTextView;
    }
  }

  getViewType() {
    return TEXT_READER_VIEW;
  }

  getDisplayText() {
    return this.document.data.id;
  }


  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();

    if (this.document.data.origin == "CETAT" || this.document.data.origin == "JURI" || this.document.data.origin == "CONSTIT") {
      this.viewDecision(container);
    }
    else {
      this.viewStatute(container)
    }

    if (this.researchTab){
      await this.researchTab.onOpen();
    }
  }

  async onClose() {
    // Nothing to clean up.
    if (this.researchTab){
      await this.researchTab.onOpen();
    }
  }

  viewStatute(container:Element) {
    container.createEl("h2", { text: this.document.data.id.toString() });
    const infoBox = container.createEl("div", { cls: "showline"})

    infoBox.createEl("h3", {text: "Informations" })

    infoBox.createEl("p", { text: `Titre : ${this.document.data.titre}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Date : ${this.document.data.date}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Numéro : ${this.document.data.numero}`, cls:"infoDecision" } );

    if (isDecision(this.document.data) && this.document.data.formation) { infoBox.createEl("p", { text: `Formation : ${this.document.data.formation}`, cls:"infoDecision" } ); } 
    if (isDecision(this.document.data) && this.document.data.abstract) {infoBox.createEl("p", { text: `Solution : ${this.document.data.abstract}`, cls:"infoDecision" } );}

    infoBox.createEl("p", {text: "–––––––––––––––––", cls:"break"});

    const content = container.createDiv();

    content.createEl("h3", {text: "Texte intégral"});

    if (this.document.data.texteIntegral) {
      const texteArray = this.document.data.texteIntegral.split(/\n/);
      texteArray?.forEach(elt => {
        if (elt.startsWith("##")) {
          this.showElementOfStatute("h4", elt, content)
        }
        else if (elt.startsWith('###')) {
          this.showElementOfStatute("h5", elt, content)
        }
        else {
          this.showElementOfStatute("p", elt, content)
        }
      })
    }
  }

  viewDecision(container:Element) {

    container.createEl("h2", { text: this.document.data.id.toString() });

    const infoBox = container.createEl("div", { cls: "showline"})
    infoBox.createEl("h3", {text: "Informations" })

    if ('juridiction' in this.document.data) {
      infoBox.createEl("p", { text: `Juridiction : ${this.document.data.juridiction}`, cls:"infoDecision" } );
      infoBox.createEl("p", { text: `Date : ${this.document.data.date}`, cls:"infoDecision" } );
      infoBox.createEl("p", { text: `Numéro : ${this.document.data.numero}`, cls:"infoDecision" } );
      if (this.document.data.formation) { infoBox.createEl("p", { text: `Formation : ${this.document.data.formation}`, cls:"infoDecision" } ); } 
      if (this.document.data.abstract) {infoBox.createEl("p", { text: `Solution : ${this.document.data.abstract}`, cls:"infoDecision" } );}
    }

    infoBox.createEl("p", {text: "–––––––––––––––––", cls:"break"});

    const content = container.createDiv();

    content.createEl("h3", {text: "Texte intégral"});

    if (this.document.data.texteIntegralHTML) {
      const texteArray = this.document.data.texteIntegralHTML.split("<p>");
      texteArray?.forEach(elt => {
        this.showElementOfStatute("p", elt, content)
      })
    }

    if (isDecision(this.document.data) && this.document.data.sommaires) {
      content.createEl("h3", {text: "Sommaires" })
      this.document.data.sommaires.forEach(elt => {
        content.createEl("p", { text: elt.resume });
      })
    }
  }

  showElementOfStatute(el:keyof HTMLElementTagNameMap, elt:string, content:Element) {
    elt = removeTags(elt);
    const para = content.createEl(el);
    replaceMark(elt, para);
  }

}