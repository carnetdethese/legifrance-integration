/**
 * Bibliographie des décisions et des textes cités : liste Markdown, tableau CSV, BibTeX et RIS (Zotero,
 * EndNote…). Module pur : les entrées sont construites par l'appelant (`bibliographyOf` dans `insights.ts`).
 */
import { themeKey, topTheme } from "./themes";
import { DecisionRecord, byDate, displayDate } from "./timeline";

export type BibFormat = "markdown" | "csv" | "bibtex" | "ris";

/** Libellé et extension de fichier de chaque format. */
export const BIB_FORMATS: Record<BibFormat, { label: string; extension: string }> = {
	markdown: { label: "Markdown (liste)", extension: "md" },
	csv: { label: "CSV (tableur)", extension: "csv" },
	bibtex: { label: "BibTeX (LaTeX, Zotero)", extension: "bib" },
	ris: { label: "RIS (Zotero, EndNote)", extension: "ris" },
};

/** Une décision ou un texte (article, loi…) de la bibliographie. */
export interface BibEntry {
	kind: "decision" | "texte";
	label: string;
	title?: string;
	court?: string;
	number?: string;
	/** AAAA-MM-JJ, AAAA-MM ou AAAA. */
	date?: string;
	formation?: string;
	solution?: string;
	url?: string;
	/** Statut de vigueur d'un texte (« En vigueur », « Abrogé »…). */
	status?: string;
	/** Nombre de notes qui le citent. */
	notes?: number;
	/** Note de la fiche, pour un lien interne en Markdown. */
	fichePath?: string;
}

/** Entrées des décisions, par date. */
export const decisionEntries = (records: DecisionRecord[]): BibEntry[] =>
	[...records].sort(byDate).map((r) => ({
		kind: "decision",
		label: r.label,
		title: r.title ?? r.name,
		court: r.court,
		number: r.number,
		date: r.date,
		formation: r.formation,
		solution: r.solution,
		url: r.url,
		notes: r.notes.length,
		fichePath: r.fichePath,
	}));

const titleOf = (e: BibEntry) => (e.title ?? e.label).replace(/\s+/g, " ").trim();

// --- Markdown ---------------------------------------------------------------------------------

function markdown(entries: BibEntry[], link: (path: string, alias: string) => string) {
	const line = (e: BibEntry) => {
		const title = titleOf(e);
		const target = e.fichePath ? link(e.fichePath, title) : e.url ? `[${title}](${e.url})` : title;
		const details = e.kind === "decision" ? [displayDate(e.date), e.court, e.number && `n° ${e.number}`] : [e.status];
		const text = details.filter(Boolean).join(", ");
		return `- ${target}${text ? ` (${text})` : ""}`;
	};
	const section = (title: string, kind: BibEntry["kind"]) => {
		const items = entries.filter((e) => e.kind === kind);
		return items.length ? [`### ${title} (${items.length})`, "", ...items.map(line), ""] : [];
	};
	return ["## Bibliographie", "", ...section("Décisions", "decision"), ...section("Textes", "texte")].join("\n").trimEnd();
}

// --- CSV ---------------------------------------------------------------------------------------

const CSV_COLUMNS: [string, (e: BibEntry) => string | number | undefined][] = [
	["type", (e) => (e.kind === "decision" ? "décision" : "texte")],
	["libellé", (e) => e.label],
	["titre", titleOf],
	["juridiction", (e) => e.court],
	["numéro", (e) => e.number],
	["date", (e) => e.date],
	["formation", (e) => e.formation],
	["solution", (e) => e.solution],
	["statut", (e) => e.status],
	["notes", (e) => e.notes],
	["lien", (e) => e.url],
];

