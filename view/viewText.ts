import { ItemView, WorkspaceLeaf, Setting, Notice } from "obsidian";
import { codeFond, typeRecherche, operateursRecherche } from "api/constants";

export const LEGAL_TEXT_VIEW = "legal-text-view";

interface expressionRecherche {
  valeur?:string;
  type?:string;
  operateur?:string;
}

interface Recherche {
  expressionRecherche: expressionRecherche[];
  fond:string;
}

export class LegalTextView extends ItemView {
  recherche:Recherche;
  valeursRecherche:expressionRecherche[];
  compteur:number;
  nbChamps:number;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.compteur = 1;
    this.recherche = {
      expressionRecherche: [],
      fond: ""
    }
  }

  getViewType() {
    return LEGAL_TEXT_VIEW;
  }

  getDisplayText() {
    return "Légifrance Intégration";
  }

  newExpression(container:HTMLElement, id:number) {
    const instanceCount = id - 1;
    if (this.compteur > 5) {
      return 
    }

    const champRecherche = container.createEl("div");

    new Setting(champRecherche)
      .setName("Champ " + id)
      .addText((text) =>
        text.onChange((value) => {
        this.recherche.expressionRecherche[instanceCount].valeur = value
          })
        .setValue(this.recherche.expressionRecherche[instanceCount].valeur || ""))
      .addButton(cb => cb
        .setIcon("plus")
        .onClick(() => {
          if (this.compteur < 5 ) {
            this.compteur += 1;
            this.onOpen();
          }
      }))
      .addButton(cb => cb
        .setIcon("minus")
        .onClick(() => {
          if (this.compteur > 1) {
            this.recherche.expressionRecherche[this.compteur - 1] = {valeur:undefined, type:undefined, operateur:undefined};
            this.recherche.expressionRecherche.pop();
            this.compteur -= 1;
            this.onOpen();
          }
        })
      );
    
    new Setting(champRecherche)
      .addDropdown((typeRechercheChamp) => {
        typeRecherche.forEach((value, key) => {
        typeRechercheChamp.addOption(key, value)
        typeRechercheChamp.onChange((value) =>
          this.recherche.expressionRecherche[instanceCount].type = value
        )});
        })
      .addDropdown((operateur) => {
        operateursRecherche.forEach((value, key) => {
          operateur.addOption(key, value)
          operateur.onChange((value) =>
            this.recherche.expressionRecherche[instanceCount].operateur = value
          )
        })
      });
  }

  async onOpen() {
    this.recherche.fond = codeFond.keys().next().value;
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h4", { text: "Légifrance Intégration" });

    const fond = container.createEl("div");


    new Setting(fond)
      .setName("Fond :")
      .addDropdown((fondSelected) => {
        codeFond.forEach((value, key) => {
          fondSelected.addOption(key, value)
        });
        fondSelected.onChange(() => {
          this.recherche.fond = fondSelected.getValue();
        })
      })


    const valuesRecherche = container.createEl("div");
    valuesRecherche.createEl("br");

    for (let i = 1 ; i <= this.compteur ; i++){
      this.recherche.expressionRecherche.push({valeur:"", type:typeRecherche.keys().next().value, operateur:operateursRecherche.keys().next().value})
      this.newExpression(valuesRecherche, i);
    }
    
		new Setting(valuesRecherche)
			.addButton((btn) =>
				btn
					.setButtonText("Valider")
					.setCta()
					.onClick(async () => {
            // this.dicRecherche = await this.agentChercheur.searchText(this.valeurRecherche, this.fond, this.settings.maxResults);
            // new MontrerResultatsModal(this.app, this.settings, this.dicRecherche, this.valeurRecherche, // this.agentChercheur).open();
            new Notice(this.recherche.fond + " " + this.recherche.expressionRecherche[1].operateur);
					}));

  }

  async onClose() {
    // Nothing to clean up.
  }
}