/**
 * Lecture des résultats d'une recherche de textes (lois, décrets…) cités par leur seule date. Module pur.
 */
import { CitedDate, matchesDate, plain, titleDates } from "./dates";

/** Titre d'un résultat de recherche, avec les balises de surlignage (`<mark>`) que l'API y met. */
export interface TitleResult {
	titles?: { id?: string; cid?: string; title?: string }[];
}

/** Titre sans balises : l'API surligne les termes cherchés (`du <mark>11 février 2005</mark>`). */
export const stripMarks = (title: string) => title.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/**
 * Textes dont le titre commence par la nature citée (« décret », « loi ») et porte la date citée, sans doublon
 * (identifiant du texte). Une date peut être celle de plusieurs textes (plusieurs décrets le même jour) : tous
 * sont rendus, c'est à l'appelant de ne retenir que l'unique ou de faire choisir. La nature se compare sans accents
 * (« décret » et « Decret ») : les titres sont comparés sans accents.
 */
export function datedTextMatches(results: TitleResult[], nature: string, cited: CitedDate) {
	const found = new Map<string, { id: string; title: string }>();
	for (const result of results) {
		for (const title of result.titles ?? []) {
			const label = stripMarks(title.title ?? "");
			const id = title.cid || title.id;
			if (id && !found.has(id) && plain(label).startsWith(plain(nature)) && titleDates(label).some((d) => matchesDate(cited, d))) found.set(id, { id, title: label });
		}
	}
	return [...found.values()];
}
