import { ModuleOptions, ClientCredentials } from "simple-oauth2"
import { debug } from "console";
import { Notice, requestUrl } from "obsidian";
import { LegifranceSettings } from "main";

// Credit goes to https://github.com/SocialGouv/dila-api-client - I have adapted the code so it can use
// obsidian settings. 

export class DilaApiClient {
    tokenHost:string;
    apiHost:string;
    config:ModuleOptions;
    globalToken:string | unknown;

    constructor(clientId:string, clientSecret: string, apiHost:string, tokenHost:string) {
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

    updateConfig(settings:LegifranceSettings) {
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
        const client = new ClientCredentials(this.config);

        try {
            const accessToken = await client.getToken({
                scope: "openid",
            });
            this.globalToken = accessToken.token.access_token;
        }
        catch (error) {
            new Notice("Erreur d'authentification. Vérifiez vos identifiants et accès.")
            debug("error", error);
            if (error instanceof Error) {
                debug("Access Token error", error.message);
            }
            throw error;
        }
        return this.globalToken;
    }

    async fetch({ path, method = "POST", params, }: { path: string; method?: string; params?: object}):Promise<object> {
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
            method:method
        }
        console.log(`fetching route ${routeName} with ${RequestUrlParams.body}...`)
        debug(`fetching route ${routeName} with ${RequestUrlParams.body}...`);

        const data = await requestUrl(RequestUrlParams).then((r:any)=> {
            console.log(r);
            if (!r.ok) {
                if (r.status === 401 && this.globalToken) {
                    this.globalToken = undefined;
                    new Notice("L'authentication a échoué. Vérifiez vos identifiants et les accès PISTE.")
                    return this.fetch({ path, method, params });
                }
                new Error(`Erreur HTTP ! Statut : ${r.status}`)
            }

            return r.text;
        });
        if (data.error) {
            new Notice("Erreur dans la récupération des informations.");
            throw new Error(`Error on API fetch: ${JSON.stringify(data)}`);
        }

        new Notice("Données récupérées avec succès.")
        return JSON.parse(data);
    }
}




