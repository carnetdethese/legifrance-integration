import { ItemView, WorkspaceLeaf, Setting } from "obsidian";
import { typeRecherche, operateursRecherche } from "api/constants";
import { agentSearch } from "api/utilities";
import { champsRechercheAvancees } from "abstracts/searches";
import LegifrancePlugin from "main";
import { textReaderView } from "./viewText";
import { resultatsRecherche } from "abstracts/searches";
import { documentHandlerView } from "abstracts/searchHandler";
import { dateHandler } from "lib/dateHandler";
import { deleteDocEntry } from "./viewsData";

import { StrictMode } from "react";
import { Root, createRoot } from "react-dom/client";
import { ResearchView } from "./components/search/ResearchView";
import { getDocumentsListe } from "globals/globals";
import { AppContext, PluginContext } from "./context"

export const RESEARCH_TEXT_VIEW = "research-text-view";

export class ResearchTextView extends ItemView {
	documentFields: documentHandlerView;
	dateRecherche: dateHandler;
	recherche: champsRechercheAvancees;
	compteur: number;
	agentChercheur: agentSearch;
	searchResult: resultatsRecherche;
	activeResearchType: string;
	headerDiv: HTMLElement;
	listResults: HTMLElement;
	rechercheDiv: HTMLElement;
	valeurRecherche: string;
	plugin: LegifrancePlugin;
	activeViewLeaf: textReaderView | null;
	root: Root | null = null;

	constructor(
		plugin: LegifrancePlugin,
		leaf: WorkspaceLeaf,
		agentChercheur: agentSearch
	) {
		super(leaf);
		this.compteur = 0;
		this.agentChercheur = agentChercheur;
		this.plugin = plugin;
		this.dateRecherche = new dateHandler(this);
		this.documentFields = new documentHandlerView(this);
	}

	getViewType() {
		return RESEARCH_TEXT_VIEW;
	}

	getDisplayText() {
		return "Légifrance";
	}

	setActiveViewText(view: textReaderView) {
		this.activeViewLeaf = view;
		return this.activeViewLeaf;
	}

	deleteActiveViewText() {
		this.activeViewLeaf = null;
	}

	async onOpen() {
		// initializing the view
		this.root = createRoot(this.containerEl.children[1]);

		this.root.render(
			<StrictMode>
				<PluginContext.Provider value={this.plugin}>
					<ResearchView />
				</PluginContext.Provider>
			</StrictMode>
		);
	}

	openViewText(id: string) {
		this.plugin.activateTextReaderView();
	}

	async onClose() {
		this.root?.unmount();
	}

	simpleSearchEngine() {
		this.rechercheDiv.empty();
		this.activeResearchType = "simple";
		this.compteur = 0;

		if (this.documentFields.fond == "") return;

		if (this.documentFields.recherche.champs.length <= 0) {
			this.documentFields.recherche.champs[0].criteres.push({
				valeur: "",
				typeRecherche: typeRecherche.keys().next().value,
				proximite: 2,
				operateur: operateursRecherche.keys().next().value,
			});
		}

		if (
			this.documentFields.fond != "ALL" &&
			this.documentFields.fond != "CODE_ETAT" &&
			this.documentFields.fond != "CNIL" &&
			this.documentFields.fond != "" &&
			this.documentFields.fond != "CIRC"
		) {
			const dateDebut = new Setting(this.rechercheDiv).setName(
				"Date de début"
			);
			this.dateRecherche.champDate(dateDebut, "start");

			const dateFin = new Setting(this.rechercheDiv).setName(
				"Date de fin"
			);
			this.dateRecherche.champDate(dateFin, "end");
		}

		new Setting(this.rechercheDiv).setName("Recherche").addText((text) =>
			text
				.setValue(
					this.documentFields.recherche.champs[0].criteres[0].valeur
				)
				.onChange(() => {
					this.documentFields.recherche.champs[0].criteres[0].valeur =
						text.getValue();
					// // console.log(this.documentFields.recherche.champs[0].criteres[0].valeur)
				})
				.inputEl.addEventListener("keypress", (event) => {
					if (event.key === "Enter") {
						event.preventDefault(); // Prevent default form submission
						this.documentFields.updatePageNumber(1);
						this.documentFields.launchSearch(); // Call search function
						this.onOpen();
					}
				})
		);

		new Setting(this.rechercheDiv)
			.addDropdown((typeRechercheChamp) => {
				typeRecherche.forEach((value, key) => {
					typeRechercheChamp
						.addOption(key, value)
						.setValue(
							this.documentFields.getTypeRechercheChamp(0, 0)
						);
				});
				typeRechercheChamp.onChange((value) => {
					this.documentFields.updateTypeRechercheChamp(0, 0, value);
				});
			})
			.addDropdown((operateur) => {
				operateursRecherche.forEach((value, key) => {
					operateur.addOption(key, value);
				});
				operateur.onChange((value) => {
					this.documentFields.criteresTri.operateur = value;
					// console.log(this.documentFields.criteresTri.operateur);
				});
			});

		new Setting(this.rechercheDiv).addButton((btn) => {
			btn.setButtonText("Valider")
				.setCta()
				.onClick(async () => {
					this.documentFields.updatePageNumber(1);
					await this.documentFields.launchSearch();
					this.onOpen();
				});

			if (this.documentFields.fond == "") {
				btn.removeCta();
				btn.setDisabled(true);
			}
		});
	}

}
