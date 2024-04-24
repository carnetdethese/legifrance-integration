import LegifrancePlugin from "main";
import { Decision } from "abstracts/decisions";
import { ItemView, Setting, WorkspaceLeaf } from "obsidian";
import { info } from "console";
import { replaceMark } from "lib/tools";

export const TEXT_READER_VIEW = "text-reader-view";

export class textReaderView extends ItemView {
  decision:Decision;


  constructor(plugin:LegifrancePlugin, leaf: WorkspaceLeaf) {
    super(leaf);
    this.decision = plugin.decision;
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


    new Setting(header)
      .setName("Créer une note")
      .addText(cb => cb
        .setPlaceholder("Titre"))
      .addButton(cb => cb
        .setCta()
        .setButtonText("Créer la note")
      )

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

    const texteArray = this.decision.texteIntegral?.split("\n");

    texteArray?.forEach(elt => {
      content.createEl("p", { text: elt });
    })

    if (this.decision.sommaires) {
      content.createEl("h4", {text: "Sommaires" })
      this.decision.sommaires.forEach(elt => {
        content.createEl("p", { text: elt.resume });
      })

    }



    



  }

  async onClose() {
    // Nothing to clean up.
  }
}