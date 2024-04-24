import { codeFond, operateursRecherche } from "api/constants";
import { Setting } from "obsidian";
import { textReaderView } from "views/viewText";

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



function ajoutBouton(view:textReaderView, element:HTMLElement) {
  const ficheArretChamp = view.nouvelleNote.champFiche;
  // Loop through each property of FicheArretChamp interface
  for (const property in ficheArretChamp) {
      if (Object.prototype.hasOwnProperty.call(ficheArretChamp, property)) {
          const value = ficheArretChamp[property];
          const newField = new Setting(element).setName(property[0].toUpperCase() + property.slice(1))

          if (!value) {
                      // Dynamically add fields for each property
            newField.addExtraButton(cb => cb
              .setIcon('plus') // Set initial value
              .onClick(async () => {
                // Update the property value when the field changes
                ficheArretChamp[property] = " ";
                await view.onOpen();
            }));
          }
          else {
            newField
              .addTextArea(cb => cb
                .setValue(ficheArretChamp[property])
                .onChange(value => {
                  ficheArretChamp[property] = value;
                })
              )
              .addExtraButton(cb => cb
                .setIcon('minus')
                .onClick(async () => {
                  ficheArretChamp[property] = "";
                  await view.onOpen();
                })
            )
          }
      }
  }

  // if (ficheArretChamp == "") {
  //   element.addExtraButton(cb => cb
  //     .setIcon("plus")
  //     .onClick(async () => {
  //       champ = "Fait";
  //       await view.onOpen();
  //     }))
  // }
  // else {
  //   element
  //     .addTextArea(cb => cb
  //       .setPlaceholder(champ || "")
  //     )
  //     .addExtraButton(cb => cb
  //       .setIcon('minus')
  //       .onClick(async () => {
  //         champ = "";
  //         await view.onOpen();
  //       })
  //     );
  // }
}

export function creerUneNouvelleNote(view:textReaderView, header:HTMLElement) {
  const champFicheString = view.nouvelleNote.champFiche;
  console.log(champFicheString);
  
  header.createEl("h4", { text: "Créer une note de jurisprudence"})
    
  new Setting(header)
    .setName("Titre")
    .addText(cb => cb
      .setPlaceholder(view.decision.id))

  new Setting(header)
    .setName("Contribution")
    .addTextArea(cb => cb)


  ajoutBouton(view, header);

  new Setting(header)
    .addButton(cb => cb
      .setCta()
      .setButtonText("Créer la note")
      .onClick(async (evt: MouseEvent) => {
        console.log(await view.nouvelleNote.createNote())
        // await view.nouvelleNote.createNote();
      })
    )
}