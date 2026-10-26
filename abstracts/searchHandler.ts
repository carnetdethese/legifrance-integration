import * as constants from "api/constants";
import { dateFormat } from "lib/dateHandler";
import { getTodaysDate, startDateBeforeEndDate } from "lib/utils";
import LegifrancePlugin from "main";
import { Notice } from "obsidian";
import { champsRechercheAvancees, resultatsRecherche } from "./searches";

/** Nombre maximal de critères par champ (limite côté interface comme côté recherche). */
export const MAX_CRITERES = 4;

/** Fonds pour lesquels aucun filtre de dates n'est applicable. */
const FONDS_SANS_FILTRE_DATE = ["ALL", "CODE_ETAT", "CNIL", "CIRC"];

/**
 * État d'une recherche (fond, critères, pagination, tri) tel qu'envoyé à l'API.
 *
 * Les méthodes avec `returnValue = true` renvoient une nouvelle instance
 * (`newObject`) afin que React détecte le changement d'état.
 */
export class documentSearchFieldsClass {
	recherche: champsRechercheAvancees; // Initialise l'objet qui contiendra les critères de recherche
	fond: string; // Définit le fond dans lequel sera effectué la recherche
	criteresTri: Record<string, string> = {}; // Contient les critères de tri en fonction du fond - voir la documentation de l'API.

	constructor() {
		// Lorsqu'on créé un nouvel objet de classe, une recherche vide est initialisée.
		// Le fond affecté est le premier sur la liste des fonds définit par une constante, ce qui correspond aussi à l'élément définit sur la vue de recherche.

		this.recherche = {
			filtres: [],
			pageSize: LegifrancePlugin.instance.settings.maxResults,
			sort: "",
			// operateur: operateursRecherche.keys().next().value,
			typePagination: "DEFAUT",
			pageNumber: 1,
			champs: [
				{
					typeChamp: "ALL",
					operateur: constants.operateursRecherche.keys().next()
						.value,
					criteres: [
						{
							valeur: "",
							typeRecherche: constants.typeRecherche.keys().next()
								.value,
							proximite: 2,
							operateur: constants.operateursRecherche
								.keys()
								.next().value,
						},
					],
				},
			],
		};

		this.fond = constants.codeFond.keys().next().value;

		this.updatingFond(this.fond, false);

		// Appelle de cette fonction qui s'assure que l'objet contenant la recherche contient les informations pertinentes pour le fond sélectionné.
	}

	// TODO : fonction permettant de mettre à jour la valeur du champ concerné. Permet d'éviter des appels directs aux propriétés de la classe. A terme, serait bien de rendre privées toutes les variables de document pour simplifier le code.
	updateValue(champ: number, critere: number, valeur: string, returnValue:boolean) {
		// Champ et critere commencent à 0 - correspondent au rang dans l'Array correspondant.
		this.recherche.champs[champ].criteres[critere].valeur = valeur;

		if (returnValue) return this.newObject();
		
		return this.recherche.champs[champ].criteres[critere].valeur;
	}

	// Idem pour le numéro de la page demandée. Facilitera l'affichage lorsqu'on fera un moteur de présentation des résultats plus sympathiques.
	updatePageNumber(newPage: number) {
		this.recherche.pageNumber = newPage;
		return this.recherche.pageNumber;
	}

	getCurrentPageNumber() {
		return this.recherche.pageNumber;
	}

	updatePageSize(newSize: number) {
		this.recherche.pageSize = newSize;
		return;
	}

	getPageSize() {
		return this.recherche.pageSize;
	}

	createCritere(champ: number, returnValue: boolean) {
		// Le paramètre "champ" correspond à l'index du champ dans lequel se trouve le critère à ajouter.
		// La fonction pousse un nouveau critère en fin de liste.
		// Au plus MAX_CRITERES critères par champ.
		if (this.recherche.champs[champ].criteres.length < MAX_CRITERES) {
			this.recherche.champs[champ].criteres.push({
				operateur: constants.operateursRecherche.keys().next().value,
				valeur: "",
				proximite: 2,
				typeRecherche: constants.typeRecherche.keys().next().value,
			});
		}

		if (returnValue) return this.newObject();
	}

	deleteCritere(champ: number, critere: number, returnValue: boolean) {
		// Supprime un critère au rang donné (critere) dans le champs donné.
		if (this.recherche.champs[champ].criteres.length == 1) return;

		if (
			critere > -1 &&
			critere < this.recherche.champs[champ].criteres.length
		) {
			this.recherche.champs[champ].criteres.splice(critere, 1); // Remove 1 element at the specified index
		}
		
		if (returnValue) return this.newObject();
	}

	/** Ne conserve que le premier critère (passage de la recherche avancée à la recherche simple). */
	keepFirstCritere() {
		this.recherche.champs[0].criteres.splice(1);
		return this.newObject();
	}

	updateTypeRechercheChamp(champ: number, critere: number, type: string, returnValue?: boolean) {
		
		if (this.recherche.champs[champ].criteres[critere]) {
			this.recherche.champs[champ].criteres[critere].typeRecherche = type;
		}

		if (returnValue) return this.newObject();

		return this.recherche.champs[champ].criteres[critere].typeRecherche;
	}

