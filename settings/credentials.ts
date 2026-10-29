/**
 * Identifiants PISTE dans le trousseau d'Obsidian (`app.secretStorage`). Les réglages ne gardent que le nom des
 * secrets (`clientIdSecret`, `clientSecretSecret`) ; la valeur est lue au moment de s'en servir. Les anciennes
 * versions écrivaient les identifiants en clair dans `data.json` : `migrateCredentials` les met dans le trousseau.
 * Module indépendant d'Obsidian (le plugin fournit le trousseau).
 */

/** Nom proposé pour le secret de l'identifiant client, et pour celui de la clef secrète. */
export const CLIENT_ID_SECRET = "legifrance-client-id";
export const CLIENT_SECRET_SECRET = "legifrance-client-secret";

/** Ce que l'on utilise du trousseau (`SecretStorage` d'Obsidian). */
export interface SecretStore {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

/** Réglages concernés : noms des secrets, et valeurs en clair des anciennes versions. */
export interface CredentialSettings {
	clientIdSecret: string;
	clientSecretSecret: string;
	clientId?: string;
	clientSecret?: string;
}

/**
 * Enregistre `value` dans le trousseau sous `base`, ou sous `base-2`, `base-3`… si ce nom est pris par une autre valeur
 * (un secret d'un autre plugin n'est jamais écrasé). Le secret est relu avant d'être annoncé.
 * @returns le nom du secret, ou `undefined` si l'enregistrement a échoué
 */
export function storeSecret(store: SecretStore, base: string, value: string): string | undefined {
	for (let attempt = 1; attempt <= 20; attempt++) {
		const id = attempt === 1 ? base : `${base}-${attempt}`;
		try {
			const current = store.getSecret(id);
			if (current === value) return id;
			if (current) continue;
			store.setSecret(id, value);
			if (store.getSecret(id) === value) return id;
			return undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

/**
 * Reprend dans le trousseau les identifiants en clair des anciennes versions. Une valeur n'est retirée des réglages
 * qu'une fois relue dans le trousseau : en cas d'échec elle reste où elle est.
 * @returns `true` si les réglages ont changé (à enregistrer), et les valeurs restées en clair (échec)
 */
export function migrateCredentials(settings: CredentialSettings, store: SecretStore) {
	let changed = false;
	const stranded: string[] = [];
	const move = (plain: "clientId" | "clientSecret", name: "clientIdSecret" | "clientSecretSecret", base: string) => {
		const value = settings[plain];
		if (value === undefined) return;
		if (!value.trim() || settings[name]) {
			// Rien à reprendre, ou un secret déjà choisi : l'ancienne valeur en clair n'a plus d'usage.
			delete settings[plain];
			changed = true;
			return;
		}
		const id = storeSecret(store, base, value.trim());
		if (!id) return void stranded.push(plain);
		settings[name] = id;
		delete settings[plain];
		changed = true;
	};
	move("clientId", "clientIdSecret", CLIENT_ID_SECRET);
	move("clientSecret", "clientSecretSecret", CLIENT_SECRET_SECRET);
	return { changed, stranded };
}
