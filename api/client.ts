import { Notice, requestUrl } from "obsidian";
import { LegifranceSettings } from "settings/settings";

interface ModuleOptions {
	auth: {
		tokenHost: string;
		tokenPath: string;
	};
	client: {
		id: string;
		secret: string;
	};
	options: {
		authorizationMethod: string;
	};
}

// Credit goes, for the most part, to https://github.com/SocialGouv/dila-api-client - I have adapted the code in order to use the FetchAPI and not the simple-oauth2 library, incompatible with mobile.

export class DilaApiClient {
	tokenHost: string;
	apiHost: string;
	config: ModuleOptions;
	globalToken: string | unknown;

	constructor(
		clientId: string,
		clientSecret: string,
		apiHost: string,
		tokenHost: string
	) {
		this.config = {
			auth: {
				tokenHost: tokenHost,
				tokenPath: "/api/oauth/token",
			},
			client: {
				id: clientId,
				secret: clientSecret,
			},
			options: {
				authorizationMethod: "body",
			},
		};
		this.tokenHost = tokenHost;
		this.apiHost = apiHost;
	}

	updateConfig(settings: LegifranceSettings) {
		this.config = {
			auth: {
				tokenHost: settings.tokenHost,
				tokenPath: "/api/oauth/token",
			},
			client: {
				id: settings.clientId,
				secret: settings.clientSecret,
			},
			options: {
				authorizationMethod: "body",
			},
		};
		this.tokenHost = settings.tokenHost;
		this.apiHost = settings.apiHost;
	}

	async getAccessToken() {
		if (this.globalToken) {
			return this.globalToken;
		}

		const headers = {
			"Content-Type": "application/x-www-form-urlencoded",
		};

		const tokenUrl =
			this.config.auth.tokenHost + this.config.auth.tokenPath;

		try {
			const data = await requestUrl({
				url: tokenUrl,
				method: "POST",
				headers: headers,
				body: `grant_type=client_credentials&client_id=${this.config.client.id}&client_secret=${this.config.client.secret}&scope=open_id`,
			}).then((r) => r.text);

			console.log(data);
			const access_token = JSON.parse(data);
			this.globalToken = access_token.access_token;
		} catch (error) {
			new Notice(
				"Erreur d'authentification. Vérifiez vos identifiants et accès."
			);
			throw error;
		}

		console.log(this.globalToken);
		return this.globalToken;
	}

	async fetch({
		path,
		method = "POST",
		params,
	}: {
		path: string;
		method?: string;
		params?: object;
	}): Promise<object> {
		const [routeName] = path.split("/").slice(-1);
		const token = await this.getAccessToken();
		const url = `${this.apiHost}/${path}`;
		const RequestUrlParams = {
			url: url,
			body: JSON.stringify(params),
			headers: {
				Authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			method: method,
		};

		const data = await requestUrl(RequestUrlParams).then((r: any) => {
			if (!r.ok) {
				if (r.status === 401 && this.globalToken) {
					this.globalToken = undefined;
					new Notice(
						"L'authentication a échoué. Vérifiez vos identifiants et les accès PISTE."
					);
					return this.fetch({ path, method, params });
				}
				new Error(`Erreur HTTP ! Statut : ${r.status}`);
			}

			return r.text;
		});
		if (data.error) {
			new Notice("Erreur dans la récupération des informations.");
			throw new Error(`Error on API fetch: ${JSON.stringify(data)}`);
		}

		new Notice("Données récupérées avec succès.");
		return JSON.parse(data);
	}
}
