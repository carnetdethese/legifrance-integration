import LegifrancePlugin from "main";
import { Decision } from "abstracts/decisions";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { newNote } from "creation/newNote";
import { ResearchTextView, RESEARCH_TEXT_VIEW } from "./researchText";
import { removeTags, replaceHTMLTags, replaceMark } from "lib/tools";


export const TEXT_READER_VIEW = "text-reader-view";

export class textReaderView extends ItemView {
  decision:Decision;
  plugin:LegifrancePlugin;
  nouvelleNote:newNote;
  researchTab:ResearchTextView;

  constructor(plugin:LegifrancePlugin, leaf: WorkspaceLeaf) {
    super(leaf);
    this.plugin = plugin;
    this.decision = plugin.decision;
    this.nouvelleNote = new newNote(this.plugin.app, this.plugin.settings.template, this.plugin.settings.fileTitle, this.decision);
    
    if (this.plugin.app.workspace.getLeavesOfType(RESEARCH_TEXT_VIEW).length > 0){
      this.researchTab = this.plugin.app.workspace.getLeavesOfType(RESEARCH_TEXT_VIEW)[0].view as ResearchTextView;
    }
  }

  getViewType() {
    return TEXT_READER_VIEW;
  }

  getDisplayText() {
    return this.decision.id;
  }


  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();

    if (this.decision.origin == "CETAT" || this.decision.origin == "JURI" || this.decision.origin == "CONSTIT") {
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
    container.createEl("h2", { text: this.decision.id });
    const infoBox = container.createEl("div", { cls: "showline"})

    infoBox.createEl("h3", {text: "Informations" })

    infoBox.createEl("p", { text: `Titre : ${this.decision.titre}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Date : ${this.decision.date}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Numéro : ${this.decision.numero}`, cls:"infoDecision" } );
    if (this.decision.formation) { infoBox.createEl("p", { text: `Formation : ${this.decision.formation}`, cls:"infoDecision" } ); } 
    if (this.decision.abstract) {infoBox.createEl("p", { text: `Solution : ${this.decision.abstract}`, cls:"infoDecision" } );}

    infoBox.createEl("p", {text: "–––––––––––––––––", cls:"break"});

    const content = container.createDiv();

    content.createEl("h3", {text: "Texte intégral"});

    if (this.decision.texteIntegral) {
      const texteArray = this.decision.texteIntegral.split(/\n/);
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
    container.createEl("h2", { text: this.decision.id });

    const infoBox = container.createEl("div", { cls: "showline"})
    infoBox.createEl("h3", {text: "Informations" })

    infoBox.createEl("p", { text: `Juridiction : ${this.decision.juridiction}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Date : ${this.decision.date}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Numéro : ${this.decision.numero}`, cls:"infoDecision" } );
    if (this.decision.formation) { infoBox.createEl("p", { text: `Formation : ${this.decision.formation}`, cls:"infoDecision" } ); } 
    if (this.decision.abstract) {infoBox.createEl("p", { text: `Solution : ${this.decision.abstract}`, cls:"infoDecision" } );}

    infoBox.createEl("p", {text: "–––––––––––––––––", cls:"break"});

    const content = container.createDiv();

    content.createEl("h3", {text: "Texte intégral"});

    if (this.decision.texteIntegralHTML) {
      const texteArray = this.decision.texteIntegralHTML.split("<p>");
      texteArray?.forEach(elt => {
        this.showElementOfStatute("p", elt, content)
      })
    }

    if (this.decision.sommaires) {
      content.createEl("h3", {text: "Sommaires" })
      this.decision.sommaires.forEach(elt => {
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