/**
 * Décisions pour la chronologie et la table des décisions d'une note : fiche d'une décision
 * (`DecisionRecord`), filtres et mise en forme. Module pur.
 */
import { titleDates } from "./dates";
import type { Signatures } from "./merge";
import { THEME_SEPARATOR, themeKey, topTheme } from "./themes";

/** Décision connue de la base : citée dans le coffre, enrichie ou non, avec sa fiche si elle existe. */
export interface DecisionRecord {
	/** Identifiant Légifrance ou, à défaut, clef de la première référence. */
	id: string;
	label: string;
	/** Nom usuel (noms des parties : « Couitéas »), tel que les notes le citent ou que la fiche le nomme. */
	name?: string;
	title?: string;
	court?: string;
	number?: string;
	/** AAAA-MM-JJ, AAAA-MM ou AAAA (date citée). */
	date?: string;
	formation?: string;
	solution?: string;
	themes: string[];
	summary?: string;
	/** Texte intégral récupéré. */
	complete: boolean;
	/** Notes qui citent la décision. */
	notes: string[];
	/** Citations telles que les notes les écrivent (« CE, 1923, Couitéas »). */
	cited?: string[];
	/** Indices de rapprochement (numéros, noms et dates) relevés dans les citations et la fiche ; voir `mergeAliases`. */
	signs?: Signatures;
	/** Note de la fiche, si elle existe. */
	fichePath?: string;
	url?: string;
	/** Clefs des références (dans `refs`) regroupées dans cette décision : celles des citations des notes. */
	refKeys?: string[];
	/** Identifiants de toutes les références regroupées dans cette décision (la sienne comprise) ; voir `mergeAliases`. */
	members?: string[];
}

export interface TimelineFilter {
	/** Thème de plus haut niveau. */
	theme?: string;
	/** Note qui cite la décision. */
	note?: string;
	/** Notes admises (par exemple celles qui portent une étiquette). */
	notes?: Set<string>;
	court?: string;
}

/** Une année plausible pour une décision : après la Révolution, pas dans le futur. */
const plausibleYear = (year: number) => year >= 1789 && year <= new Date().getFullYear();

/**
 * Année d'une décision du Conseil constitutionnel d'après son numéro (« 2018-765 DC » : 2018 ;
 * « 71-44 DC » : 1971), à défaut de date. Les numéros à deux chiffres sont ceux d'avant 2000. Un
 * numéro qui n'est pas de la forme année-ordre (« 30-09 L », « 3012-647 DC » : faute de frappe) ne
 * donne rien.
 */
export function ccYear(number?: string) {
	const match = /^(\d{2,4})-\d+/.exec(number?.trim() ?? "");
	if (!match) return undefined;
	const year = Number(match[1]);
	if (match[1].length === 4) return year >= 1958 && plausibleYear(year) ? String(year) : undefined;
	return year >= 58 && year <= 99 ? String(1900 + year) : undefined;
}

/** Libellé débarrassé du HTML et de la mise en forme Markdown (« M<sup>me</sup> », « *Arcelor* »). */
export const cleanLabel = (label: string) =>
	label.replace(/<[^>]+>/g, "").replace(/[*_]{1,3}/g, "").replace(/\s+/g, " ").trim();

/**
 * Date lue dans la citation telle qu'elle est écrite (« CE, 9 juil. 2010, n° 338977 ») : le jour
 * complet si on le trouve, sinon une année isolée.
 */
export function dateFromLabel(label: string) {
	const text = cleanLabel(label);
	const full = titleDates(text).find((d) => d.day && d.month && plausibleYear(d.year));
	if (full) return `${full.year}-${String(full.month).padStart(2, "0")}-${String(full.day).padStart(2, "0")}`;
	const year = Number(/\b(1[789]\d{2}|20\d{2})\b/.exec(text)?.[1]);
	return year && plausibleYear(year) ? String(year) : undefined;
}

/** La plus précise de deux dates partielles (AAAA-MM-JJ > AAAA-MM > AAAA). */
export const betterDate = (a?: string, b?: string) => ((b?.length ?? 0) > (a?.length ?? 0) ? b : a);

/**
 * Thèmes de plus haut niveau des décisions, avec leur effectif. Les variantes d'un même thème
 * (« Responsabilité… » et « responsabilite… », accents ou casse différents) sont regroupées sous la
 * forme la plus soignée : avec accents, puis la plus fréquente.
 */
