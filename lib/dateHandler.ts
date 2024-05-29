import { dateJour, dateMois, dateAnnee } from "api/constants";
import { Setting, Notice, DropdownComponent } from "obsidian";
import { ResearchTextView } from "views/researchText";

// Classe qui permet d'assurer la manipulation de la date. 

export class dateHandler {
    // Définitions des variables permettant de stocker la valeur de la date selectionnée.
    selectedDay: string;
    selectedMonth: string;
    selectedYear: string;
    start: string;
    end: string;
    researchViewMod:ResearchTextView; // Référence à la vue de recherche pour accéder à la valeur de la date et la mettre à jour.
    dropdownRef: Map<string, DropdownComponent>;

    constructor(researchView:ResearchTextView) {
        this.researchViewMod = researchView;
        this.selectedDay = dateJour.keys().next().value;
        this.selectedMonth = dateMois.keys().next().value;
        this.selectedYear = dateAnnee.keys().next().value;
        this.start = "";
        this.end = "";
        this.dropdownRef = new Map();
    }

    handleDateChange(valeur:string, champ:string, type:string) {
        let formattedDate;

        if (champ === "jour") {
            this.selectedDay = valeur;
        } else if (champ === "mois") {
            this.selectedMonth = valeur;
        } else if (champ === "annee") {
            this.selectedYear = valeur;
            if (!this.selectedDay) this.selectedDay = "01";
            if (!this.selectedMonth) this.selectedMonth = "01";
        }

        formattedDate = `${this.selectedYear}-${this.selectedMonth.padStart(2, '0')}-${this.selectedDay.padStart(2, '0')}`;

        if (type === "start") {
            this.researchViewMod.recherche.recherche.filtres[0].dates.start = formattedDate;
            if (!this.selectedYear) this.researchViewMod.recherche.recherche.filtres[0].dates.start = "";
        } else if (type === "end") {
            this.researchViewMod.recherche.recherche.filtres[0].dates.end = formattedDate;
            if (!this.selectedYear) this.researchViewMod.recherche.recherche.filtres[0].dates.end = "";
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
        this.createDropdown(setting, dateJour, `${type}Jour`, (value: string) => {
        this.selectedDay = value;
        this.handleDateChange(value, "jour", type);
        });

        this.createDropdown(setting, dateMois, `${type}Mois`, (value: string) => {
        this.selectedMonth = value;
        this.handleDateChange(value, "mois", type);
        });

        this.createDropdown(setting, dateAnnee, `${type}Annee`, (value: string) => {
        this.selectedYear = value;
        this.handleDateChange(value, "annee", type);
        });

    }
}