import { App, Modal, Setting } from "obsidian";
import { MontrerResultatsModal } from "./ShowModal";
import { agentSearch } from "api/utilities";
import LegifrancePlugin, { LegifranceSettings } from "main";
import { codeFond, operateursRecherche, typeRecherche } from "api/constants";
import { resultatsRecherche } from "abstracts/searches";



export class SearchCaseModal extends Modal {
	onSubmit: (result: string) => void;
	valeurRecherche:string; // valeur du champ de recherche
	fond: string;
	settings: LegifranceSettings; // Paramètres du plugin
	agentChercheur:agentSearch; // Client qui effectue la recherche et les requêtes
	plugin:LegifrancePlugin;

	dicRecherche:resultatsRecherche; // Résultat de la recherche

	constructor(app: App, plugin:LegifrancePlugin, apiClient:agentSearch) {
		super(app);
		this.settings = plugin.settings;
		this.plugin = plugin;
		this.agentChercheur = apiClient;
		this.fond = codeFond.keys().next().value;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl("h1", { text: "Recherche sur Légifrance" });

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
                        this.dicRecherche = await this.agentChercheur.searchText(this.valeurRecherche, this.fond, this.settings.maxResults) as resultatsRecherche;
                        new MontrerResultatsModal(this.app, this.plugin, this.dicRecherche, this.valeurRecherche, this.agentChercheur, false).open();
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