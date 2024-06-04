import { ItemView, WorkspaceLeaf, Setting, Notice } from "obsidian";
import { typeRecherche, operateursRecherche } from "api/constants";
import { agentSearch } from "api/utilities";
import { champsRechercheAvancees } from "abstracts/searches";
import { creerUneNouvelleNote } from "lib/utils";
import { MontrerResultatsModal } from "modals/ShowModal";
import LegifrancePlugin from "main";
import { textReaderView } from "./viewText";
import { documentHandler, resultatsRecherche } from "abstracts/searches";
import { WaitModal } from "modals/WaitModal";
import { dateHandler } from "lib/dateHandler";
import { newExpression, fondField } from "lib/searchUtils";

export const RESEARCH_TEXT_VIEW = "research-text-view";

export class ResearchTextView extends ItemView {
  document:documentHandler;
  dateRecherche: dateHandler;
  recherche:champsRechercheAvancees;
  compteur:number;
  agentChercheur:agentSearch;
  searchResult:resultatsRecherche;
  activeResearchType:string;
  headerDiv:HTMLElement;
  listResults:HTMLElement;
  rechercheDiv:HTMLElement;
  valeurRecherche:string;
  plugin:LegifrancePlugin;
  activeViewLeaf:textReaderView;

  constructor(plugin:LegifrancePlugin, leaf: WorkspaceLeaf, agentChercheur:agentSearch) {
    super(leaf);
    this.compteur = 0;
    this.agentChercheur = agentChercheur;
    this.plugin = plugin;
    this.dateRecherche = new dateHandler(this);
    this.document = new documentHandler(this.app, this);
    // this.initSearch();
  }

  getViewType() {
    return RESEARCH_TEXT_VIEW;
  }

  getDisplayText() {
    return "Légifrance";
  }


  showActiveViewTextInfo() {
    console.log(this.activeViewLeaf);
  }

  setActiveViewText(view:textReaderView) {
    this.activeViewLeaf = view;
    return this.activeViewLeaf;
  }

  async onOpen() { // initializing the view
    const container = this.containerEl.children[1];
    container.empty(); // making sure nothing the view is refreshed everytime the function is called.

    this.headerDiv = container.createDiv(); // creating header part
    this.rechercheDiv = container.createDiv(); // search div - alternating between simple or complex search

    // Header setting, always shown.
    new Setting(this.headerDiv) 
      .addButton(cb => cb 
        .setButtonText("Recherche simple")
        .onClick(() => {
          if (this.activeResearchType != 'simple') {
            this.onOpen();
            this.simpleSearchEngine();
          }
        })
      )
      .addButton(cb => cb
        .setButtonText("Recherche avancée")
        .onClick(() => {
          if (this.activeResearchType != "advance") {
            this.onOpen();
            this.advancedSearchEngine();
          }
        })
      )

      if (this.activeResearchType == "simple") {
        this.simpleSearchEngine();
      }
      else if (this.activeResearchType == "advance") {
        this.advancedSearchEngine();
      }

      this.listResults = container.createDiv();

      if (this.activeViewLeaf) {
        creerUneNouvelleNote(this.activeViewLeaf, this.listResults);
      }  
  }

  async onClose() {
    // Nothing to clean up.
  }

  advancedSearchEngine() {
    this.rechercheDiv.empty();
    this.activeResearchType = "advance";

    const fond = this.rechercheDiv.createEl("div");  
    fondField(this, fond);

    if (this.document.fond != "ALL") {
      const dateDebut = new Setting(this.rechercheDiv).setName("Date de début");
      this.dateRecherche.champDate(dateDebut, "start");
  
      const dateFin = new Setting(this.rechercheDiv).setName("Date de fin");
      this.dateRecherche.champDate(dateFin, "end");
    }

    const valuesRecherche = this.rechercheDiv.createEl("div");

    for (let i = 0 ; i <= this.compteur ; i++){
      newExpression(this, valuesRecherche, i);
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
    this.compteur = 0;

    fondField(this, this.rechercheDiv);

    if (this.document.recherche.champs.length <= 0) {
      this.document.recherche.champs[0].criteres.push({
        valeur: "", 
        typeRecherche:typeRecherche.keys().next().value, 
        proximite: 2,
        operateur:operateursRecherche.keys().next().value
      });
    }

    if (this.document.fond != "ALL") {

      const dateDebut = new Setting(this.rechercheDiv).setName("Date de début");
      this.dateRecherche.champDate(dateDebut, "start");
  
      const dateFin = new Setting(this.rechercheDiv).setName("Date de fin");
      this.dateRecherche.champDate(dateFin, "end");
    }

    new Setting(this.rechercheDiv)
      .setName("Recherche")
      .addText((text) =>
        text.onChange((value) => {
        this.document.recherche.champs[0].criteres[0].valeur = value
          })
        .setValue(this.document.recherche.champs[0].criteres[0].valeur || ""))
    
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
              this.onOpen();
            }));


      new Setting(this.rechercheDiv)
          .addButton((btn) => btn
            .setButtonText("Debug")
            .setCta()
            .onClick(() => this.document.showSearch())
          );
  }

  async launchSearch() {
    let check = await this.document.checkBeforeSearch();
    if (check == 'false') return;

    console.log(check);

    const waitingModal = new WaitModal(this.app);
    waitingModal.open();

    try {
      this.searchResult = await this.agentChercheur.advanceSearchText(this.document.toObject()) as resultatsRecherche;
      console.log(this.searchResult);

      for (const elt of this.document.recherche.champs[0].criteres){
          this.valeurRecherche += elt.valeur;
      }

      new MontrerResultatsModal(this.app, this.plugin, this.searchResult, this.valeurRecherche, this.agentChercheur, false).open();
    } catch (error) {
        console.error('Error performing search:', error);
        new Notice('Une erreur est survenue durant la requête. Veuillez vérifier vos identifiants et réessayer.');
    } finally {
        waitingModal.close();
    }
  }

}  
