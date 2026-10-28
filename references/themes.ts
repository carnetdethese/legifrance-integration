/**
 * Thème d'une décision, tiré de ce que Légifrance renvoie (`/consult/juri`) :
 * - Conseil d'État : `sommaire[].abstrats`, la table analytique (« CETAT135-02-03-03 COLLECTIVITÉS
 *   TERRITORIALES. COMMUNE. ATTRIBUTIONS. - CONTRAT… ») ;
 * - Cour de cassation : titrage « Cassation civil - RESPONSABILITE DU FAIT DES PRODUITS DEFECTUEUX -
 *   Producteur - … » ;
 * - Conseil constitutionnel : l'objet entre crochets dans le titre (« [Révocation des fonctions de
 *   maire] »).
 * Un thème est un chemin du plus général au plus précis, « Collectivités territoriales > Commune ».
 * Module pur.
 */

const SEPARATOR = " > ";
/** Nombre maximal de thèmes retenus par décision. */
const MAX_THEMES = 6;

const stripTags = (text: string) => text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const sentenceCase = (text: string) => {
	const lower = text.trim().toLowerCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
};
/** Rubrique en capitales (« RESPONSABILITE DU FAIT DES PRODUITS DEFECTUEUX »). */
const isHeading = (text: string) => text.length > 3 && /[A-ZÀ-Ý]/.test(text) && text === text.toUpperCase();

/** Code de nomenclature en tête d'une rubrique (« CETAT54-07-02-04,RJ1,RJ2 PROCÉDURE ») : lettres, numéros, renvois « RJ ». */
const CODE_PREFIX = /^[A-Z]{3,6}\d[\d-]*(?:\s*,\s*[A-Z]{1,3}\d+)*\s+/i;

/** Thème d'une entrée de `sommaire`, ou `undefined`. */
function themeOf(entry: { abstrats?: unknown; resumePrincipal?: unknown }): string | undefined {
	if (typeof entry.abstrats === "string" && entry.abstrats.trim()) {
		// « CETAT135-02-03-03 COLLECTIVITÉS TERRITORIALES. COMMUNE. - CONTRAT… » : la table, avant le tiret.
		const head = stripTags(entry.abstrats).replace(CODE_PREFIX, "").split(/\s+-\s+/)[0];
		const path = head.split(/\.\s*/).map((part) => part.trim()).filter(Boolean).map(sentenceCase);
		if (path.length) return path.join(SEPARATOR);
	}
	if (typeof entry.resumePrincipal === "string") {
		const parts = stripTags(entry.resumePrincipal).split(/\s+-\s+/).map((part) => part.trim());
		const at = parts.findIndex(isHeading);
		if (at >= 0) return [parts[at], ...parts.slice(at + 1, at + 3)].filter(Boolean).map((p, i) => (i === 0 ? sentenceCase(p) : p)).join(SEPARATOR);
	}
	return undefined;
}

/** Objet d'une décision du Conseil constitutionnel : le titre entre crochets. */
const bracketTheme = (title: string) => /\[([^\]]{3,})\]/.exec(title)?.[1].trim();

/** Thèmes d'une décision d'après `sommaire` et son titre, sans doublon. */
export function extractThemes(sommaire: unknown, title = ""): string[] {
	const themes = new Set<string>();
	for (const entry of Array.isArray(sommaire) ? sommaire : []) {
		if (entry && typeof entry === "object") {
			const theme = themeOf(entry as Record<string, unknown>);
			if (theme) themes.add(theme);
		}
	}
	const subject = bracketTheme(title);
	if (subject) themes.add(subject);
	return [...themes].slice(0, MAX_THEMES);
}

/** Solution d'une décision du Conseil constitutionnel : fin du titre (« … - Non conformité partielle »). */
export function solutionFromTitle(title: string) {
	const last = title.split(/\s+-\s+/).pop()?.trim();
	return last && /conform|non-lieu|irrecevab|renvoi|rejet|annul/i.test(last) && /^Décision/i.test(title) ? last : undefined;
}

/** Résumé : texte des entrées de `sommaire` (sans code de nomenclature), pour l'affichage et la recherche. */
export function extractSummary(sommaire: unknown, keywords: unknown = []): string | undefined {
	const parts: string[] = [];
	for (const entry of Array.isArray(sommaire) ? sommaire : []) {
		const text = entry && typeof entry === "object" ? (entry as { resumePrincipal?: unknown }).resumePrincipal : undefined;
		if (typeof text === "string" && text.trim()) parts.push(stripTags(text).replace(/^\d[\d-]*\s+/, ""));
	}
	const words = Array.isArray(keywords) ? keywords.filter((k): k is string => typeof k === "string") : [];
	const summary = [...new Set(parts), ...words].join(" ").trim();
	return summary ? summary.slice(0, 2000) : undefined;
}

/**
 * Thème nettoyé : sans code de nomenclature resté en tête (thèmes enregistrés avant la correction),
 * espaces normalisés, première lettre en capitale.
 */
export function cleanTheme(theme: string) {
	const text = theme.replace(/\s+/g, " ").trim().replace(CODE_PREFIX, "").trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Clef de regroupement d'un thème : sans accents, casse ni ponctuation (« Responsabilité » et « responsabilite »). */
export const themeKey = (theme: string) =>
	theme.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Thème de plus haut niveau (« Collectivités territoriales »). */
export const topTheme = (theme: string) => theme.split(SEPARATOR)[0];
export const THEME_SEPARATOR = SEPARATOR;
