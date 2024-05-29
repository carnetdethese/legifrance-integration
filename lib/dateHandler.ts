import { dateJour, dateMois, dateAnnee } from "api/constants";
import { champDate } from "api/utilities";
import { PopUpModal } from "modals/popUp";
import { Setting, Notice, DropdownComponent } from "obsidian";
import { ResearchTextView } from "views/researchText";

class dateFormat {
    annee:string;
    mois:string;
    jour:string;

    constructor() {
        this.annee = dateAnnee.keys().next().value || "",
        this.mois = dateMois.keys().next().value || "",
        this.jour = dateJour.keys().next().value || ""
    }

    toString():string {
        return `${this.annee}-${this.mois.padStart(2, '0')}-${this.jour.padStart(2, '0')}`
    }
}

// Classe qui permet d'assurer la manipulation de la date. 

export class dateHandler {
    // Définitions des variables permettant de stocker la valeur de la date selectionnée.
    start: dateFormat;
    end: dateFormat;
    researchViewMod:ResearchTextView; // Référence à la vue de recherche pour accéder à la valeur de la date et la mettre à jour.
    dropdownRef: Map<string, DropdownComponent>;

    constructor(researchView:ResearchTextView) {
        this.researchViewMod = researchView;
        this.start = new dateFormat();
        this.end = new dateFormat();
        this.dropdownRef = new Map();
    }

    updateDate(dateObj: dateFormat, champ:string, valeur:string, type:string) {
        let field = champ.toLowerCase() as keyof dateFormat;
       (dateObj[field] as string) = valeur;

        if (!dateObj.annee && champ != "annee") new Notice("Veuillez définir une année de début.");

        if (champ == "annee" && (!dateObj.mois || !dateObj.jour)) {
            if (!dateObj.jour) {
                dateObj.jour = "1"; this.dropdownRef.get(`${type}jour`)?.setValue("1");
            }
            if (!dateObj.mois) {
                dateObj.mois = "1"; this.dropdownRef.get(`${type}mois`)?.setValue("1");
            }
        }

        if (!dateObj.annee && champ == "annee") {
            dateObj.jour = "";
            dateObj.mois = "";
            this.dropdownRef.get(`${type}jour`)?.setValue("");
            this.dropdownRef.get(`${type}mois`)?.setValue("");
        };

        this.researchViewMod.recherche.recherche.filtres[0].dates[type as keyof champDate] = dateObj.toString();
    }


    handleDateChange(valeur:string, champ:string, type:string) {
        if (type == "start") {
            this.updateDate(this.start, champ, valeur, type)
        }
        else if (type == "end") {
            this.updateDate(this.end, champ, valeur, type)
        }
    }

    createDropdown(setting: Setting, options: Map<string, string>, id:string, onChangeCallback: (value: string) => void) {
        setting.addDropdown((valeurDate) => {
            const dropdown = valeurDate;
            options.forEach((value, key) => {
              valeurDate.addOption(key, value)
            });
            valeurDate.onChange(onChangeCallback);
            this.dropdownRef.set(id, dropdown);
          });
    }

    champDate(setting:Setting, type:string) {
        this.createDropdown(setting, dateJour, `${type}jour`, (value: string) => {
        this.handleDateChange(value, "jour", type);
        });

        this.createDropdown(setting, dateMois, `${type}mois`, (value: string) => {
        this.handleDateChange(value, "mois", type);
        });

        this.createDropdown(setting, dateAnnee, `${type}annee`, (value: string) => {
        this.handleDateChange(value, "annee", type);
        });

    }
}