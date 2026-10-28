/**
 * Décisions pour la chronologie et la table des décisions d'une note : fiche d'une décision
 * (`DecisionRecord`), filtres et mise en forme. Module pur.
 */
import { titleDates } from "./dates";
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

/** Nom, date complète ou partielle et juridiction sous lesquels une décision est citée. */
export interface NameSignature {
	/** Juridiction (`courtGroup`). */
	group: string;
	/** AAAA-MM-JJ, AAAA-MM ou AAAA. */
	date: string;
	/** Nom normalisé (voir `normalizedName`). */
	name: string;
}

/** Ce qui permet de reconnaître une décision sous plusieurs formes de citation. */
export interface Signatures {
	/** « juridiction|numéro » : un numéro identifie la décision au sein de sa juridiction. */
	numbers: string[];
	names: NameSignature[];
}

/** Juridictions qui partagent leurs numéros et leur base : le Tribunal des conflits est jugé avec le Conseil d'État. */
export const courtGroup = (court?: string) => (court === "tc" || court === "ce" ? "ce" : court === "cassation" || court === "cc" ? court : undefined);

/** Numéro comparable (« 19-12.345 » = « 1912345 », « 04749 » = « 4749 » : sans points, espaces ni zéros de tête). */
export const numberSignature = (group: string, number: string) => `${group}|${number.toLowerCase().replace(/[\s.]/g, "").replace(/^0+(?=\d)/, "")}`;

/** Ajoute à `target` ce que sait `source` (la même décision, citée autrement). */
function absorb(target: DecisionRecord, source: DecisionRecord) {
	target.name ??= source.name;
	target.refKeys = [...new Set([...(target.refKeys ?? []), ...(source.refKeys ?? [])])];
	target.cited = [...new Set([...(target.cited ?? []), ...(source.cited ?? [])])];
	target.members = [...new Set([...(target.members ?? [target.id]), ...(source.members ?? [source.id])])];
	target.notes = [...new Set([...target.notes, ...source.notes])];
	target.fichePath ??= source.fichePath;
	target.url ??= source.url;
	target.court ??= source.court;
	target.number ??= source.number;
	target.formation ??= source.formation;
	target.solution ??= source.solution;
	target.date = betterDate(target.date, source.date);
	if (source.complete && !target.complete) Object.assign(target, { complete: true, title: source.title, themes: source.themes, summary: source.summary });
}

/** Un nom est celui de l'autre, ou le contient en mots entiers (« Piccoli » et « Piccoli parle de terrains du domaine public »). */
export function compatibleNames(a: string, b: string) {
	if (a === b) return true;
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

/** Identifiant Légifrance : une décision déjà retrouvée par l'API l'emporte comme référence. */
/** Décision dont la source est connue : identifiant Légifrance ou adresse de page (ArianeWeb, Conseil constitutionnel, Revue générale du droit). */
export const RESOLVED_ID = /^(CETATEXT|JURITEXT|CONSTEXT|JORFTEXT|https?:)/;
const LEGIFRANCE_ID = RESOLVED_ID;

/**
 * Rapproche, sans l'API, les références à la même décision écrites de plusieurs façons :
 * - même juridiction et même numéro (« CE, n° 97263 » et la décision « 97263 05822 » de Légifrance) ;
 * - même juridiction, même date complète et noms compatibles (« Despujol » et « Despujol, n° 97263 »,
 *   ou la fiche « Labonne ») ;
 * - citation à l'année seule (« CE, 1919, Labonne est fondamental ») rattachée à l'unique décision de
 *   cette année, de même juridiction, dont le nom est compatible.
 * Rien d'approximatif : un nom ne suffit jamais, il faut la juridiction et la date (ou le numéro).
 * La référence retenue est celle que l'API a retrouvée, sinon la fiche, sinon la plus citée.
 * `manual` : rapprochements décidés par l'utilisateur ([identifiant rapproché, identifiant conservé]) ;
 * ils s'ajoutent aux règles ci-dessus et la référence conservée l'emporte.
 * @returns les décisions, sans les doublons fusionnés (ordre conservé).
 */
export function mergeAliases(records: DecisionRecord[], manual: [alias: string, target: string][] = []): DecisionRecord[] {
	const parent = records.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	const union = (a: number, b: number) => void (parent[find(a)] = find(b));

	// 0. Rapprochements manuels (un identifiant disparu de la base est ignoré).
	const indexOfId = new Map(records.map((record, i) => [record.id, i]));
	for (const [alias, target] of manual) {
		const a = indexOfId.get(alias);
		const b = indexOfId.get(target);
		if (a !== undefined && b !== undefined) union(a, b);
	}
	const chosen = new Set(manual.map(([, target]) => target));

	// 1. Même numéro.
	const byNumber = new Map<string, number>();
	records.forEach((record, i) => {
		for (const number of record.signs?.numbers ?? []) {
			const other = byNumber.get(number);
			if (other === undefined) byNumber.set(number, i);
			else union(i, other);
		}
	});

	// 2. Même juridiction, même jour, noms compatibles.
	const byDay = new Map<string, { i: number; name: string }[]>();
	records.forEach((record, i) => {
		for (const { group, date, name } of record.signs?.names ?? []) {
			if (date.length !== 10) continue;
			const bucket = byDay.get(`${group}|${date}`) ?? [];
			for (const other of bucket) if (compatibleNames(name, other.name)) union(i, other.i);
			bucket.push({ i, name });
			byDay.set(`${group}|${date}`, bucket);
		}
	});

	// 3. Citation à l'année seule : rattachée à l'unique décision de l'année qui lui convient.
	records.forEach((record, i) => {
		for (const { group, date, name } of record.signs?.names ?? []) {
			if (date.length !== 4) continue;
			const candidates = new Set<number>();
			records.forEach((other, j) => {
				if (find(j) === find(i)) return;
				if (other.signs?.names.some((n) => n.group === group && n.date.length === 10 && n.date.startsWith(date) && compatibleNames(n.name, name))) candidates.add(find(j));
			});
			if (candidates.size === 1) union(i, [...candidates][0]);
		}
	});

	const components = new Map<number, DecisionRecord[]>();
	records.forEach((record, i) => components.set(find(i), [...(components.get(find(i)) ?? []), record]));
	const rank = (r: DecisionRecord) => (chosen.has(r.id) ? 8 : 0) + (LEGIFRANCE_ID.test(r.id) ? 4 : 0) + (r.fichePath ? 2 : 0) + (r.complete ? 1 : 0);
	const absorbed = new Set<DecisionRecord>();
	for (const group of components.values()) {
		if (group.length < 2) continue;
		const [primary, ...others] = [...group].sort((a, b) => rank(b) - rank(a) || a.label.length - b.label.length || b.notes.length - a.notes.length);
		for (const other of others) {
			absorb(primary, other);
			absorbed.add(other);
		}
	}
	return records.filter((record) => !absorbed.has(record));
}

/** Rapproche `ids` en une décision (`main` est conservée) : lignes [alias, conservé] à enregistrer. */
export const manualMerges = (ids: string[], main: string): [string, string][] => ids.filter((id) => id !== main).map((id) => [id, main]);

/** Distance d'édition entre deux noms (fautes de frappe : « piccoli » / « piccioli »). */
function editDistance(a: string, b: string) {
	let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		previous = row;
	}
	return previous[b.length];
}

