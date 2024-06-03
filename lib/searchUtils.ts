import { documentHandler } from "abstracts/searches";
import { Setting } from "obsidian";
import * as constants from "api/constants"
import { ResearchTextView } from "views/researchText";

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
          view.recherche.recherche.champs[0].criteres[id].valeur = value
          })
        .setValue(view.recherche.recherche.champs[0].criteres[id].valeur || ""))
      .addButton(cb => cb
        .setIcon("plus")
        .onClick(() => {
          if (view.compteur < 4 ) {
            view.compteur += 1;
             view.recherche.recherche.champs[0].criteres.push({
               valeur:"", 
               typeRecherche:constants.typeRecherche.keys().next().value, 
               operateur:constants.operateursRecherche.keys().next().value,
               proximite: 2
             });
            newExpression(view, container, view.compteur);
            view.onOpen();
          }
      }))
      .addButton(cb => cb
        .setIcon("minus")
        .onClick(() => {
          if (view.compteur > 0) {
            view.recherche.recherche.champs[0].criteres.pop();
            view.compteur -= 1;
            newExpression(view, container, view.compteur);
            view.onOpen();
          }
        })
      );
    
    new Setting(container)
      .addDropdown((typeRechercheChamp) => {
        constants.typeRecherche.forEach((value, key) => {
        typeRechercheChamp.addOption(key, value)
        typeRechercheChamp.onChange((value) =>
          view.recherche.recherche.champs[0].criteres[id].typeRecherche = value
        )});
        })
      .addDropdown((operateur) => {
        constants.operateursRecherche.forEach((value, key) => {
          operateur.addOption(key, value)
          operateur.onChange((value) =>
            view.recherche.recherche.champs[0].criteres[id].operateur = value
          )
        })
      });
  }
