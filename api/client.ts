import { requestUrl, RequestUrlResponse } from "obsidian";
import { LegifranceSettings } from "settings/settings";

type ConnectionSettings = Pick<
	LegifranceSettings,
	"clientId" | "clientSecret" | "apiHost" | "tokenHost"
>;

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

	constructor(connection: ConnectionSettings) {
		this.connection = { ...connection };
	}

	/** Met à jour les identifiants/hôtes ; le jeton en cache n'est invalidé que s'ils ont changé. */
	updateConfig(connection: ConnectionSettings) {
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
	}

	/** Récupère (ou réutilise) un jeton via le flux `client_credentials`. */
	private async getAccessToken(): Promise<string> {
		if (this.token) return this.token;

		const { tokenHost, clientId, clientSecret } = this.connection;
		const response = await requestUrl({
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
	}: {
		path: string;
		method?: string;
		params?: object;
	}): Promise<T> {
		for (let attempt = 0; attempt < 2; attempt++) {
			const response: RequestUrlResponse = await requestUrl({
				url: `${this.connection.apiHost}/${path}`,
				method,
				contentType: "application/json",
				headers: { Authorization: `Bearer ${await this.getAccessToken()}` },
				body: JSON.stringify(params),
				throw: false,
			});

			if (response.status === 401) {
				this.token = undefined;
				continue;
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
