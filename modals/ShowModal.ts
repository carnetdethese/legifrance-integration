import { newNote } from "creation/newNote";
import { App, SuggestModal, Notice } from "obsidian";
import { legalDocument, getDocumentInfo } from "abstracts/document" ;
import { findLink, getDecisionInfo, Decision, codeJuridiction} from "abstracts/decisions";
import LegifrancePlugin  from "main";
import { replaceMark } from "lib/tools";
import { agentSearch } from "api/utilities";
import { resultatsRecherche } from "abstracts/searches";
import { legalStatute } from "abstracts/loi";
import { addView } from "views/viewsData";
import { codeJurisprudence } from "api/constants";

interface entreeDocument {
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

	constructor(app: App, plugin:LegifrancePlugin, content:resultatsRecherche, valeurRecherche:string, apiClient:agentSearch, createNote:boolean, fond:string) {
		super(app);
		this.fond = fond;
        this.results = content;
		this.plugin = plugin;
		this.ALL_DOCUMENTS = this.getResultsDocument(content);
		this.agentChercheur = apiClient;
		this.createNote = createNote;
		this.valeurRecherche = valeurRecherche;
	}

	// fonction qui construit une liste d'objet Document permettant d'être rendu par la fonction de rendu plus bas. 
    getResultsDocument(data:resultatsRecherche) {
		const resultsDic:legalDocument[] = [];
		let contenuTexte:string, origine:string, date:string, cid:string, nature:string, type:string;

        if (data && data.results && Array.isArray(data.results)) {
			data.results.forEach(result => {
				// Process each search result here
				contenuTexte = result.text;
				origine = result.origin;
				nature = result.nature;
				type = codeJurisprudence.includes(origine) ? "jurisprudence" : "document";
				if (result.date) { date = result.date }
				result.titles.forEach((entree:entreeDocument) => {
					if (entree.cid) cid = entree.cid;
						resultsDic.push({
							fond: this.fond,
							type: type,
							titre: entree.title,
							id: entree.id,
							texte: contenuTexte,
							lien: findLink(origine, entree.id),
							origin:origine,
							nature:nature,
							date:date,
							cid:cid
						});
					});
			});
		} else {
			console.error('Réponse invalide ou manquante à la requête.');
		}
		return resultsDic
    }

	// Tri des résultats - reprise de la doc.
	getSuggestions(query: string): legalDocument[] {
		return this.ALL_DOCUMENTS.filter((decision:legalDocument) =>
			decision.titre.toLowerCase().includes(query.toLowerCase())
		);
	}

	async renderSuggestion(decision: legalDocument, el: HTMLElement) {
		const titleDiv = await replaceMark(decision.titre, document.createElement('div'));
		el.appendChild(titleDiv);

		const smallEl = await replaceMark(decision.texte, document.createElement('small'));
		el.appendChild(smallEl);
	}
	
	// Perform action on the selected suggestion.
	async onChooseSuggestion(decision: legalDocument, evt: MouseEvent | KeyboardEvent) {
		if (this.ALL_DOCUMENTS.find(elt => elt.id == decision.id) !== undefined) {
			let documentContent:legalDocument | Decision | legalStatute;
			let selectedDocument:legalDocument = this.ALL_DOCUMENTS.find(elt => elt.id == decision.id) as legalDocument;
			console.log('avant', this.plugin.document.length);

			documentContent = await getDocumentInfo(selectedDocument, this.valeurRecherche, this.agentChercheur);

			if (this.createNote) {
				new newNote(this.app, this.plugin.settings.templateDecision, this.plugin.settings.fileTitle, documentContent).createNote();
				new Notice(`Selected ${decision.id}`);
			}
			else {
				addView(selectedDocument, this.plugin.document);
				this.plugin.instancesOfDocumentViews += 1;
				this.plugin.activateTextReaderView();
			}
		}
	}
}