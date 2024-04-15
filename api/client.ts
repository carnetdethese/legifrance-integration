import { ModuleOptions, ClientCredentials } from "simple-oauth2"
const node_fetch_1 = require("node-fetch");
import { debug } from "console";

export class DilaApiClient {
    tokenHost:string;
    apiHost:string;
    config:ModuleOptions;
    globalToken:any;

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
    async fetch({ path, method = "POST", params, }: { path: string; method?: string; params?: any }) {
        const [routeName] = path.split("/").slice(-1);
        const body = JSON.stringify(params);
        debug(`fetching route ${routeName} with ${body}...`);
        const token = await this.getAccessToken();
        const url = `${this.apiHost}/${path}`;
        const data = await node_fetch_1.default(url, {
            body,
            headers: {
                Authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
            method,
        }).then((r:any)=> {
            if (r.status === 401 && this.globalToken) {
                this.globalToken = undefined;
                return this.fetch({ path, method, params });
            }
            return r.json();
        });
        if (data.error) {
            throw new Error(`Error on API fetch: ${JSON.stringify(data)}`);
        }
        return data;
    }
}




