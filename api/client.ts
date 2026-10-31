import { requestUrl, RequestUrlResponse } from "obsidian";
import { LegifranceSettings } from "settings/settings";
import { ConnectionCheck, interpretCheck } from "./connectionCheck";
import { Lane, RateLimiter } from "./rateLimiter";

/** Paramètres de connexion : les identifiants (lus dans le trousseau d'Obsidian) et les réglages de l'API. */
export type ConnectionSettings = Pick<LegifranceSettings, "apiHost" | "tokenHost" | "maxRequestsPerMinute"> & {
	clientId: string;
	clientSecret: string;
};

/** Erreur de l'API, avec son code HTTP (400/404 : requête refusée, à essayer autrement). */
export class ApiError extends Error {
	constructor(message: string, readonly status?: number) {
		super(message);
	}
}

/** Chemin de l'endpoint OAuth2 de PISTE, relatif à `tokenHost`. */
const TOKEN_PATH = "/api/oauth/token";

/**
 * Client minimal pour l'API Légifrance (PISTE / DILA).
 *
 * Inspiré de https://github.com/SocialGouv/dila-api-client, réécrit autour de
 * `requestUrl` d'Obsidian (compatible mobile, sans contrainte CORS) plutôt
 * que de `simple-oauth2`.
 */
export class DilaApiClient {
	private connection: ConnectionSettings;
	/** Jeton OAuth2 en cache ; vidé lorsque l'API répond 401. */
	private token?: string;
	/** Débit des requêtes vers PISTE (réglage « requêtes par minute »), commun à tout le plugin. */
	readonly limiter: RateLimiter;

	/** @param settings lit les paramètres au moment voulu : les identifiants viennent du trousseau, qui peut changer. */
	constructor(private readonly settings: () => ConnectionSettings) {
		this.connection = { ...settings() };
		this.limiter = new RateLimiter(this.connection.maxRequestsPerMinute);
	}

	/** Relit les identifiants/hôtes ; le jeton en cache n'est invalidé que s'ils ont changé. */
	updateConfig() {
		const connection = this.settings();
		const { clientId, clientSecret, apiHost, tokenHost } = this.connection;
		if (
			clientId !== connection.clientId ||
			clientSecret !== connection.clientSecret ||
			apiHost !== connection.apiHost ||
			tokenHost !== connection.tokenHost
		) {
			this.token = undefined;
		}
		this.connection = { ...connection };
		this.limiter.setLimit(connection.maxRequestsPerMinute);
	}

	/** Demande un jeton à PISTE (flux `client_credentials`) avec les identifiants courants. */
	private requestToken(): Promise<RequestUrlResponse> {
		const { tokenHost, clientId, clientSecret } = this.connection;
		return requestUrl({
			url: tokenHost + TOKEN_PATH,
			method: "POST",
			contentType: "application/x-www-form-urlencoded",
			// URLSearchParams encode les caractères spéciaux du secret.
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: clientId,
				client_secret: clientSecret,
				scope: "open_id",
			}).toString(),
			throw: false,
		});
	}

	/**
	 * Teste la connexion : un jeton, puis une recherche minimale (une seule réponse demandée), pour distinguer des identifiants
	 * refusés d'une application PISTE qui n'a pas accès à l'API Légifrance. Le jeton obtenu est conservé.
	 */
	async check(): Promise<ConnectionCheck> {
		this.token = undefined;
		this.updateConfig();
		let tokenResponse: RequestUrlResponse;
		try {
			tokenResponse = await this.requestToken();
		} catch {
			return interpretCheck(undefined);
		}
		if (tokenResponse.status !== 200) return interpretCheck(tokenResponse.status);
		this.token = tokenResponse.json.access_token as string;
		try {
			const response = await requestUrl({
				url: `${this.connection.apiHost.replace(/\/+$/, "")}/search`,
				method: "POST",
				contentType: "application/json",
				headers: { Authorization: `Bearer ${this.token}` },
				body: JSON.stringify({
					fond: "LODA_DATE",
					recherche: {
						champs: [{ typeChamp: "ALL", operateur: "ET", criteres: [{ typeRecherche: "EXACTE", valeur: "loi", operateur: "ET" }] }],
						filtres: [],
						pageNumber: 1,
						pageSize: 1,
						operateur: "ET",
						sort: "PERTINENCE",
						typePagination: "DEFAUT",
					},
				}),
				throw: false,
			});
			return interpretCheck(200, response.status);
		} catch {
			return interpretCheck(200);
		}
	}

	/** Récupère (ou réutilise) un jeton via le flux `client_credentials`. */
	private async getAccessToken(lane?: Lane): Promise<string> {
		if (this.token) return this.token;
		this.updateConfig();

		await this.limiter.acquire(lane);
		const response = await this.requestToken();

		if (response.status === 429) {
			const seconds = Number(response.headers?.["retry-after"]) || 60;
			this.limiter.backoff(seconds * 1000);
			throw new ApiError(`Quota de requêtes dépassé (HTTP 429) : pause de ${seconds} s.`, 429);
		}
		if (response.status !== 200) {
			throw new ApiError(
				"Authentification refusée. Vérifiez vos identifiants et accès PISTE.",
				response.status
			);
		}

		this.token = response.json.access_token as string;
		return this.token;
	}

	/**
	 * Appelle un endpoint de l'API. En cas de 401, le jeton est renouvelé et la
	 * requête rejouée une seule fois.
	 *
	 * @throws ApiError si la réponse n'est pas un succès.
	 */
	async fetch<T = object>({
		path,
		method = "POST",
		params,
		lane,
	}: {
		path: string;
		method?: string;
		params?: object;
		/** `background` : tâche de fond, après les requêtes de l'utilisateur. */
		lane?: Lane;
	}): Promise<T> {
		for (let attempt = 0; attempt < 2; attempt++) {
			const token = await this.getAccessToken(lane);
			await this.limiter.acquire(lane);
			const response: RequestUrlResponse = await requestUrl({
				url: `${this.connection.apiHost.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`,
				method,
				contentType: "application/json",
				headers: { Authorization: `Bearer ${token}` },
				body: JSON.stringify(params),
				throw: false,
			});

			if (response.status === 401) {
				this.token = undefined;
				continue;
			}
			if (response.status === 429) {
				// Quota dépassé malgré la limite choisie : tout le plugin se met en pause (Retry-After, sinon une minute).
				const seconds = Number(response.headers?.["retry-after"]) || 60;
				this.limiter.backoff(seconds * 1000);
				throw new ApiError(`Quota de requêtes dépassé (HTTP 429) : pause de ${seconds} s.`, 429);
			}
			if (response.status !== 200) {
				throw new ApiError(`Erreur HTTP ${response.status}`, response.status);
			}
			return response.json as T;
		}
		throw new ApiError(
			"L'authentification a échoué. Vérifiez vos identifiants et les accès PISTE.",
			401
		);
	}
}