	updateOperateurCritereChamp(champ: number, critere: number, operateur: string, returnValue?: boolean) {

		if (this.recherche.champs[champ].criteres[critere]) {
			this.recherche.champs[champ].criteres[critere].operateur = operateur;
		}

		if (returnValue) return this.newObject();

		return this.recherche.champs[champ].criteres[critere].operateur;
	}

	getTypeRechercheChamp(champ: number, critere: number) {
		return this.recherche.champs[champ].criteres[critere].typeRecherche;
	}

	toObject() {
		if (this.recherche.filtres[0]) {
			this.recherche.filtres[0].dates.end =
				this.recherche.filtres[0].dates.end.toString();
			this.recherche.filtres[0].dates.start =
				this.recherche.filtres[0].dates.start.toString();
		}

		return {
			recherche: this.recherche,
			fond: this.fond,
		};
	}

	updatingFond(selection: string, returnValue: boolean) {
		this.fond = selection;

		// setting or resetting the date field according to the "fond"
		
		// const updateSelections = ["CETAT", "JURI", "CONSTIT", ...constants.codeLegalStatute];

		if (FONDS_SANS_FILTRE_DATE.includes(selection)) {
			this.resetDate();
		} else {
			this.updateDate();
		}

		// setting or resetting the sorting criteria. The variable is used as a Record by the Obsidian dropdown component to show the criteria in the research view.

		const triDecision = ["CETAT", "JURI", "CONSTIT", "ACCO"];
		const jorfLoda = ["LODA_ETAT", "JORF"];

		this.criteresTri = {}; // fonds sans critère de tri propre
		if (selection == "ALL")
			this.criteresTri = constants.criteresTriGeneraux.pertinence;
		else if (selection == "CNIL")
			this.criteresTri = constants.criteresTriGeneraux.cnil;
		else if (triDecision.includes(selection))
			this.criteresTri = constants.criteresTriGeneraux.decisionAcco;
		else if (jorfLoda.includes(selection))
			this.criteresTri = constants.criteresTriGeneraux.jorfLoda;
		else if (selection == "CIRC")
			this.criteresTri = constants.criteresTriGeneraux.circ;

		this.updateFacette(); // updating the date filter facet.

		if (returnValue) {
			return this.newObject();
		}
	}

	resetDate() {
		// Function that resets the date for the "fond" I couldn't yet find a way to implement completely.
		if (this.recherche.filtres[0]) {
			this.recherche.filtres[0].facette = "";
			this.recherche.filtres = [];
		}
	}

	updateFacette(crit?: string) {
		// Function that updates the facet for the date filter according either
		// to a criterium passed as argument or to the sorting field.

		if (crit) {
			this.recherche.sort = crit;
		} else {
			this.recherche.sort = "PERTINENCE"; // always falling to this as it is a default value.
		}

		if (this.recherche.filtres.length > 0) {
			if (constants.codeJurisprudence.includes(this.fond))
				this.recherche.filtres[0].facette = "DATE_DECISION";
			else if (
				this.recherche.sort.toLowerCase().includes("publication")
			) {
				this.recherche.filtres[0].facette = "DATE_PUBLICATION";
			} else if (
				this.recherche.sort.toLowerCase().includes("signature") ||
				this.fond == "ACCO"
			) {
				this.recherche.filtres[0].facette = "DATE_SIGNATURE";
			}
		}
	}

	getFacette() {
		return this.recherche.sort;
	}

	updateDate() {
		this.recherche.filtres[0] = {
			dates: { start: new dateFormat(), end: new dateFormat() },
			facette: "DATE_PUBLICATION",
		};
	}

	setDate(date:string, place:string, returnValue: boolean) {
		if (place == "start") {
			this.recherche.filtres[0].dates.start = date;
		}
		else if (place == "end") {
			this.recherche.filtres[0].dates.end = date;
		}

		if (returnValue) {
			return this.newObject();
		}
	}

	/**
	 * Complète puis valide les dates avant l'envoi.
	 * @returns `false` (avec notification) si la date de début suit la date de fin.
	 */
	checkBeforeSearch(): boolean {
		if (FONDS_SANS_FILTRE_DATE.includes(this.fond)) return true;

		const { dates } = this.recherche.filtres[0];
		if (!dates.end.toString()) dates.end = getTodaysDate();
		if (!dates.start.toString())
			dates.start = new dateFormat("1800", "1", "1").toString();

		if (!startDateBeforeEndDate(dates.start, dates.end)) {
			new Notice(
				"Vous devez entrer une date de début antérieure à la date de fin !"
			);
			return false;
		}
		return true;
	}

	/** Terme recherché (concaténation des critères), utilisé pour surligner les résultats. */
	getSearchedString() {
		return this.recherche.champs[0].criteres.map((c) => c.valeur).join("");
	}

	async search() {
		return LegifrancePlugin.instance.agent.advanceSearchText<resultatsRecherche>(
			this.toObject()
		);
	}

	newObject() {
		const newSearch = new documentSearchFieldsClass();
		newSearch.recherche = { ...this.recherche };
		newSearch.criteresTri = { ...this.criteresTri };
		newSearch.fond = this.fond;

		return newSearch
	}
}
