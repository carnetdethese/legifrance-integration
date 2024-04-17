import { App, Modal, Setting } from "obsidian";
import { MontrerResultatsModal, resultsRequest } from "./ShowModal";
import { agentSearch } from "api/utilities";
import { LegifranceSettings } from "main";
import { codeFond, operateursRecherche, typeRecherche } from "api/constants";

export class SearchCaseModal extends Modal {
	onSubmit: (result: string) => void;
	valeurRecherche:string; // valeur du champ de recherche
	fond: string;
	settings: LegifranceSettings; // Paramètres du plugin
	agentChercheur:agentSearch; // Client qui effectue la recherche et les requêtes

	dicRecherche:resultsRequest; // Résultat de la recherche

	constructor(app: App, settings:LegifranceSettings, apiClient:agentSearch) {
		super(app);
		this.settings = settings;
		this.agentChercheur = apiClient;
		this.fond = codeFond.keys().next().value;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl("h1", { text: "Recherche sur Légifrance" });

		new Setting(contentEl)
		.setName("Fond :")
		.addDropdown((fondSelected) => {
			codeFond.forEach((value, key) => {
				fondSelected.addOption(key, value)
			});
			fondSelected.onChange(() => {
				this.fond = fondSelected.getValue();
			})
		})

		new Setting(contentEl)
			.setName("Recherche :")
			.addText((text) =>
				text.onChange((value) => {
					this.valeurRecherche = value;
				}))
			.addDropdown((typeRechercheChamp) => {
				typeRecherche.forEach((value, key) => {
					typeRechercheChamp.addOption(key, value)
				});			
				})
			.addDropdown((operateur) => {
				operateursRecherche.forEach((value, key) => {
					operateur.addOption(key, value)
				});
			})

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Valider")
					.setCta()
					.onClick(async () => {
						this.close();
						console.log(this.valeurRecherche + this.fond);
                        this.dicRecherche = await this.agentChercheur.searchText(this.valeurRecherche, this.fond, this.settings.maxResults);
                        new MontrerResultatsModal(this.app, this.settings, this.dicRecherche, this.valeurRecherche, this.agentChercheur).open();
					}));
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}


export class SearchStatuteModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		
	}

	onClose(): void {
		
	}
}