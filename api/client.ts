import { ModuleOptions, ClientCredentials } from "simple-oauth2"
import { debug } from "console";
import { requestUrl } from "obsidian";

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
            debug("error", error);
            if (error instanceof Error) {
                debug("Access Token error", error.message);
            }
            throw error;
        }
        return this.globalToken;
    }

    async fetch({ path, method = "POST", params, }: { path: string; method?: string; params?: object }):Promise<object> {
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
        debug(`fetching route ${routeName} with ${RequestUrlParams.body}...`);

        const data = await requestUrl(RequestUrlParams).then((r:any)=> {
            if (r.status === 401 && this.globalToken) {
                this.globalToken = undefined;
                return this.fetch({ path, method, params });
            }
            return r.text;
        });
        if (data.error) {
            throw new Error(`Error on API fetch: ${JSON.stringify(data)}`);
        }
        return JSON.parse(data);
    }
}