const csvCell = (value: string | number | undefined) => {
	const text = String(value ?? "");
	return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csv = (entries: BibEntry[]) =>
	[CSV_COLUMNS.map(([name]) => name).join(","), ...entries.map((e) => CSV_COLUMNS.map(([, get]) => csvCell(get(e))).join(","))].join("\n");

// --- BibTeX ------------------------------------------------------------------------------------

/** Caractères réservés de LaTeX, échappés dans les valeurs. */
const texEscape = (text: string) => text.replace(/[&%$#_]/g, (c) => `\\${c}`).replace(/[{}]/g, "").replace(/\s+/g, " ").trim();

/** Clef BibTeX : lettres et chiffres du libellé, suivis de l'année ; un doublon reçoit une lettre. */
function bibKeys(entries: BibEntry[]) {
	const used = new Map<string, number>();
	return entries.map((e) => {
		const base = (titleOf(e).normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "").slice(0, 24) || "ref") + (e.date?.slice(0, 4) ?? "");
		const n = used.get(base) ?? 0;
		used.set(base, n + 1);
		return n ? `${base}${String.fromCharCode(96 + n)}` : base;
	});
}

function bibtex(entries: BibEntry[]) {
	const keys = bibKeys(entries);
	return entries
		.map((e, i) => {
			const [year, month] = (e.date ?? "").split("-");
			const fields: [string, string | undefined][] = [
				["title", titleOf(e)],
				["author", e.court],
				["year", year],
				["month", month],
				["number", e.number],
				["note", [e.formation, e.solution, e.status].filter(Boolean).join(" ; ") || undefined],
				["url", e.url],
			];
			const body = fields.filter(([, value]) => value).map(([name, value]) => `  ${name} = {${name === "url" ? value : texEscape(value!)}}`);
			return `@misc{${keys[i]},\n${body.join(",\n")}\n}`;
		})
		.join("\n\n");
}

// --- RIS ---------------------------------------------------------------------------------------

/** « AAAA-MM-JJ » au format RIS « AAAA/MM/JJ/ » (les parties absentes restent vides). */
const risDate = (date: string) => {
	const [y, m = "", d = ""] = date.split("-");
	return `${y}/${m}/${d}/`;
};

function ris(entries: BibEntry[]) {
	const keys = bibKeys(entries);
	return entries
		.map((e, i) => {
			const lines: [string, string | undefined][] = [
				["TY", e.kind === "decision" ? "CASE" : "STAT"],
				["ID", keys[i]],
				["TI", titleOf(e)],
				["PB", e.court],
				["PY", e.date?.slice(0, 4)],
				["DA", e.date && risDate(e.date)],
				["M1", e.number],
				["N1", [e.formation, e.solution, e.status].filter(Boolean).join(" ; ") || undefined],
				["UR", e.url],
			];
			return [...lines.filter(([, value]) => value).map(([tag, value]) => `${tag}  - ${value}`), "ER  - "].join("\n");
		})
		.join("\n\n");
}

/**
 * Bibliographie dans le format demandé.
 * @param link lien interne vers une fiche (`[[…]]`), pour le Markdown seulement
 */
export function formatBibliography(entries: BibEntry[], format: BibFormat, link: (path: string, alias: string) => string = (_, alias) => alias) {
	switch (format) {
		case "markdown":
			return markdown(entries, link);
		case "csv":
			return csv(entries);
		case "bibtex":
			return bibtex(entries);
		case "ris":
			return ris(entries);
	}
}

/** Restriction d'un export aux décisions d'un thème ou d'une période (années, bornes comprises). */
export interface BibFilter {
	theme?: string;
	from?: string;
	to?: string;
}

export const isFiltered = (filter: BibFilter) => !!(filter.theme || filter.from || filter.to);

/** Les décisions de `records` qui répondent au filtre ; une décision sans date est écartée dès qu'une borne est donnée. */
export function filterDecisions(records: DecisionRecord[], { theme, from, to }: BibFilter) {
	return records.filter((r) => {
		if (theme && !r.themes.some((t) => themeKey(topTheme(t)) === themeKey(theme))) return false;
		const year = r.date?.slice(0, 4);
		if ((from || to) && !year) return false;
		return (!from || year! >= from.trim()) && (!to || year! <= to.trim());
	});
}

