import { ItemView, WorkspaceLeaf, Setting } from "obsidian";
import { codeFond, typeRecherche, operateursRecherche, critereTri } from "api/constants";
import { agentSearch, expressionRechercheForm, rechercheAvStructure } from "api/utilities";
import { fondField } from "lib/utils";
import { MontrerResultatsModal, resultsRequest } from "modals/ShowModal";
import { LegifranceSettings } from "main";

export const RESEARCH_TEXT_VIEW = "research-text-view";

export class LegalTextView extends ItemView {
  recherche:rechercheAvStructure;
  valeursRecherche:expressionRechercheForm[];
  compteur:number;
  nbChamps:number;
  agentChercheur:agentSearch;
  searchResult:resultsRequest;
  activeResearchType:string;
  headerDiv:HTMLElement;
  rechercheDiv:HTMLElement;
  settings:LegifranceSettings;
  valeurRecherche:string;


  constructor(leaf: WorkspaceLeaf, settings:LegifranceSettings, agentChercheur:agentSearch) {
    super(leaf);
    this.compteur = 0;
    this.agentChercheur = agentChercheur;
    this.settings = settings;
    this.initSearch();
  }

  getViewType() {
    return RESEARCH_TEXT_VIEW;
  }

  getDisplayText() {
    return "Légifrance";
  }

  async onOpen() { // initializing the view 
    const container = this.containerEl.children[1];
    container.empty(); // making sure nothing the view is refreshed everytime the function is called.

    this.headerDiv = container.createDiv(); // creating header part
    this.rechercheDiv = container.createDiv(); // search div - alternating between simple or complex search

    if (this.activeResearchType == "advance") { // if user has already clicked on advance, making sure it is still shown after a reclick.
      this.advancedSearchEngine();
    }
    else if (this.activeResearchType == "simple") { // idem, with simple
      this.simpleSearchEngine();
    }


    // Header setting, always shown.
    new Setting(this.headerDiv) 
      .addButton(cb => cb 
        .setButtonText("Recherche simple")
        .onClick(() => {
          if (this.activeResearchType != 'simple') {
            this.simpleSearchEngine();
          }
        })
      )
      .addButton(cb => cb
        .setButtonText("Recherche avancée")
        .onClick(() => {
          if (this.activeResearchType != "advance") {
            this.advancedSearchEngine();
          }
        })
      )
  
  }

  async onClose() {
    // Nothing to clean up.
  }

  // When user clicks on the "plus" or "minus" button, show or delete a field of search.
  newExpression(container:HTMLElement, id:number) {

    // incrementing number of fields and keeping count.
    const instanceCount = id + 1;
    if (this.compteur > 5 || this.compteur < 0) {
      return
    }

    // building the fields. 
    new Setting(container)
      .setName("Champ " + instanceCount)
      .addText((text) =>
        text.onChange((value) => {
          this.recherche.recherche.champs[0].criteres[id].valeur = value
          })
        .setValue(this.recherche.recherche.champs[0].criteres[id].valeur || ""))
      .addButton(cb => cb
        .setIcon("plus")
        .onClick(() => {
          if (this.compteur < 4 ) {
            this.compteur += 1;
             this.recherche.recherche.champs[0].criteres.push({
               valeur:"", 
               typeRecherche:typeRecherche.keys().next().value, 
               operateur:operateursRecherche.keys().next().value,
               proximite: 2
             });
            this.newExpression(container, this.compteur);
            this.onOpen();
          }
      }))
      .addButton(cb => cb
        .setIcon("minus")
        .onClick(() => {
          if (this.compteur > 0) {
            this.recherche.recherche.champs[0].criteres.pop();
            this.compteur -= 1;
            this.newExpression(container, this.compteur);
            this.onOpen();
          }
        })
      );
    
    new Setting(container)
      .addDropdown((typeRechercheChamp) => {
        typeRecherche.forEach((value, key) => {
        typeRechercheChamp.addOption(key, value)
        typeRechercheChamp.onChange((value) =>
          this.recherche.recherche.champs[0].criteres[id].typeRecherche = value
        )});
        })
      .addDropdown((operateur) => {
        operateursRecherche.forEach((value, key) => {
          operateur.addOption(key, value)
          operateur.onChange((value) =>
            this.recherche.recherche.champs[0].criteres[id].operateur = value
          )
        })
      });
  }

  advancedSearchEngine() {
    this.rechercheDiv.empty();
    this.activeResearchType = "advance";

    const fond = this.rechercheDiv.createEl("div");  
    fondField(this, fond);
  
    const valuesRecherche = this.rechercheDiv.createEl("div");

    for (let i = 0 ; i <= this.compteur ; i++){
      this.newExpression(valuesRecherche, i);
    }
  
    new Setting(valuesRecherche)
      .addButton((btn) =>
        btn
          .setButtonText("Valider")
          .setCta()
          .onClick(async () => {
            await this.launchSearch();
          }));

  }

  simpleSearchEngine() { 
    this.rechercheDiv.empty();
    this.activeResearchType = "simple";
    this.initSearch();

    fondField(this, this.rechercheDiv);
      
    if (this.recherche.recherche.champs.length <= 0) {
      this.recherche.recherche.champs[0].criteres.push({
        valeur: "", 
        typeRecherche:typeRecherche.keys().next().value, 
        proximite: 2,
        operateur:operateursRecherche.keys().next().value
      });
    }

    new Setting(this.rechercheDiv)
      .setName("Recherche")
      .addText((text) =>
        text.onChange((value) => {
        this.recherche.recherche.champs[0].criteres[0].valeur = value
          })
        .setValue(this.recherche.recherche.champs[0].criteres[0].valeur || ""))
    
    new Setting(this.rechercheDiv)
      .addDropdown((typeRechercheChamp) => {
        typeRecherche.forEach((value, key) => {
          typeRechercheChamp.addOption(key, value)
        });			
        })
        .addDropdown((operateur) => {
          operateursRecherche.forEach((value, key) => {
            operateur.addOption(key, value)
          });
        })
  
      new Setting(this.rechercheDiv)
        .addButton((btn) =>
          btn
            .setButtonText("Valider")
            .setCta()
            .onClick(async () => {
              await this.launchSearch();
            }));
  }

  async launchSearch() {
    console.log(this.recherche);
    this.searchResult = await this.agentChercheur.advanceSearchText(this.recherche);
    console.log(this.searchResult);

    for (const elt of this.recherche.recherche.champs[0].criteres){
      this.valeurRecherche += elt.valeur;
    }

    new MontrerResultatsModal(this.app, this.settings, this.searchResult, this.valeurRecherche, this.agentChercheur).open();

    console.log(this.recherche);
  }

  initSearch() {
    this.recherche = {
      recherche: {
        pageSize: this.settings.maxResults,
        sort: critereTri.keys().next().value,
        // operateur: operateursRecherche.keys().next().value,
        typePagination: "DEFAUT",
        pageNumber: 1,
        champs: [{
          typeChamp: "ALL",
          operateur: operateursRecherche.keys().next().value,
          criteres: [{
            valeur: "", 
            typeRecherche:typeRecherche.keys().next().value, 
            proximite: 2,
            operateur:operateursRecherche.keys().next().value
          }],
        }]
      },
      fond: codeFond.keys().next().value,
    }
      
  }


}