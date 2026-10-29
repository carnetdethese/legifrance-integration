/** Tests de la reprise des identifiants dans le trousseau. Lancer : `npm test`. */
import { CredentialSettings, SecretStore, migrateCredentials, storeSecret } from "./credentials";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

const fakeStore = (initial: Record<string, string> = {}, broken = false): SecretStore & { data: Record<string, string> } => {
	const data = { ...initial };
	return { data, getSecret: (id) => data[id] ?? null, setSecret: (id, value) => { if (!broken) data[id] = value; } };
};

// storeSecret
{
	const store = fakeStore();
	eq("nom libre", storeSecret(store, "x", "a"), "x");
	eq("même valeur : réutilisé", storeSecret(store, "x", "a"), "x");
	eq("autre valeur : nom suivant", storeSecret(store, "x", "b"), "x-2");
	eq("trousseau", store.data, { x: "a", "x-2": "b" });
	eq("échec d'écriture", storeSecret(fakeStore({}, true), "x", "a"), undefined);
}

// migration
{
	const store = fakeStore();
	const settings: CredentialSettings = { clientIdSecret: "", clientSecretSecret: "", clientId: " abc ", clientSecret: "def" };
	const result = migrateCredentials(settings, store);
	eq("réglages", settings, { clientIdSecret: "legifrance-client-id", clientSecretSecret: "legifrance-client-secret" });
	eq("trousseau migré", store.data, { "legifrance-client-id": "abc", "legifrance-client-secret": "def" });
	eq("bilan", result, { changed: true, stranded: [] });
}
{
	const settings: CredentialSettings = { clientIdSecret: "", clientSecretSecret: "", clientId: "abc", clientSecret: "def" };
	const result = migrateCredentials(settings, fakeStore({}, true));
	eq("échec : valeurs conservées", settings, { clientIdSecret: "", clientSecretSecret: "", clientId: "abc", clientSecret: "def" });
	eq("échec : bilan", result, { changed: false, stranded: ["clientId", "clientSecret"] });
}
{
	const settings: CredentialSettings = { clientIdSecret: "mon-id", clientSecretSecret: "", clientId: "ancien", clientSecret: "" };
	const store = fakeStore();
	migrateCredentials(settings, store);
	eq("secret déjà choisi : rien écrit", store.data, {});
	eq("secret déjà choisi : clair retiré", settings, { clientIdSecret: "mon-id", clientSecretSecret: "" });
}
{
	const settings: CredentialSettings = { clientIdSecret: "", clientSecretSecret: "" };
	eq("rien à reprendre", migrateCredentials(settings, fakeStore()), { changed: false, stranded: [] });
}

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("credentials : tous les tests passent");
