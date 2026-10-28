/**
 * Titres des décisions de la Revue générale du droit (« Tribunal des conflits, 8 février 1873, Blanco,
 * requête numéro 00012, publié au recueil »). Module pur.
 */
import { CitedDate, FULL_DATE_PATTERN, isoDay, parseCitedDate } from "./dates";
import type { CourtCode } from "./fiches";

export interface RgdTitle {
	/** Juridiction telle que le titre l'écrit (« Conseil d'Etat, Section »). */
	court: string;
	courtCode?: CourtCode;
	/** AAAA-MM-JJ */
	date?: string;
	name: string;
	number?: string;
}

/** Juridiction désignée par le début d'un titre, parmi celles que le plugin connaît. */
function courtOf(label: string): CourtCode | undefined {
	if (/^tribunal des conflits/i.test(label)) return "tc";
	if (/^conseil d.[ée]tat/i.test(label)) return "ce";
	if (/^cour de cassation|^cass\b/i.test(label)) return "cassation";
	if (/^conseil constitutionnel/i.test(label)) return "cc";
	return undefined;
}

/** Lit le titre d'une décision de la Revue ; `undefined` s'il n'a pas la forme « juridiction, date, parties… ». */
export function parseRgdTitle(title: string): RgdTitle | undefined {
	const clean = title.replace(/&#8217;|&rsquo;/g, "'").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
	const m = new RegExp(`^(.+?),\\s*(${FULL_DATE_PATTERN}),\\s*(.+)$`, "i").exec(clean);
	if (!m) return undefined;
	const [, court, dateText, rest] = m;
	const [name, ...tail] = rest.split(/,\s*(?:requête numéro|requête n°|req\. n°|aff\.?\s*n°|n°)\s*/i);
	const number = /^[\w/.-]+/.exec(tail.join(" ").trim())?.[0];
	const cited: CitedDate | null = parseCitedDate(dateText);
	// Le nom s'arrête avant la mention de publication (« publié au recueil », « rec. p. 30 »).
	const cleanName = name.replace(/,\s*(?:publié|inédit|mentionné|rec\.).*$/i, "").trim();
	return { court, courtCode: courtOf(court), date: (cited && isoDay(cited)) || undefined, name: cleanName, number };
}

/** Numéro comparé sans zéros de tête, espaces ni points : « 00012 » et « 12 » sont le même. */
export const bareCaseNumber = (number: string) => number.toLowerCase().replace(/[\s.]/g, "").replace(/^0+(?=\d)/, "");
