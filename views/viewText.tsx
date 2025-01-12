import LegifrancePlugin from "main";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { isDecision, newNote } from "creation/newNote";
import { ResearchTextView, RESEARCH_TEXT_VIEW } from "./researchText";
import { addLineBreaks, removeTags, replaceMark } from "lib/tools";
import { documentDataStorage } from "./viewsData";
import { legalDocument } from "abstracts/document";
import { formatDate } from "lib/utils";
import { createRoot, Root } from "react-dom/client";
import { ReaderView } from "./components/reader/ReaderView";
import { PluginContext } from "./context";

export const TEXT_READER_VIEW = "text-reader-view";

export class textReaderView extends ItemView {
	document: documentDataStorage;
	plugin: LegifrancePlugin;
	nouvelleNote: newNote;
	researchTab: ResearchTextView;
	id: number;
	data: legalDocument;
	root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LegifrancePlugin) {
		super(leaf);
		this.plugin = plugin;

		const doc = this.plugin.docToShow;

		if (doc != undefined) {
			this.document = doc;
			this.data = this.document.data;
		} else {

			// this.data = {
			// 	fond: "",
			// 	titre: "",
			// 	id: "",
			// 	texte: "",
			// 	lien: "",
			// 	origin: "",
			// 	type: "",
			// };


			this.document = new documentDataStorage(0, this.plugin.historiqueDocuments[0].data);
		}

		this.document.template =
			this.document.data.type == "jurisprudence"
				? this.plugin.settings.templateDecision
				: this.plugin.settings.templateDocument;

		if (this.document != undefined)
			this.nouvelleNote = new newNote(
				this.plugin.app,
				this.document.template,
				this.plugin.settings.fileTitle,
				this.document.data,
				this.plugin.settings.dossierBase
			);

		if (
			this.plugin.app.workspace.getLeavesOfType(RESEARCH_TEXT_VIEW)
				.length > 0
		) {
			this.researchTab = this.plugin.app.workspace.getLeavesOfType(
				RESEARCH_TEXT_VIEW
			)[0].view as ResearchTextView;
		}
	}

	getViewType() {
		return TEXT_READER_VIEW;
	}

	getDisplayText() {
		return this.document.data.id;
	}

	async onOpen() {
		this.root = createRoot(this.containerEl.children[1]);
		
		this.root.render(
			<PluginContext.Provider value={this.plugin}>
				<ReaderView data={this.document.data} />
			</PluginContext.Provider>
		)

		// if (this.researchTab) {
		// 	await this.researchTab.onOpen();
		// }
	}

	async onClose() {
		// Nothing to clean up.
		if (this.researchTab) {
			await this.researchTab.onOpen();
		}
	}

	viewCirc(container: Element) {
		container.createEl("h2", { text: this.document.data.titre });

		const infoBox = container.createEl("div");
		infoBox.classList.add("showLine");

		infoBox.createEl("h3", { text: "Informations" });

		if (this.document.data.date)
			infoBox.createEl("p", {
				text: `Date : ${formatDate(this.document.data.date)}`,
				cls: "infoDecision",
			});
		infoBox.createEl("p", {
			text: `Auteur : ${this.document.data.auteur}`,
			cls: "infoDecision",
		});

		const lienPdf = infoBox.createEl("a", {
			text: "Télécharger le document PDF.",
			cls: "infoDecision",
		});
		lienPdf.href = `https://www.legifrance.gouv.fr/download/pdf/circ?id=${this.document.data.id}`;

		const content = container.createDiv();

		content.createEl("h3", { text: "Texte intégral" });

		if (this.document.data.attachment?.content) {
			const texte = addLineBreaks(this.document.data.attachment?.content);
			content.appendChild(texte);
		}
	}

	viewStatute(container: Element) {
		container.createEl("h2", { text: this.document.data.id.toString() });

		const infoBox = container.createEl("div");
		infoBox.classList.add("showLine");

		infoBox.createEl("h3", { text: "Informations" });

		const titre = replaceMark(this.document.data.titre, infoBox);
		titre.classList.add("infoDecision");

		infoBox.createEl("p", {
			text: `Date : ${this.document.data.date}`,
			cls: "infoDecision",
		});
		infoBox.createEl("p", {
			text: `Numéro : ${this.document.data.numero}`,
			cls: "infoDecision",
		});

		if (isDecision(this.document.data) && this.document.data.formation) {
			infoBox.createEl("p", {
				text: `Formation : ${this.document.data.formation}`,
				cls: "infoDecision",
			});
		}
		if (isDecision(this.document.data) && this.document.data.abstract) {
			infoBox.createEl("p", {
				text: `Solution : ${this.document.data.abstract}`,
				cls: "infoDecision",
			});
		}

		const lien = infoBox.createEl("a", { text: this.document.data.lien });
		lien.href = this.document.data.lien;

		const content = container.createDiv();

		content.createEl("h3", { text: "Texte intégral" });

		if (this.document.data.texteIntegral) {
			const texteArray = this.document.data.texteIntegral.split(/\n/);

			texteArray?.forEach((elt) => {
				if (elt.startsWith("##")) {
					// content.appendChild(addLineBreaks(elt))
					this.showElementOfStatute("h4", elt, content);
				} else if (elt.startsWith("###")) {
					this.showElementOfStatute("h5", elt, content);
				} else {
					this.showElementOfStatute("p", elt, content);
				}
			});
		}
	}

	viewDecision(container: Element) {
		container.createEl("h2", { text: this.document.data.id.toString() });

		const infoBox = container.createEl("div");
		infoBox.classList.add("showLine");

		infoBox.createEl("h3", { text: "Informations" });

		if ("juridiction" in this.document.data) {
			infoBox.createEl("p", {
				text: `Juridiction : ${this.document.data.juridiction}`,
				cls: "infoDecision",
			});
			infoBox.createEl("p", {
				text: `Date : ${this.document.data.date}`,
				cls: "infoDecision",
			});
			infoBox.createEl("p", {
				text: `Numéro : ${this.document.data.numero}`,
				cls: "infoDecision",
			});
			if (this.document.data.formation) {
				infoBox.createEl("p", {
					text: `Formation : ${this.document.data.formation}`,
					cls: "infoDecision",
				});
			}
			if (this.document.data.abstract) {
				infoBox.createEl("p", {
					text: `Solution : ${this.document.data.abstract}`,
					cls: "infoDecision",
				});
			}
		}

		const lien = infoBox.createEl("a", { text: this.document.data.lien });
		lien.href = this.document.data.lien;

		const content = container.createDiv();

		content.createEl("h3", { text: "Texte intégral" });

		// if (this.document.data.texteIntegralHTML) {
		//   const texteArray = this.document.data.texteIntegralHTML.split("<p>");

		//   texteArray?.forEach(elt => {
		//     content.appendChild(this.showElementOfStatute("p", elt, content));
		//   })
		// }

		if (this.document.data.texteIntegral)
			content.appendChild(
				addLineBreaks(this.document.data.texteIntegral)
			);

		if (isDecision(this.document.data) && this.document.data.sommaires) {
			content.createEl("h3", { text: "Sommaires" });
			this.document.data.sommaires.forEach((elt) => {
				content.createEl("p", { text: elt.resume });
			});
		}
	}

	showElementOfStatute(
		el: keyof HTMLElementTagNameMap,
		elt: string,
		content: Element
	) {
		elt = removeTags(elt);
		const para = content.createEl(el);
		replaceMark(elt, para);
	}
}
