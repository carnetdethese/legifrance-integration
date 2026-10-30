/** Mise en forme pour l'affichage : dates en français, natures de texte, recherche dans un texte. Module pur. */

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 2017-04-07 » (ou un horodatage ISO) → « 7 avril 2017 » ; une date illisible est rendue telle quelle, une absente est vide. */
export function longDate(iso: string | null | undefined) {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
	if (!match) return iso ?? "";
	const [, year, month, day] = match;
	const name = MONTHS[Number(month) - 1];
	if (!name) return iso ?? "";
	return `${Number(day) === 1 ? "1er" : Number(day)} ${name} ${year}`;
}

/** Natures que l'API écrit sans accents ni traits d'union (`ARRETE`, `DECRET_LOI`…), avec leur forme correcte. */
const NATURES: Record<string, string> = {
	ARRETE: "Arrêté",
	DECRET: "Décret",
	DECRET_LOI: "Décret-loi",
	DECISION: "Décision",
	DECISION_CC: "Décision du Conseil constitutionnel",
	DECLARATION: "Déclaration",
	DELIBERATION: "Délibération",
	LOI_CONSTIT: "Loi constitutionnelle",
	ACCORD_FONCTION_PUBLIQUE: "Accord de la fonction publique",
	REGLEMENTEUROPEEN: "Règlement européen",
	DIRECTIVE_EURO: "Directive européenne",
	RECOMMANDATION: "Recommandation",
	MEMOIRE: "Mémoire",
	ELECTIONDUPRESIDENTDELAREPUBLIQU: "Élection du Président de la République",
	INFORMATIONS_PARLEMENTAIRES: "Informations parlementaires",
	RELEVE: "Relevé",
};

/** « LOI_ORGANIQUE » ou « décret-loi » → « Loi organique », « Décret-loi » : accents rétablis pour les natures connues, sinon première lettre en capitale et le reste en minuscules. */
export function natureLabel(nature: string | null | undefined) {
	const key = (nature ?? "").trim().replace(/[\s-]+/g, "_").toUpperCase();
	if (NATURES[key]) return NATURES[key];
	const text = (nature ?? "").replace(/_/g, " ").trim().toLowerCase();
	return text ? text[0].toUpperCase() + text.slice(1) : "";
}

/** Minuscules sans accents, caractère par caractère, avec la position de chaque caractère d'origine : les correspondances se reportent sur le texte tel qu'il est écrit. */
function fold(text: string) {
	let folded = "";
	const origin: number[] = [];
	for (let i = 0; i < text.length; i++) {
		for (const char of text[i].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()) {
			folded += char;
			origin.push(i);
		}
	}
	return { folded, origin };
}

/** Occurrences de `query` dans `text`, sans tenir compte de la casse ni des accents : positions `[début, fin[` dans `text`. */
export function findInText(text: string, query: string): { start: number; end: number }[] {
	const wanted = fold(query.trim()).folded;
	if (!wanted) return [];
	const { folded, origin } = fold(text);
	const found: { start: number; end: number }[] = [];
	for (let at = folded.indexOf(wanted); at >= 0; at = folded.indexOf(wanted, at + wanted.length)) {
		found.push({ start: origin[at], end: origin[at + wanted.length - 1] + 1 });
	}
	return found;
}
