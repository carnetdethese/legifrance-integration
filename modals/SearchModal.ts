import { App, Modal, Setting } from "obsidian";
import { MontrerResultatsModal, dataRequest } from "./ShowModal";
import { agentSearch } from "api/utilities";
import { LegifranceIntegrationSettings } from "main";
import { codeFond, operateursRecherche, typeRecherche } from "api/constants";

export class SearchCaseModal extends Modal {
	onSubmit: (result: string) => void;
	valeurRecherche: string;
	fond: string;
	settings: LegifranceIntegrationSettings;
	agentChercheur:agentSearch;

	dicRecherche:dataRequest;

	constructor(app: App, settings:LegifranceIntegrationSettings, apiClient:agentSearch) {
		super(app);
		this.settings = settings;
		this.agentChercheur = apiClient;
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