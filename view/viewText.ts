import { ItemView, WorkspaceLeaf, Setting, Notice } from "obsidian";
import { codeFond, typeRecherche, operateursRecherche } from "api/constants";
import { agentSearch, expressionRechercheForm, RechercheForm } from "api/utilities";

export const LEGAL_TEXT_VIEW = "legal-text-view";

export class LegalTextView extends ItemView {
  recherche:RechercheForm;
  valeursRecherche:expressionRechercheForm[];
  compteur:number;
  nbChamps:number;
  agentChercheur:agentSearch;
  searchResult:object;

  constructor(leaf: WorkspaceLeaf, agentChercheur:agentSearch) {
    super(leaf);
    this.compteur = 1;
    this.recherche = {
      expressionRechercheForm: [],
      fond: "",
      operateurGeneral: operateursRecherche.keys().next().value
    }
    this.agentChercheur = agentChercheur;
  }

  getViewType() {
    return LEGAL_TEXT_VIEW;
  }

  getDisplayText() {
    return "Légifrance";
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
        this.recherche.expressionRechercheForm[instanceCount].valeur = value
          })
        .setValue(this.recherche.expressionRechercheForm[instanceCount].valeur || ""))
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
            this.recherche.expressionRechercheForm[this.compteur - 1] = {valeur:undefined, type:undefined, operateur:undefined};
            this.recherche.expressionRechercheForm.pop();
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
          this.recherche.expressionRechercheForm[instanceCount].type = value
        )});
        })
      .addDropdown((operateur) => {
        operateursRecherche.forEach((value, key) => {
          operateur.addOption(key, value)
          operateur.onChange((value) =>
            this.recherche.expressionRechercheForm[instanceCount].operateur = value
          )
        })
      });
  }

  searchEngine(container:Element) {

    this.recherche.fond = codeFond.keys().next().value;
    container.createEl("h4", { text: "Légifrance" });

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
      .addDropdown((opeGen) => {
        operateursRecherche.forEach((value, key) => {
          opeGen.addOption(key, value)
        })
        opeGen.onChange(() => {
          this.recherche.operateurGeneral = opeGen.getValue();
        })
        opeGen.setValue(this.recherche.operateurGeneral)
      })


    const valuesRecherche = container.createEl("div");
    valuesRecherche.createEl("br");

    for (let i = 1 ; i <= this.compteur ; i++){
      this.recherche.expressionRechercheForm.push({valeur:"", type:typeRecherche.keys().next().value, operateur:operateursRecherche.keys().next().value})
      this.newExpression(valuesRecherche, i);
    }

		new Setting(valuesRecherche)
			.addButton((btn) =>
				btn
					.setButtonText("Valider")
					.setCta()
					.onClick(async () => {
            // this.searchResult = await this.agentChercheur.searchText(this.valeursRecherche, this.fond, this.settings.maxResults);
            // new MontrerResultatsModal(this.app, this.settings, this.dicRecherche, this.valeurRecherche, // this.agentChercheur).open();
            new Notice(this.recherche.fond + " " + this.recherche.expressionRechercheForm[1].operateur);
					}));
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();

    this.searchEngine(container);

  }

  async onClose() {
    // Nothing to clean up.
  }
}