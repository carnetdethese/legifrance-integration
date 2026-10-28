/** Date en trois parties (année, mois, jour) telle que l'API de recherche la demande et que le sélecteur de date la saisit. */
import { dateJour, dateMois, dateAnnee } from "api/constants";

export class DateFormat {
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
