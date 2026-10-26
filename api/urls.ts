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

/**
 * Adresse d'un document sur Légifrance. Un texte `LEGITEXT` qui n'est pas un code (loi,
 * Constitution…) a sa page dans `loda` ; une circulaire n'a qu'un numéro.
 */
export function legifranceUrl(id: string, nature?: string) {
	const prefix = idPrefix(id);
	if (prefix === "LEGITEXT" && nature !== "CODE") return `${LEGIFRANCE_URL}/loda/id/${id}`;
	return `${LEGIFRANCE_URL}/${ID_PATHS[prefix] ?? "circulaire/id"}/${id}`;
}
