import { Setting } from "obsidian";
import * as constants from "api/constants"
import { ResearchTextView } from "views/researchText";
import LegifrancePlugin from "main";


export function fondField(view:ResearchTextView, fond:HTMLElement) {
  const pluginInstance = LegifrancePlugin.instance;
  let codesFond = new Map<string, string>;

  if (pluginInstance.settings.fondSupp) codesFond = constants.codeFondBeta;
  
  else codesFond = constants.codeFond;

    new Setting(fond)
      .setName("Fond : ")
      .addDropdown((fondSelected) => {
        codesFond.forEach((value, key) => {
          fondSelected.addOption(key, value)
        });
        fondSelected
          .onChange(() => {
          view.documentFields.updatingFond(fondSelected.getValue());
          // // console.log(view.documentFields.recherche);
          fondSelected.setValue(view.documentFields.fond);
        })
          .setValue(view.documentFields.fond)
      })

    if (view.documentFields.fond == "") return;
    if (view.activeResearchType == "simple") return;

    new Setting(fond)
      .setName("Opérateur général : ")
      .addDropdown((opeGen) => {
        constants.operateursRecherche.forEach((value, key) => {
          opeGen.addOption(key, value)
        })
        opeGen.onChange(() => {
          view.documentFields.recherche.operateur = opeGen.getValue();
        })
        opeGen.setValue(view.documentFields.recherche.champs[0].operateur as string)
      })
  }

export function newExpression(view:ResearchTextView, container:HTMLElement, id:number) {
    // incrementing number of fields and keeping count.
    const instanceCount = id + 1;
    if (view.compteur > 5 || view.compteur < 0) {
      return
    }

    // building the fields. 
    new Setting(container)
      .setName("Champ " + instanceCount)
      .addText((text) =>
        text.onChange((value) => {
          view.documentFields.recherche.champs[0].criteres[id].valeur = value
          })
        .setValue(view.documentFields.recherche.champs[0].criteres[id].valeur || "")
        .inputEl.addEventListener('keypress', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission
            view.documentFields.launchSearch(); // Call the search function
            view.onOpen();
          }
        }))        
      .addButton(cb => cb
        .setIcon("plus")
        .onClick(() => {
          if (view.compteur < 2 ) {
            view.compteur += 1;
            view.documentFields.createCritere(0);
            newExpression(view, container, view.compteur);
            view.onOpen();
          }
      }))
      .addButton(cb => cb
        .setIcon("minus")
        .onClick(() => {
          if (view.compteur > 0) {
            view.documentFields.deleteCritere(0, view.compteur);
            view.compteur -= 1;
            newExpression(view, container, view.compteur);
            view.onOpen();
          }
        })
      );
  
    new Setting(container)
      .addDropdown((typeRechercheChamp) => {
        constants.typeRecherche.forEach((value, key) => {
          typeRechercheChamp
           .addOption(key, value)
          typeRechercheChamp.onChange((value) =>
            view.documentFields.updateTypeRechercheChamp(0, id, value)
          )});
        typeRechercheChamp.setValue(view.documentFields.getTypeRechercheChamp(0, id));
        })
      .addDropdown((operateur) => {
        constants.operateursRecherche.forEach((value, key) => {
          operateur.addOption(key, value)
          operateur.onChange((value) =>
            view.documentFields.recherche.champs[0].criteres[id].operateur = value
          )
        })
      });
  }