/** Mots trop courants dans les noms de parties pour rapprocher deux décisions. */
const COMMON_WORDS = new Set(["conseil", "commune", "ministre", "societe", "syndicat", "association", "federation", "departement", "compagnie", "generale", "ministere", "france", "republique", "national", "nationale", "etablissement", "etablissements", "centre"]);

const significantWords = (name: string) => name.split(" ").filter((w) => w.length >= 6 && !COMMON_WORDS.has(w));

/** Pourquoi deux noms de la même juridiction et de la même période pourraient désigner la même décision. */
function nameDoubt(a: string, b: string, sameDay: boolean): string | undefined {
	if (compatibleNames(a, b)) return sameDay ? undefined : "même nom la même année, dates différentes";
	if (!sameDay) return undefined;
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	if (short.length >= 5 && editDistance(short, long) <= (short.length >= 10 ? 2 : 1)) return "même jour, noms presque identiques (faute de frappe ?)";
	const shared = significantWords(a).filter((w) => significantWords(b).includes(w));
	return shared.length ? `même jour, nom en commun : ${shared[0]}` : undefined;
}

/** Deux décisions que les règles automatiques n'ont pas rapprochées mais qui y ressemblent. */
export interface MergeSuggestion {
	a: DecisionRecord;
	b: DecisionRecord;
	reason: string;
}

/**
 * Cas litigieux à trancher à la main : paires de décisions de même juridiction et de même année
 * dont les noms sont presque identiques ou ont un mot distinctif en commun (même jour), ou dont le
 * nom est le même à des dates différentes, ou citation à l'année seule qui convient à plusieurs
 * décisions. Aucune ne serait fusionnée sans l'accord de l'utilisateur.
 * @param dismissed paires de suggestions déjà écartées (identifiants des références)
 */
export function suggestMerges(records: DecisionRecord[], dismissed: [string, string][] = []): MergeSuggestion[] {
	const refused = new Set(dismissed.map(([x, y]) => [x, y].sort().join("\u0000")));
	const isDismissed = (a: DecisionRecord, b: DecisionRecord) => (a.members ?? [a.id]).some((x) => (b.members ?? [b.id]).some((y) => refused.has([x, y].sort().join("\u0000"))));

	const buckets = new Map<string, number[]>();
	records.forEach((record, i) => {
		for (const key of new Set((record.signs?.names ?? []).map((n) => `${n.group}|${n.date.slice(0, 4)}`))) buckets.set(key, [...(buckets.get(key) ?? []), i]);
	});

	const found = new Map<string, MergeSuggestion>();
	for (const indexes of buckets.values()) {
		for (let x = 0; x < indexes.length; x++) {
			for (let y = x + 1; y < indexes.length; y++) {
				const [a, b] = [records[indexes[x]], records[indexes[y]]];
				const id = [a.id, b.id].sort().join("\u0000");
				if (found.has(id) || isDismissed(a, b)) continue;
				// Deux numéros différents : deux décisions distinctes.
				const numbersA = a.signs?.numbers ?? [];
				if (numbersA.length && (b.signs?.numbers ?? []).length && !numbersA.some((n) => b.signs!.numbers.includes(n))) continue;
				let reason: string | undefined;
				for (const na of a.signs?.names ?? []) {
					for (const nb of b.signs?.names ?? []) {
						if (na.group !== nb.group || na.date.slice(0, 4) !== nb.date.slice(0, 4)) continue;
						if (na.date.length === 4 || nb.date.length === 4) {
							// Année seule : litigieux seulement si le nom convient aux deux (la règle automatique exige un candidat unique).
							if (compatibleNames(na.name, nb.name) && na.date.length !== nb.date.length) reason ??= "citation à l'année seule qui convient à plusieurs décisions";
							continue;
						}
						reason ??= nameDoubt(na.name, nb.name, na.date === nb.date);
					}
				}
				if (reason) found.set(id, { a, b, reason });
			}
		}
	}
	return [...found.values()];
}

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
