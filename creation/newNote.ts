import * as Handlebars from "handlebars";
import { App } from "obsidian";
import { legalDocument } from "abstracts/document";
import { ficheArretChamp, noteDocumentChamp } from "abstracts/searches";

// function isDecision(doc: legalDocument): doc is Decision {
//     return (doc as Decision).juridiction !== undefined;
// }

export function isDecision(doc: legalDocument): doc is legalDocument {
	return (
		"annee" in doc &&
		"juridiction" in doc &&
		"formation" in doc &&
		"urlCC" in doc &&
		"sommaires" in doc &&
		"abstract" in doc
	);
}

export class newNote {
	app: App;
	template: string;
	titreTemplate: string;
	data: legalDocument;
	folder: string;
	champFiche: ficheArretChamp | noteDocumentChamp;
	dataNote:
		| Partial<ficheArretChamp>
		| Partial<noteDocumentChamp>
		| Partial<legalDocument>;

	constructor(
		app: App,
		template: string,
		templateTitre: string,
		data: legalDocument,
		dossierBase: string
	) {
		this.app = app;
		this.template = template;
		this.data =
			data.type == "jurisprudence"
				? (data as legalDocument)
				: (data as legalDocument);
		this.folder = this.folderSetting(dossierBase) || "/";
		this.titreTemplate = templateTitre;

		if (data.type == "jurisprudence") {
			this.champFiche = {
				faits: "",
				procedure: "",
				moyens: "",
				question: "",
				solution: "",
			};
		} else {
			this.champFiche = {
				notes: "",
				interet: "",
				connexes: "",
			};
		}
	}

	folderSetting(dossierBase: string) {
		let filePath = "";

		if (this.data.type == "jurisprudence" && "juridiction" in this.data) {
			if (dossierBase == "/") filePath = `${this.data.juridiction}/`;
			else filePath = `${dossierBase}/${this.data.juridiction}/`;
		} else {
			filePath = `${dossierBase}`;
		}

		return filePath;
	}

	async renderFileTitle() {
		const titreTemplateCompiled = Handlebars.compile(this.titreTemplate, {
			noEscape: true,
		});
		return titreTemplateCompiled(this.dataNote);
	}

	async createNote() {
		this.dataNote = {
			...this.data,
			...(this.data.notes || null),
		};

		console.log(this.dataNote);

		let fileTitle;

		if (this.dataNote.titreNote) {
			fileTitle = this.dataNote.titreNote;
		} else {
			fileTitle = await this.renderFileTitle();
		}

		let filePath: string = this.folder + fileTitle;

		const templateContenuCompile = Handlebars.compile(this.template, {
			noEscape: true,
		});
		const noteContent = templateContenuCompile(this.dataNote);
		console.log(noteContent);

		if (!this.app.vault.getFolderByPath(this.folder)) {
			this.app.vault.createFolder(this.folder);
		}

		if (this.app.vault.getFileByPath(filePath + ".md")) {
			// Ceci évite la suppression de notes déjà créées en ajoutant la date en millisecondes au nom du fichier s'il s'agit de la deuxième note.
			filePath += `-${Date.now()}`;
		}

		filePath += ".md";

		await this.app.vault.create(filePath, noteContent);
		const abstractFile = this.app.vault.getFileByPath(filePath);
		if (abstractFile !== null) {
			await this.app.workspace.getLeaf().openFile(abstractFile);
		}
	}
}
