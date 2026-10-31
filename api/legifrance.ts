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
 * | `consultTableOfContents` | `POST /consult/legi/tableMatieres` | `{ textId, date }`          |
 * | `listCodes`              | `POST /list/code`              | `{ codeName, states, … }`       |
 *
 * Toutes acceptent une file (`lane`) : `"background"` pour une tâche de fond, qui passe après les requêtes que
 * l'utilisateur attend.
 */
import { ConnectionSettings, DilaApiClient } from "./client";
import type { Lane } from "./rateLimiter";

export class LegifranceApi {
	private readonly client: DilaApiClient;

	/** @param settings paramètres de connexion, lus à chaque authentification (identifiants du trousseau compris) */
	constructor(settings: () => ConnectionSettings) {
		this.client = new DilaApiClient(settings);
	}

	/** Limiteur de débit commun à tous les appels (état affiché dans les réglages). */
	get limiter() {
		return this.client.limiter;
	}

	/** Prend en compte de nouveaux identifiants, hôtes ou limite de débit. */
	updateConfig() {
		this.client.updateConfig();
	}

	/** Teste les identifiants et l'accès à l'API Légifrance (deux requêtes), avec le conseil à suivre en cas d'échec. */
	checkConnection() {
		return this.client.check();
	}

	/** Recherche avancée dans un fond (`POST /search`). `request` est le corps d'une recherche : celui du formulaire (`DocumentSearch.toObject()`) ou d'une recherche de référence (`searchQuery` dans `resolver.ts`). */
	search<T = object>(request: object, lane?: Lane) {
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

	/** Table des matières d'un texte consolidé (code, loi) telle qu'elle était à `date` (millisecondes) : sections et numéros d'articles, sans leur texte. */
	consultTableOfContents<T = object>(textId: string, date: number, lane?: Lane) {
		return this.client.fetch<T>({ path: "/consult/legi/tableMatieres", params: { textId, date }, lane });
	}

	/** Codes en vigueur dont le nom contient `codeName` (tous si vide). */
	listCodes<T = object>(codeName = "", lane?: Lane) {
		return this.client.fetch<T>({ path: "/list/code", params: { codeName, pageNumber: 1, pageSize: 100, states: ["VIGUEUR"] }, lane });
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