export function themeCounts(records: DecisionRecord[]) {
	const groups = new Map<string, { count: number; variants: Map<string, number> }>();
	for (const record of records) {
		const tops = new Map(record.themes.map((t) => [themeKey(topTheme(t)), topTheme(t)]));
		for (const [key, label] of tops) {
			const group = groups.get(key) ?? { count: 0, variants: new Map() };
			group.count++;
			group.variants.set(label, (group.variants.get(label) ?? 0) + 1);
			groups.set(key, group);
		}
	}
	const accented = (text: string) => /\p{M}|[^\p{ASCII}]/u.test(text);
	return [...groups.values()]
		.map(({ count, variants }): [string, number] => [[...variants].sort((a, b) => Number(accented(b[0])) - Number(accented(a[0])) || b[1] - a[1])[0][0], count])
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function filterRecords(records: DecisionRecord[], filter: TimelineFilter) {
	return records.filter(
		(r) =>
			(!filter.theme || r.themes.some((t) => themeKey(topTheme(t)) === themeKey(filter.theme!))) &&
			(!filter.note || r.notes.includes(filter.note)) &&
			(!filter.notes || r.notes.some((n) => filter.notes!.has(n))) &&
			(!filter.court || r.court === filter.court)
	);
}

/** Clef de tri chronologique : les dates partielles se placent au début de leur période. */
const sortKey = (date: string) => {
	const [year, month = "01", day = "01"] = date.split("-");
	return `${year}-${month}-${day}`;
};
export const byDate = (a: DecisionRecord, b: DecisionRecord) => sortKey(a.date ?? "9999").localeCompare(sortKey(b.date ?? "9999")) || a.label.localeCompare(b.label);

/** Décisions datées, par année croissante ; les décisions sans date sont renvoyées à part. */
export function groupByYear(records: DecisionRecord[]) {
	const years = new Map<string, DecisionRecord[]>();
	const undated: DecisionRecord[] = [];
	for (const record of [...records].sort(byDate)) {
		const year = record.date?.slice(0, 4);
		if (!year) undated.push(record);
		else years.set(year, [...(years.get(year) ?? []), record]);
	}
	return { years: [...years].map(([year, items]) => ({ year, items })), undated };
}

/** « 2021-06-09 » → « 09/06/2021 » ; les dates partielles restent partielles. */
export function displayDate(date?: string) {
	if (!date) return "";
	const [y, m, d] = date.split("-");
	return d ? `${d}/${m}/${y}` : m ? `${m}/${y}` : y;
}

/**
 * Table Markdown des décisions : une ligne par décision, par date. Une fiche est liée par un lien
 * interne, sinon la décision par son adresse Légifrance.
 * @param link lien interne vers une note (`[[…]]`) pour le chemin donné.
 */
export function decisionsTable(records: DecisionRecord[], link: (path: string, alias: string) => string) {
	const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
	const rows = [...records].sort(byDate).map((r) => {
		const name = cell(r.title ?? r.label);
		const target = r.fichePath ? link(r.fichePath, name) : r.url ? `[${name}](${r.url})` : name;
		const theme = r.themes[0] ? cell(topTheme(r.themes[0])) : "";
		return `| ${displayDate(r.date)} | ${cell(r.court ?? "")} | ${target} | ${theme} | ${cell(r.solution ?? "")} |`;
	});
	return ["| Date | Juridiction | Décision | Thème | Solution |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
}

export { THEME_SEPARATOR };

/** Mots d'un titre de note en casse mixte (« communeHyeres1988 » : « commune Hyeres »), sans l'année finale. */
export function nameFromNote(basename: string) {
	const words = basename
		.replace(/[-_\s]*(?:1[789]|20)\d{2}$/, "")
		.replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, "$1 $2")
		.replace(/[-_]+/g, " ")
		.trim();
	return words ? words[0].toUpperCase() + words.slice(1) : undefined;
}

/** Nom d'une note de fiche à la façon du coffre : parties et année, en casse mixte (« couiteas1923 », « communeHyeres1988 »). */
export function ficheFileName(record: DecisionRecord) {
	const words = record.name?.normalize("NFD").replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	const year = record.date?.slice(0, 4);
	if (!words?.length) return undefined;
	return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("") + (year ?? "");
}
