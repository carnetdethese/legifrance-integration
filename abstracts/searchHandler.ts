import * as constants from "api/constants";
import {
	getGlobalSettings,
	setValeurRecherche,
	setResultatsVariable,
	getAgentChercheur,
} from "globals/globals";
import { dateFormat } from "lib/dateHandler";
import { getTodaysDate, startDateBeforeEndDate } from "lib/utils";
import LegifrancePlugin from "main";
import { PopUpModal } from "modals/popUp";
import { WaitModal } from "modals/WaitModal";
import { Notice } from "obsidian";
import { ResearchTextView } from "views/researchText";
import { champsRechercheAvancees, resultatsRecherche } from "./searches";

// Classes et fonctions pour mieux intégrer les recherches avancées dans les fonds. Les classes devraient disposer :
// - D'une fonction de mise à jour automatique des champs en fonction des fonds selectionnées (donc renvoyer, par exemple, une liste avec les critères de tri applicables à chaque collection).

export class documentSearchFieldsClass {
	recherche: champsRechercheAvancees; // Initialise l'objet qui contiendra les critères de recherche
	fond: string; // Définit le fond dans lequel sera effectué la recherche
	criteresTri: Record<string, string>; // Contient les critères de tri en fonction du fond - voir la documentation de l'API.

	constructor() {
		// Lorsqu'on créé un nouvel objet de classe, une recherche vide est initialisée.
		// Le fond affecté est le premier sur la liste des fonds définit par une constante, ce qui correspond aussi à l'élément définit sur la vue de recherche.

		this.recherche = {
			filtres: [],
			pageSize: getGlobalSettings().maxResults,
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

	// Les quatres fonctions qui suivent permettent un meilleur contrôle de l'ajout ou la suppression d'un champ et d'un nouveau critère. Il faudra penser à implanter une logique de contrôle pour éviter que des champs requis soit supprimé, notamment.
	createChamps() {

	}

	deleteChamps(champ: number) {

	}

	createCritere(champ: number, returnValue: boolean) {
		// Le paramètre "champ" correspond à l'index du champ dans lequel se trouve le critère à ajouter.
		// La fonction pousse un nouveau critère en fin de liste.
		// Possibilité d'ajouter jusque 3 critères par champs.
		if (this.recherche.champs[champ].criteres.length < 5) {
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

	toString() {
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
		const resetSelections = ["ALL", "CODE_ETAT", "CNIL", "CIRC"];
		// const updateSelections = ["CETAT", "JURI", "CONSTIT", ...constants.codeLegalStatute];

		if (resetSelections.includes(selection)) {
			this.resetDate();
		} else {
			this.updateDate();
		}

		// setting or resetting the sorting criteria. The variable is used as a Record by the Obsidian dropdown component to show the criteria in the research view.

		const triDecision = ["CETAT", "JURI", "CONSTIT", "ACCO"];
		const jorfLoda = ["LODA_ETAT", "JORF"];

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

	updateDate(date?:string) {
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

	async checkBeforeSearch() {
		const pluginInstance = LegifrancePlugin.instance;
		const today = getTodaysDate();
		const start = new dateFormat("1800", "1", "1");

		if (
			this.fond != "ALL" &&
			this.fond != "CODE_ETAT" &&
			this.fond != "CNIL" &&
			this.fond != "CIRC"
		) {
			if (!this.recherche.filtres[0].dates.end.toString())
				this.recherche.filtres[0].dates.end = today;
			if (!this.recherche.filtres[0].dates.start.toString())
				this.recherche.filtres[0].dates.start = start.toString();

			if (
				!startDateBeforeEndDate(
					this.recherche.filtres[0].dates.start as dateFormat,
					this.recherche.filtres[0].dates.end as dateFormat
				)
			) {
				new PopUpModal(
					pluginInstance.app,
					"Vous devez entrer une date de début antérieure à la date de fin !"
				).open();
				return "false";
			}
		}
		return "true";
	}

	async search() {
		let valRecherche = "";

		for (const elt of this.recherche.champs[0].criteres) {
			valRecherche += elt.valeur;
		}

		setValeurRecherche(valRecherche);

		const data = (await getAgentChercheur().advanceSearchText(
			this.toObject()
		)) as resultatsRecherche;

		setResultatsVariable(data);
		return data;
	}

	async searchAndShowResults() {
		const pluginInstance = LegifrancePlugin.instance;
		await this.search();

		pluginInstance.activateResultsView(this);
	}

	async launchSearch() {
		const pluginInstance = LegifrancePlugin.instance;

		const waitingModal = new WaitModal(pluginInstance.app);
		waitingModal.open();

		const check = await this.checkBeforeSearch();
		if (check == "false") return;

		try {
			this.searchAndShowResults();
		} catch (error) {
			console.error("Error performing search:", error);
			new Notice(
				"Une erreur est survenue durant la requête. Veuillez vérifier vos identifiants et réessayer."
			);
		} finally {
			setTimeout(() => {
				waitingModal.close();
			}, 1000);
		}
	}

	newObject() {
		const newSearch = new documentSearchFieldsClass();
		newSearch.recherche = { ...this.recherche };
		newSearch.criteresTri = { ...this.criteresTri };
		newSearch.fond = this.fond;

		return newSearch
	}
}

export class documentHandlerView extends documentSearchFieldsClass {
	view: ResearchTextView;
	recherche: champsRechercheAvancees;
	fond: string;
	criteresTri: Record<string, string>;

	constructor(view: ResearchTextView) {
		super();
	}

	updatingFond(selection: string) {
		super.updatingFond(selection);
	}
}
