import { newNote } from "creation/newNote";
import { App, SuggestModal, Notice } from "obsidian";
import { Decisions, findLink, getDecisionInfo } from "abstracts/decisions" ;
import { LegifranceIntegrationSettings } from "main";

export class MontrerResultatsModal extends SuggestModal<Decisions> {
    results:object;
	settings:LegifranceIntegrationSettings;
	valeurRecherche:string;
	ALL_DECISIONS:Decisions[];

	constructor(app: App, settings:LegifranceIntegrationSettings, content:object, valeurRecherche:string) {
		super(app);
        this.results = content;
		this.settings = settings;
		this.ALL_DECISIONS = this.getResults(content);
		this.valeurRecherche = valeurRecherche || "";
	}

	// fonction qui construit une liste d'objet Decisions permettant d'être rendu par la fonction de rendu plus bas. 

    getResults(data:object) {
		let resultsDic:Decisions[] = [];
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
							texte: contenuTexte.replace(/<mark>/g, "**").replace(/<\/mark>/g, "**"),
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
	getSuggestions(query: string): Decisions[] {
		return this.ALL_DECISIONS.filter((decision:Decisions) =>
			decision.titre.toLowerCase().includes(query.toLowerCase())
		);
	}
	
	// Renders each suggestion item.
	renderSuggestion(decision: Decisions, el: HTMLElement) {
		el.createEl("div", { text: decision.titre  });
		el.createEl("small", { text: decision.texte });
	}
	
	// Perform action on the selected suggestion.
	async onChooseSuggestion(decision: Decisions, evt: MouseEvent | KeyboardEvent) {
		let selectedDecision:Decisions = this.ALL_DECISIONS.find(elt => elt.id == decision.id);
		selectedDecision = await getDecisionInfo(selectedDecision, this.valeurRecherche);
		console.log(selectedDecision.texteIntegral);
		new newNote(this.app, this.settings.template, selectedDecision).createNote(decision.id);
		new Notice(`Selected ${decision.id}`);
	}
}