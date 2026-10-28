/**
 * Les appels à l'API Légifrance (PISTE) : un endpoint, une méthode. Tout le plugin passe par ici ; le
 * transport (jeton OAuth2, débit, erreurs HTTP) est dans `client.ts`, qui n'est pas à toucher pour ajouter un
 * appel. Les réponses sont renvoyées brutes (`T` est ce que l'appelant en lit) : leur lecture est faite
 * ailleurs, par fond (`abstracts/`, `references/caselaw.ts`, `references/resolver.ts`…).
 *
 * | Méthode                  | Endpoint                       | Corps de la requête             |
 * |--------------------------|--------------------------------|---------------------------------|
 * | `search`                 | `POST /search`                 | critères de recherche d'un fond |
 * | `consultDecision`        | `POST /consult/juri` / `cnil`  | `{ textId, searchedString? }`   |
 * | `consultArticle`         | `POST /consult/getArticle`     | `{ id }`                        |
 * | `consult`                | `POST /consult/<route>`        | selon la route (`consult.ts`)   |
 *
 * Toutes acceptent une file (`lane`) : `"background"` pour une tâche de fond, qui passe après les requêtes que
 * l'utilisateur attend.
 */
import type { rechercheAvStructure } from "abstracts/searches";
import { ConnectionSettings, DilaApiClient } from "./client";
import type { Lane } from "./rateLimiter";

export class LegifranceApi {
	private readonly client: DilaApiClient;

	constructor(settings: ConnectionSettings) {
		this.client = new DilaApiClient(settings);
	}

	/** Limiteur de débit commun à tous les appels (état affiché dans les réglages). */
	get limiter() {
		return this.client.limiter;
	}

	/** Prend en compte de nouveaux identifiants, hôtes ou limite de débit. */
	updateConfig(settings: ConnectionSettings) {
		this.client.updateConfig(settings);
	}

	/** Recherche avancée dans un fond (`POST /search`). `request` est le corps construit par `documentSearchFieldsClass.toObject()`. */
	search<T = object>(request: rechercheAvStructure, lane?: Lane) {
		return this.client.fetch<T>({ path: "/search", params: request, lane });
	}

	/**
	 * Texte et métadonnées d'une décision de justice (`POST /consult/juri`, ou `/consult/cnil` pour la CNIL).
	 * `searchedString` fait surligner ses occurrences dans le texte.
	 */
	consultDecision<T = object>(textId: string, { searchedString, cnil = false, lane }: { searchedString?: string; cnil?: boolean; lane?: Lane } = {}) {
		return this.client.fetch<T>({ path: cnil ? "/consult/cnil" : "/consult/juri", params: { textId, searchedString }, lane });
	}

	/** Un article de code ou de texte (`POST /consult/getArticle`) : texte, versions. */
	consultArticle<T = object>(id: string, lane?: Lane) {
		return this.client.fetch<T>({ path: "/consult/getArticle", params: { id }, lane });
	}

	/**
	 * Consultation d'un document par la route de son fond (`/consult/legiPart`, `/consult/jorf`,
	 * `/consult/kaliText`…). Les routes et leurs corps sont choisis d'après l'identifiant par `routesFor`
	 * (`abstracts/consult.ts`).
	 */
	consult<T = object>(route: string, params: object, lane?: Lane) {
		return this.client.fetch<T>({ path: route, params, lane });
	}
}
