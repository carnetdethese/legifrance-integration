import { Setting } from "obsidian";
import { textReaderView } from "views/viewText";
import { dateFormat } from "./dateHandler";


export function ajoutBouton(view:textReaderView, element:HTMLElement) {
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
                .setValue(ficheArretChamp[property] as string)
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

}

export async function creerUneNouvelleNote(view:textReaderView, header:HTMLElement) {    
  header.createEl("h4", { text: "Créer une note de jurisprudence"});
  header.createEl("p", {text: view.document.data.titre});
      
  new Setting(header)
    .setName("Titre")
    .addText(cb => {
      cb.setPlaceholder(view.document.data.id)

      if (view.document.data.titreNote) {
        cb.setPlaceholder(view.document.data.titreNote)
      }

      cb.onChange((value) => {
        view.document.data.titreNote = value;
      })}
    )
    
  
  new Setting(header)
    .setName("Contribution")
    .addTextArea(cb => cb
      .setValue(view.document.data.contributionNote || "")
      .onChange((value) => {
        view.document.data.contributionNote = value;
      })
    )
  
  ajoutBouton(view, header);
  
  new Setting(header)
    .addButton(cb => cb
      .setCta()
      .setButtonText("Créer la note")
      .onClick(async (evt: MouseEvent) => {
        await view.nouvelleNote.createNote();
      })
    )
    
  }


export function startDateBeforeEndDate(start:dateFormat, end:dateFormat) {
  const startDate = new Date(start.toString());
  const endDate = new Date(end.toString());

  if (startDate < endDate) {
      return true;  
  } else if (startDate > endDate) {
      return false;
  } else {
      return true;
  }
}


export function getTodaysDate() {
  const padZero = (num: number, pad: number) => num.toString().padStart(pad, '0');
  let date = new Date();
  const todaysDate = new dateFormat(date.getFullYear().toString(), date.getMonth().toString(), date.getDate().toString());
  return todaysDate.toString();
}