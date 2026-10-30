/** Adresses des pages Légifrance, d'après le préfixe de l'identifiant d'un document. */

export const LEGIFRANCE_URL = "https://www.legifrance.gouv.fr";

/** Préfixe d'un identifiant Légifrance → chemin de sa page. */
export const ID_PATHS: Record<string, string> = {
	JURITEXT: "juri/id",
	CETATEXT: "ceta/id",
	CONSTEXT: "cons/id",
	JUFITEXT: "jufi/id",
	CNILTEXT: "cnil/id",
	JORFTEXT: "jorf/id",
	JORFARTI: "jorf/article_jo",
	LEGITEXT: "codes/texte_lc",
	LEGIARTI: "codes/article_lc",
	KALITEXT: "conv_coll/id",
	KALICONT: "conv_coll/id",
	KALIARTI: "conv_coll/article",
	ACCOTEXT: "acco/id",
};

/** Préfixe alphabétique d'un identifiant (« JURITEXT000… » → « JURITEXT »), ou chaîne vide (circulaire : numéro). */
export const idPrefix = (id: string) => /^[A-Z]+/.exec(id)?.[0] ?? "";

/** Identifiant d'un résultat de recherche sans le suffixe de date de version (`LEGITEXT…_24-10-2025` → `LEGITEXT…`). */
export const baseId = (id: string | null | undefined) => (id ?? "").replace(/_\d{2}-\d{2}-\d{4}$/, "");

/**
 * Adresse d'un document sur Légifrance. Un texte `LEGITEXT` qui n'est pas un code (loi,
 * Constitution…) a sa page dans `loda` ; une circulaire n'a qu'un numéro.
 */
export function legifranceUrl(rawId: string | null | undefined, nature?: string) {
	const id = baseId(rawId);
	const prefix = idPrefix(id);
	// L'API écrit la nature d'un code tantôt « CODE », tantôt « code ».
	if (prefix === "LEGITEXT" && nature?.toUpperCase() !== "CODE") return `${LEGIFRANCE_URL}/loda/id/${id}`;
	return `${LEGIFRANCE_URL}/${ID_PATHS[prefix] ?? "circulaire/id"}/${id}`;
}
