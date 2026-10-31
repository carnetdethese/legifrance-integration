/**
 * Lecture du résultat d'un test de connexion à PISTE : étape de l'échec et conseil pour le corriger. Module pur
 * (le test lui-même, qui interroge PISTE, est dans `client.ts`).
 */

/** Verdict du test : `ok`, un titre court et ce qu'il faut faire. */
export interface ConnectionCheck {
	ok: boolean;
	title: string;
	detail: string;
}

/**
 * @param tokenStatus code HTTP de la demande de jeton, `undefined` si PISTE n'a pas répondu
 * @param apiStatus code HTTP d'une recherche minimale, `undefined` si elle n'a pas eu lieu ou pas abouti
 */
export function interpretCheck(tokenStatus: number | undefined, apiStatus?: number): ConnectionCheck {
	if (tokenStatus === undefined)
		return { ok: false, title: "PISTE est injoignable", detail: "Vérifiez votre connexion Internet. Si elle fonctionne, les adresses des hôtes (réglages avancés de la connexion) ont peut-être changé." };
	if (tokenStatus === 429 || apiStatus === 429)
		return { ok: false, title: "Quota dépassé", detail: "PISTE limite le nombre de requêtes. Patientez une minute avant de réessayer." };
	if (tokenStatus === 400 || tokenStatus === 401)
		return {
			ok: false,
			title: "Identifiants refusés",
			detail: "Vérifiez que le Client ID et le Client Secret sont ceux de la section OAuth (le deuxième volet) de l'onglet « Authentification » de votre application, sans espace avant ni après, et que l'application est bien activée.",
		};
	if (tokenStatus !== 200) return { ok: false, title: `PISTE a répondu HTTP ${tokenStatus}`, detail: "Le service est peut-être indisponible. Réessayez plus tard." };
	if (apiStatus === 200) return { ok: true, title: "Connexion réussie", detail: "Vos identifiants sont valides et l'API Légifrance répond." };
	if (apiStatus === 401 || apiStatus === 403)
		return {
			ok: false,
			title: "Identifiants valides, mais pas d'accès à l'API Légifrance",
			detail: "Sur PISTE, ouvrez votre application : acceptez les conditions d'utilisation de Légifrance (page de consentement, étape 4), puis sélectionnez l'API Légifrance dans l'application et validez (étape 5).",
		};
	if (apiStatus === undefined) return { ok: false, title: "L'API Légifrance n'a pas répondu", detail: "Les identifiants sont valides, mais le service ne répond pas. Réessayez plus tard." };
	return { ok: false, title: `L'API Légifrance a répondu HTTP ${apiStatus}`, detail: "Les identifiants sont valides. Si l'erreur persiste, vérifiez l'adresse de l'hôte de l'API dans les réglages." };
}
