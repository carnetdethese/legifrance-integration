/**
 * Dates des citations juridiques (« 7 juillet 1950 », « 7 juill. 1950 », « 2006 ») et des titres
 * de Légifrance (« 26/01/2023 », « du 7 juillet 1950 »). Module pur.
 */

/** Mois, entier ou abrégé → numéro (minuscules, sans accents). */
const MONTH_NAMES = [
	"janvier janv", "fevrier fevr", "mars", "avril avr", "mai", "juin",
	"juillet juill juil", "aout", "septembre sept", "octobre oct", "novembre nov", "decembre dec",
];
const MONTH_NUMBERS = new Map(MONTH_NAMES.flatMap((names, i) => names.split(" ").map((n): [string, number] => [n, i + 1])));

/** Motif d'un mois, entier ou abrégé (accents tolérés). */
export const MONTH_PATTERN =
	"janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|janv|févr|fevr|avr|juill|juil|sept|oct|nov|déc|dec";

/** Motif d'une date complète : « 21 décembre 2001 », « 1er août 2019 », « 7 juill. 1950 ». */
export const FULL_DATE_PATTERN = `\\d{1,2}(?:er)?\\s+(?:${MONTH_PATTERN})\\.?\\s+\\d{4}`;

/** Minuscules sans accents : « Société Générale » et « societe generale » se comparent égaux. */
export const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** Date citée : le jour et le mois manquent quand seule l'année est donnée. */
export interface CitedDate {
	day?: number;
	month?: number;
	year: number;
}

/** Lit « 7 juillet 1950 », « 7 juill. 1950 » ou « 2006 » ; `null` si ce n'est pas une date. */
export function parseCitedDate(text: string): CitedDate | null {
	// Date normalisée (AAAA-MM-JJ, AAAA-MM ou AAAA), telle que le parseur la conserve.
	const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(text.trim());
	if (iso) return { year: Number(iso[1]), ...(iso[2] && { month: Number(iso[2]) }), ...(iso[3] && { day: Number(iso[3]) }) };
	const monthYear = plain(text).match(/^([a-z]+)\.?\s+(\d{4})$/);
	if (monthYear && MONTH_NUMBERS.has(monthYear[1])) return { month: MONTH_NUMBERS.get(monthYear[1]), year: Number(monthYear[2]) };
	const full = plain(text).match(/(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})/);
	if (full) {
		const month = MONTH_NUMBERS.get(full[2]);
		return month ? { day: Number(full[1]), month, year: Number(full[3]) } : null;
	}
	const year = text.match(/\b(\d{4})\b/);
	return year ? { year: Number(year[1]) } : null;
}

/** La date `other` (jour, mois, année) est-elle celle de la citation (l'année seule suffit si le jour manque) ? */
export function matchesDate(cited: CitedDate, other: CitedDate) {
	return cited.year === other.year && (cited.day === undefined || (cited.day === other.day && cited.month === other.month));
}

/** Dates figurant dans un titre : « 26/01/2023 » (décisions récentes) ou « du 7 juillet 1950 ». */
export function titleDates(title: string): CitedDate[] {
	const text = plain(title);
	const dates: CitedDate[] = [];
	for (const [, d, m, y] of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
		dates.push({ day: Number(d), month: Number(m), year: Number(y) });
	}
	for (const [, d, name, y] of text.matchAll(/\b(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})\b/g)) {
		const month = MONTH_NUMBERS.get(name);
		if (month) dates.push({ day: Number(d), month, year: Number(y) });
	}
	return dates;
}

/** Jour de la citation au format `AAAA-MM-JJ` (facettes de date de l'API), ou `null` si incomplet. */
export const isoDay = (date: CitedDate) =>
	date.day && date.month
		? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
		: null;

/** Mots significatifs d'un nom de parties (« M. Hoffmann » → « hoffmann »), pour les retrouver dans un extrait. */
export const significantWords = (name: string) =>
	plain(name).split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word));

/** Mots qui ne désignent pas une partie (« Fédération X et autres », « Consorts Y ») et manquent souvent des extraits. */
const GENERIC_WORDS = new Set(["autres", "autre", "consorts", "epoux", "contre", "ministre", "ministere"]);
