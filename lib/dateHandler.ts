import { dateJour, dateMois, dateAnnee } from "api/constants";
import { champDate } from "abstracts/searches";
import { Setting, Notice, DropdownComponent } from "obsidian";
import { ResearchTextView } from "views/researchText";

export class dateFormat {
    annee:string;
    mois:string;
    jour:string;

    constructor(annee?:string, mois?:string, jour?:string) {
        if (annee && mois && jour) {
            this.annee = annee;
            this.mois = mois;
            this.jour = jour;
        }
        else {
            this.annee = dateAnnee.keys().next().value as string || "";
            this.mois = dateMois.keys().next().value as string || "";
            this.jour = dateJour.keys().next().value as string || "";
        }
    }

    toString():string {
        if (!this.annee && !this.mois && !this.jour) {
            return '';
        }
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
       (dateObj[field] as string) = valeur.padStart(2, '0');

        if (!dateObj.annee && champ != "annee") new Notice("Veuillez définir une année de début.");

        if (champ == "annee" && (!dateObj.mois || !dateObj.jour)) {
            if (!dateObj.jour) {
                dateObj.jour = "01"; this.dropdownRef.get(`${type}jour`)?.setValue("1");
            }
            if (!dateObj.mois) {
                dateObj.mois = "01"; this.dropdownRef.get(`${type}mois`)?.setValue("1");
            }
        }

        if (!dateObj.annee && champ == "annee") {
            dateObj.jour = "";
            dateObj.mois = "";
            this.dropdownRef.get(`${type}jour`)?.setValue("");
            this.dropdownRef.get(`${type}mois`)?.setValue("");
        };

        if (this.researchViewMod.document.recherche.filtres[0]) {
            this.researchViewMod.document.recherche.filtres[0].dates[type as keyof champDate] = dateObj;
        }
    }


    handleDateChange(valeur:string, champ:string, type:string) {
        if (type == "start") {
            this.updateDate(this.start, champ, valeur, type)
        }
        else if (type == "end") {
            this.updateDate(this.end, champ, valeur, type)
        }
    }

    createDropdown(setting: Setting, options: Map<string, string>, type:string, champ:string, onChangeCallback: (value: string) => void) {        
        const id = `${type}${champ}`;

        setting.addDropdown((valeurDate) => {
            const dropdown = valeurDate;
            options.forEach((value, key) => {
              valeurDate.addOption(key, value)
            });
            valeurDate
                .onChange(onChangeCallback)
                .setValue(this.researchViewMod.document.recherche.filtres[0].dates[type as keyof champDate] as string);
            this.dropdownRef.set(id, dropdown);
          });
    }

    champDate(setting:Setting, type:string) {
        this.createDropdown(setting, dateJour, type, 'jour', (value: string) => {
            this.handleDateChange(value, "jour", type);
        });

        this.createDropdown(setting, dateMois, type, 'mois', (value: string) => {
            this.handleDateChange(value, "mois", type);
        });

        this.createDropdown(setting, dateAnnee, type, 'annee', (value: string) => {
            this.handleDateChange(value, "annee", type);
        });

    }
}