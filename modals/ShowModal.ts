import { newNote } from "creation/newNote";
import { App, SuggestModal, Notice } from "obsidian";
import { Decision, findLink, getDecisionInfo } from "abstracts/decisions" ;
import { LegifranceIntegrationSettings } from "main";

export class MontrerResultatsModal extends SuggestModal<Decision> {
    results:object;
	settings:LegifranceIntegrationSettings;
	valeurRecherche:string;
	ALL_DECISIONS:Decision[];

	constructor(app: App, settings:LegifranceIntegrationSettings, content:object, valeurRecherche:string) {
		super(app);
        this.results = content;
		this.settings = settings;
		this.ALL_DECISIONS = this.getResults(content);
		this.valeurRecherche = valeurRecherche || "";
	}

	// fonction qui construit une liste d'objet Decision permettant d'être rendu par la fonction de rendu plus bas. 

    getResults(data:object) {
		const resultsDic:Decision[] = [];
		let contenuTexte:string;
		let origine:string;

        if (data && data.results && Array.isArray(data.results)) {
			data.results.forEach(result => {
				// Process each search result here
				contenuTexte = result.text;
				origine = result.origin;
				result.titles.forEach(entree => {
						resultsDic.push({
							titre: entree.title.replace(/<mark>/g, "**").replace(/<\/mark>/g, "**"), // je n'ai pas encore trouvé de solution pour afficher les éléments avec le tag <mark> de manière jolie. Visiblement, les chaines de caratères demeurent au format brut dans le Modal.
							id: entree.id,
							texte: contenuTexte,
							lien: findLink(origine, entree.id),
							origin: origine
						});
					});
			});
		} else {
			console.error('Réponse invalide ou manquante à la requête.');
		}
		return resultsDic
    }

	// Tri des résultats - reprise de la doc.
	getSuggestions(query: string): Decision[] {
		return this.ALL_DECISIONS.filter((decision:Decision) =>
			decision.titre.toLowerCase().includes(query.toLowerCase())
		);
	}
	
	// Renders each suggestion item.
	renderSuggestion(decision: Decision, el: HTMLElement) {
		el.createEl("div", { text: decision.titre  });
		el.createEl("small", { text: decision.texte });
	}
	
	// Perform action on the selected suggestion.
	async onChooseSuggestion(decision: Decision, evt: MouseEvent | KeyboardEvent) {
		let selectedDecision:Decision = this.ALL_DECISIONS.find(elt => elt.id == decision.id);
		selectedDecision = await getDecisionInfo(selectedDecision, this.valeurRecherche);
		new newNote(this.app, this.settings.template, this.settings.fileTitle, selectedDecision).createNote();
		new Notice(`Selected ${decision.id}`);
	}
}