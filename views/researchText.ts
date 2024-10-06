import { ItemView, WorkspaceLeaf, Setting, Notice } from "obsidian";
import { typeRecherche, operateursRecherche, codeLegalStatute, criteresTriGeneraux } from "api/constants";
import { agentSearch } from "api/utilities";
import { champsRechercheAvancees } from "abstracts/searches";
import { creerUneNouvelleNote } from "lib/utils";
import { MontrerResultatsModal } from "modals/ShowModal";
import LegifrancePlugin from "main";
import { textReaderView } from "./viewText";
import { documentHandlerView, resultatsRecherche } from "abstracts/searches";
import { WaitModal } from "modals/WaitModal";
import { dateHandler } from "lib/dateHandler";
import { newExpression, fondField } from "lib/searchUtils";
import { deleteDocEntry } from "./viewsData";
import { documentsListe, getDocumentsListe } from "globals/globals";

export const RESEARCH_TEXT_VIEW = "research-text-view";

export class ResearchTextView extends ItemView {
  documentFields:documentHandlerView;
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
  activeViewLeaf:textReaderView | null;

  constructor(plugin:LegifrancePlugin, leaf: WorkspaceLeaf, agentChercheur:agentSearch) {
    super(leaf);
    this.compteur = 0;
    this.agentChercheur = agentChercheur;
    this.plugin = plugin;
    this.dateRecherche = new dateHandler(this);
    this.documentFields = new documentHandlerView(this);
    // this.initSearch();
  }

  getViewType() {
    return RESEARCH_TEXT_VIEW;
  }

  getDisplayText() {
    return "Légifrance";
  }

  setActiveViewText(view:textReaderView) {
    this.activeViewLeaf = view;
    return this.activeViewLeaf;
  }

  deleteActiveViewText() {
    this.activeViewLeaf = null;
  }


  researchTypeButtons(container:Element) {

    const headerDiv = container.createDiv(); // creating header part
    // Header setting, always shown.

    new Setting(headerDiv) 
      .addButton(cb => {
        cb.setButtonText("Recherche simple")
        if (this.activeResearchType == "simple") cb.setDisabled(true);
        cb.onClick(() => {
          this.simpleSearchEngine();
          this.onOpen();

        })
      })
      .addButton(cb => {
        cb.setButtonText("Recherche avancée")
        if (this.activeResearchType == "advance") cb.setDisabled(true);     
        cb.onClick(() => {
          this.advancedSearchEngine();
          this.onOpen();
        })
      })
  }

  async onOpen() { // initializing the view
    const baseContainer = this.containerEl.children[1];
    baseContainer.empty(); // making sure the view is refreshed everytime the function is called.

    const container = baseContainer.createDiv()
    container.style.maxWidth = "800px";
    container.style.width = "100%";
    container.style.margin = "auto"

    this.researchTypeButtons(container);

    this.rechercheDiv = container.createDiv(); // search div - alternating between simple or complex search

    if (this.activeResearchType == "simple") {
      this.simpleSearchEngine();
    }
    else if (this.activeResearchType == "advance") {
      this.advancedSearchEngine();
    }

    this.listResults = container.createDiv();
    const historiqueContainer = container.createDiv();
    this.historiqueView(historiqueContainer);

    if (this.activeViewLeaf && documentsListe.length > 0) {
      creerUneNouvelleNote(this.activeViewLeaf, this.listResults);
    }  
  }

  openViewText(id:string) {
    this.plugin.activateTextReaderView();
  }

  async onClose() {
    // Nothing to clean up.
  }

  advancedSearchEngine() {
    this.rechercheDiv.empty();
    this.activeResearchType = "advance";

    const fond = this.rechercheDiv.createEl("div");  
    fondField(this, fond);

    if (this.documentFields.fond == "") return;

    if (this.documentFields.fond != "ALL") {
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
            this.documentFields.updatePageNumber(1);
            await this.documentFields.launchSearch();
          }));

  }

  simpleSearchEngine() {
    this.rechercheDiv.empty();
    this.activeResearchType = "simple";
    this.compteur = 0;

    fondField(this, this.rechercheDiv);

    if (this.documentFields.fond == "") return;

    if (this.documentFields.recherche.champs.length <= 0) {
      this.documentFields.recherche.champs[0].criteres.push({
        valeur: "", 
        typeRecherche:typeRecherche.keys().next().value, 
        proximite: 2,
        operateur:operateursRecherche.keys().next().value
      });
    }

    if (this.documentFields.fond != "ALL" && this.documentFields.fond != "CODE_ETAT" && this.documentFields.fond != "CNIL" && this.documentFields.fond != "") {
      const dateDebut = new Setting(this.rechercheDiv).setName("Date de début");
      this.dateRecherche.champDate(dateDebut, "start");
  
      const dateFin = new Setting(this.rechercheDiv).setName("Date de fin");
      this.dateRecherche.champDate(dateFin, "end");
    }

    new Setting(this.rechercheDiv)
      .setName("Recherche")
      .addText((text) =>
        text
          .setValue(this.documentFields.recherche.champs[0].criteres[0].valeur)
          .onChange(() => {
            this.documentFields.recherche.champs[0].criteres[0].valeur = text.getValue();
            // // console.log(this.documentFields.recherche.champs[0].criteres[0].valeur)
              })
            .inputEl.addEventListener('keypress', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault(); // Prevent default form submission
                this.documentFields.updatePageNumber(1);
                this.documentFields.launchSearch(); // Call search function
                this.onOpen();
              }
            }));
    

    new Setting(this.rechercheDiv)
      .addDropdown((typeRechercheChamp) => {
        typeRecherche.forEach((value, key) => {
          typeRechercheChamp.addOption(key, value)
        });
        typeRechercheChamp.onChange((value) => {
          this.documentFields.updateTypeRechercheChamp(0, 0, value);
        })
        
        })
        .addDropdown((operateur) => {
          operateursRecherche.forEach((value, key) => {
            operateur.addOption(key, value)
          });

          operateur.onChange((value) => {
            this.documentFields.criteresTri.operateur = value;
            // console.log(this.documentFields.criteresTri.operateur);
          })
        })
  
      new Setting(this.rechercheDiv)
        .addButton((btn) => {
          btn
          .setButtonText("Valider")
          .setCta()
          .onClick(async () => {
            this.documentFields.updatePageNumber(1);
            await this.documentFields.launchSearch();
            this.onOpen();
          })
        
          if (this.documentFields.fond == "") {
            btn.removeCta();
            btn.setDisabled(true);
          }
        });

  }

  historiqueView(container:HTMLElement) {
    const pluginInstance = LegifrancePlugin.instance;
    let value:string = "-1";
    container.createEl("h5", {text: "Historique"});

    if (getDocumentsListe().length == 0) container.createEl("p", {text: "Rien à afficher. Et si vous faisiez une recherche ?"});

      for (let doc of getDocumentsListe()) {
        new Setting(container)
          .setName(doc.data.id)
          .setDesc(`${doc.data.titre}`)
          .addExtraButton(cb => cb 
            .setIcon('external-link')
            .onClick(() => {
              pluginInstance.tabViewIdToShow = doc.id;
              doc.status = true;
              pluginInstance.activateTextReaderView();
              this.onOpen();
            })
          )
          .addExtraButton(cb => cb
            .setIcon('x')
            .onClick(() => {
              deleteDocEntry(doc.id);
              this.plugin.saveSettings();
              this.onOpen();
              // // console.log(documentsListe.length);
              this.plugin.instancesOfDocumentViews -= 1;
            })
          )
      }    
  }
}  
