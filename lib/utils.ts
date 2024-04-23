import { Setting } from "obsidian";
import { codeFond, operateursRecherche } from "api/constants";

export function fondField(view:any, fond:HTMLElement) {

    new Setting(fond)
      .setName("Fond : ")
      .addDropdown((fondSelected) => {
        codeFond.forEach((value, key) => {
          fondSelected.addOption(key, value)
        });
        fondSelected.onChange(() => {
          view.recherche.fond = fondSelected.getValue();
        })
      })

    new Setting(fond)
      .setName("Opérateur général : ")
      .addDropdown((opeGen) => {
        operateursRecherche.forEach((value, key) => {
          opeGen.addOption(key, value)
        })
        opeGen.onChange(() => {
          view.recherche.recherche.operateur = opeGen.getValue();
        })
        opeGen.setValue(view.recherche.recherche.champs[0].operateur)
      })
  }