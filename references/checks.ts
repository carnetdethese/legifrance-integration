/**
 * Contrôle des citations : ce qu'une note écrit d'une décision (date, numéro) face à la décision que
 * la base a retrouvée. Module pur.
 */
import { CitedDate, parseCitedDate } from "./dates";

/** Une citation de décision et la décision complète qui lui correspond. */
export interface CitationCheck {
	key: string;
	label: string;
	court?: string;
	/** Date citée (« 8 août 1919 », « 1919 », AAAA-MM-JJ). */
	decided?: string;
	/** Numéro cité. */
	number?: string;
	/** Date (AAAA-MM-JJ) et numéro(s) de la décision retrouvée. */
	actualDate?: string | null;
	actualNumber?: string | null;
	notes: string[];
}

/** Ce qui ne correspond pas dans une citation. */
export interface CitationIssue {
	key: string;
	label: string;
	notes: string[];
	problems: string[];
}

/** Numéro comparable : sans espaces, points ni tirets, sans zéros de tête ; au Conseil constitutionnel, sans le type (« DC », « QPC »). */
const comparable = (number: string, court?: string) => {
	const bare = number.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^0+(?=\d)/, "");
	return court === "cc" ? bare.replace(/[a-z]+$/, "") : bare;
};

/** Les dates citée et réelle diffèrent-elles ? (le jour et le mois ne comptent que s'ils sont cités) */
const differs = (cited: CitedDate, actual: CitedDate) =>
	cited.year !== actual.year || (cited.month !== undefined && actual.month !== undefined && cited.month !== actual.month) || (cited.day !== undefined && actual.day !== undefined && cited.day !== actual.day);

const frenchDate = (iso: string) => iso.split("-").reverse().join("/");

/** Citations dont la date ou le numéro ne sont pas ceux de la décision retrouvée. */
export function citationIssues(checks: CitationCheck[]): CitationIssue[] {
	const issues: CitationIssue[] = [];
	for (const check of checks) {
		const problems: string[] = [];

		const cited = check.decided ? parseCitedDate(check.decided) : null;
		const actual = check.actualDate ? parseCitedDate(check.actualDate) : null;
		if (cited && actual && differs(cited, actual)) problems.push(`date citée : ${check.decided} ; décision du ${frenchDate(check.actualDate!.slice(0, 10))}`);

		if (check.number && check.actualNumber) {
			// « 97263 05822 » : plusieurs requêtes jointes.
			const actualNumbers = check.actualNumber.split(/[\s,;]+/).filter((n) => /\d/.test(n));
			const wanted = comparable(check.number, check.court);
			if (!actualNumbers.some((n) => comparable(n, check.court) === wanted) && comparable(check.actualNumber, check.court) !== wanted) {
				problems.push(`numéro cité : ${check.number} ; décision n° ${check.actualNumber}`);
			}
		}

		if (problems.length) issues.push({ key: check.key, label: check.label, notes: check.notes, problems });
	}
	return issues.sort((a, b) => b.notes.length - a.notes.length || a.label.localeCompare(b.label));
}
