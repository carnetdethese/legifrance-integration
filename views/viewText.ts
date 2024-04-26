import LegifrancePlugin from "main";
import { Decision } from "abstracts/decisions";
import { ItemView, Setting, WorkspaceLeaf } from "obsidian";
import { creerUneNouvelleNote } from "lib/utils";
import { newNote } from "creation/newNote";
import { ResearchTextView, RESEARCH_TEXT_VIEW } from "./researchText";
import { replaceMark } from "lib/tools";


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

    container.createEl("h4", { text: this.decision.id });

    const header = container.createDiv();

    const infoBox = container.createEl("div", { cls: "showline"})
    infoBox.createEl("h5", {text: "Informations" })

    infoBox.createEl("p", { text: `Juridiction : ${this.decision.juridiction}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Date : ${this.decision.date}`, cls:"infoDecision" } );
    infoBox.createEl("p", { text: `Numéro : ${this.decision.numero}`, cls:"infoDecision" } );
    if (this.decision.formation) { infoBox.createEl("p", { text: `Formation : ${this.decision.formation}`, cls:"infoDecision" } ); } 
    if (this.decision.solution) {infoBox.createEl("p", { text: `Solution : ${this.decision.solution}`, cls:"infoDecision" } );}

    infoBox.createEl("p", {text: "–––––––––––––––––", cls:"break"});

    const content = container.createDiv();

    content.createEl("h5", {text: "Texte intégral"});

    if (this.decision.texteIntegralHTML) {
      const texteArray = this.decision.texteIntegralHTML.split("<br/>");

      texteArray?.forEach(elt => {
        const para = content.createEl("p");
        replaceMark(elt, para);
        //content.createEl("p", { text: elt });
      })
    }

    if (this.decision.sommaires) {
      content.createEl("h4", {text: "Sommaires" })
      this.decision.sommaires.forEach(elt => {
        content.createEl("p", { text: elt.resume });
      })

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
}