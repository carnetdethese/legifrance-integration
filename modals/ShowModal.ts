import { newNote } from "creation/newNote";
import { App, SuggestModal, Notice } from "obsidian";
import { legalDocument, getDocumentInfo } from "abstracts/document" ;
import { findLink, Decision } from "abstracts/decisions";
import LegifrancePlugin  from "main";
import { replaceMark } from "lib/tools";
import { agentSearch } from "api/utilities";
import { resultatsRecherche, resultatsRechercheClass } from "abstracts/searches";
import { legalStatute } from "abstracts/loi";
import { addView } from "views/viewsData";
import { codeJurisprudence } from "api/constants";
import { getAgentChercheur, getDocumentsListe, getResultatsVariable, getValeurRecherche } from "globals/globals";

export interface entreeDocument {
    title:string,
    id:string,
	cid:string,
}

export class MontrerResultatsModal extends SuggestModal<legalDocument> {
    results:object;
	plugin:LegifrancePlugin
	valeurRecherche:string;
	ALL_DOCUMENTS:legalDocument[];
	agentChercheur:agentSearch;
	createNote:boolean;
	fond:string;

	constructor(app: App, plugin:LegifrancePlugin, createNote:boolean, fond:string) {
		super(app);
		this.fond = fond;
        this.results = getResultatsVariable();
		this.plugin = plugin;
		const resultatsComplet = new resultatsRechercheClass(getResultatsVariable())
		this.ALL_DOCUMENTS = resultatsComplet.listeResultats();
		this.agentChercheur = getAgentChercheur();
		this.createNote = createNote;
		this.valeurRecherche = getValeurRecherche();
	}

	// Tri des résultats - reprise de la doc.
	getSuggestions(query: string): legalDocument[] {
		return this.ALL_DOCUMENTS.filter((decision:legalDocument) =>
			decision.titre.toLowerCase().includes(query.toLowerCase())
		);
	}

	async renderSuggestion(decision: legalDocument, el: HTMLElement) {
		const titleDiv = replaceMark(decision.titre, document.createElement('div'));
		el.appendChild(titleDiv);

		const smallEl = replaceMark(decision.texte, document.createElement('small'));
		el.appendChild(smallEl);
	}
	
	// Perform action on the selected suggestion.
	async onChooseSuggestion(decision: legalDocument, evt: MouseEvent | KeyboardEvent) {

		if (this.ALL_DOCUMENTS.find(elt => elt.id == decision.id) !== undefined) {
			let documentContent:legalDocument | Decision | legalStatute;
			let selectedDocument:legalDocument = this.ALL_DOCUMENTS.find(elt => elt.id == decision.id) as legalDocument;

			documentContent = await getDocumentInfo(selectedDocument, this.valeurRecherche, this.agentChercheur);

			if (this.createNote) {
				new newNote(this.app, this.plugin.settings.templateDecision, this.plugin.settings.fileTitle, documentContent, this.plugin.settings.dossierBase).createNote();
				new Notice(`Selected ${decision.id}`);
			}
			else {
				addView(selectedDocument);
				this.plugin.instancesOfDocumentViews += 1;
				this.plugin.activateTextReaderView();
			}
		}
	}
}