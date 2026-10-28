/**
 * Fiches de décisions : notes du coffre dont les propriétés (frontmatter) décrivent une décision de
 * justice. Une fiche est reconnue à la présence d'une propriété choisie par l'utilisateur ; elle est
 * liée à une décision par son identifiant Légifrance (jamais par une correspondance approximative).
 * Module indépendant d'Obsidian : le plugin fournit le frontmatter et applique les modifications.
 */
import type { LegifranceSettings } from "settings/settings";
import { legifranceUrl } from "api/urls";
import { decisionKey, parseAriaKey, parseCcSiteKey } from "./ids";
import { parseReferences } from "./parser";

/** Champs de la décision que l'API permet de renseigner dans une propriété. */
export type FicheField = "date" | "court" | "formation" | "title" | "number" | "ecli" | "solution" | "url";

export const FICHE_FIELDS: Record<FicheField, string> = {
	date: "Date",
	court: "Juridiction",
	formation: "Formation",
	title: "Intitulé",
	number: "Numéro",
	ecli: "ECLI",
	solution: "Solution",
	url: "Lien Légifrance",
};

/** Une propriété de la fiche et le champ de l'API qui la renseigne. */
export interface FicheMapping {
	property: string;
	field: FicheField;
}

/** Valeurs de la décision, telles que l'API les donne (champs absents : `undefined`). */
export type DecisionValues = Partial<Record<FicheField, string>>;

type FicheSettings = Pick<
	LegifranceSettings,
	"ficheProperty" | "ficheIdProperty" | "ficheMapping" | "ficheOverwrite" | "ficheNumberProperty" | "ficheNameProperty" | "ficheCitationProperty"
>;
export type Frontmatter = Record<string, unknown> | null | undefined;

/** Propriété absente ou vide. */
const isEmpty = (value: unknown) =>
	value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);

/** Cette note est-elle une fiche de décision ? (elle contient la propriété choisie, même vide) */
export function isFiche(frontmatter: Frontmatter, settings: FicheSettings) {
	const property = settings.ficheProperty.trim();
	return !!frontmatter && property !== "" && property in frontmatter;
}

/**
 * Clef de la décision (identifiant Légifrance ou adresse ArianeWeb) : propriété dédiée, sinon identifiant contenu dans la
 * propriété qui reçoit le lien Légifrance.
 */
export function ficheId(frontmatter: Frontmatter, settings: FicheSettings) {
	if (!frontmatter) return undefined;
	const properties = [settings.ficheIdProperty, ...settings.ficheMapping.filter((m) => m.field === "url").map((m) => m.property)];
	for (const property of properties) {
		const value = property.trim() ? frontmatter[property.trim()] : undefined;
		const id = typeof value === "string" ? decisionKey(value) : undefined;
		if (id) return id;
	}
	return undefined;
}

/** Correspondances dont la propriété est absente ou vide dans la fiche. */
export const missingProperties = (frontmatter: Frontmatter, settings: FicheSettings) =>
	settings.ficheMapping.filter((m) => m.property.trim() && isEmpty(frontmatter?.[m.property.trim()]));

/** Nombre de propriétés que le bouton « Compléter » peut renseigner (identifiant compris). */
export function completableCount(frontmatter: Frontmatter, settings: FicheSettings) {
	const idProperty = settings.ficheIdProperty.trim();
	const idMissing = idProperty !== "" && isEmpty(frontmatter?.[idProperty]);
	return missingProperties(frontmatter, settings).length + (idMissing ? 1 : 0);
}

/**
 * Propriétés à écrire dans la fiche d'après les valeurs de l'API : celles qui sont vides, ou toutes
 * si `ficheOverwrite`. L'identifiant Légifrance est toujours enregistré (propriété dédiée) : c'est lui
 * qui lie la fiche aux décisions citées.
 */
export function ficheUpdates(frontmatter: Frontmatter, settings: FicheSettings, values: DecisionValues, id: string) {
	const updates: Record<string, string> = {};
	const writable = (property: string) => settings.ficheOverwrite || isEmpty(frontmatter?.[property]);

	const idProperty = settings.ficheIdProperty.trim();
	if (idProperty && frontmatter?.[idProperty] !== id && writable(idProperty)) updates[idProperty] = id;

	for (const { property, field } of settings.ficheMapping) {
		const name = property.trim();
		const value = values[field]?.trim();
		if (name && value && frontmatter?.[name] !== value && writable(name)) updates[name] = value;
	}
	return updates;
}

// --- Recherche de la décision d'une fiche sans identifiant --------------------------------------

/** Juridictions que les sources savent interroger. */
export type CourtCode = "ce" | "tc" | "cassation" | "cc";

export const COURT_NAMES: Record<CourtCode, string> = {
	ce: "Conseil d'État",
	tc: "Tribunal des conflits",
	cassation: "Cour de cassation",
	cc: "Conseil constitutionnel",
};

/** Juridiction désignée par un texte libre (« Conseil d'État », « Cass. crim. »), ou `undefined`. */
export function courtCode(text: unknown): CourtCode | undefined {
	if (typeof text !== "string") return undefined;
	const t = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[’']/g, "'");
	if (/conseil d'etat|^ce\b/.test(t)) return "ce";
	if (/tribunal des conflits|^tc\b/.test(t)) return "tc";
	if (/cassation|^cass\b/.test(t)) return "cassation";
	if (/conseil constitutionnel|^cc\b/.test(t)) return "cc";
	return undefined;
}

/** Ce que la fiche permet de chercher : n° de la décision (pourvoi), nom, date, juridiction. */
export interface DecisionQuery {
	court?: CourtCode;
	number?: string;
	name?: string;
	/** AAAA-MM-JJ */
	date?: string;
}

/** Date d'une propriété au format AAAA-MM-JJ (ou JJ/MM/AAAA), sinon `undefined`. */
function isoDate(value: unknown) {
	if (typeof value !== "string") return undefined;
	const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
	if (iso) return iso[1];
	const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
	return french ? `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}` : undefined;
}

const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

/**
 * Éléments de recherche de la fiche. Numéro, nom et citation se lisent dans une ou plusieurs
 * propriétés (séparées par des virgules) : la première renseignée l'emporte, les fiches n'étant pas
 * toujours uniformes (« numero » ici, « décision » là). Le numéro se lit à défaut dans la citation,
 * comme dans les notes. Juridiction et date viennent des propriétés qui reçoivent ces champs (à
 * défaut, la propriété qui désigne les fiches pour la juridiction).
 */
export function ficheQuery(frontmatter: Frontmatter, settings: FicheSettings): DecisionQuery {
	const get = (property: string) => (property.trim() ? frontmatter?.[property.trim()] : undefined);
	/** Première valeur renseignée d'une liste de propriétés séparées par des virgules. */
	const firstFilled = (properties: string) => properties.split(",").map((property) => text(get(property))).find(Boolean) ?? "";
	const mapped = (field: FicheField) => settings.ficheMapping.find((m) => m.field === field)?.property ?? "";

	let court = courtCode(get(mapped("court")) ?? get(settings.ficheProperty));
	let number = firstFilled(settings.ficheNumberProperty).replace(/^n\s*°\s*/i, "");
	if (!number) {
		const cited = parseReferences(firstFilled(settings.ficheCitationProperty)).find((ref) => ref.kind === "decision" && ref.data.number);
		if (cited) {
			number = cited.data.number;
			court ??= courtCode(COURT_NAMES[cited.data.court as CourtCode]);
		}
	}
	return { court, number: number || undefined, name: firstFilled(settings.ficheNameProperty) || undefined, date: isoDate(get(mapped("date"))) };
}

/** Ce que la fiche dit de sa décision, d'après la correspondance des propriétés (date au format AAAA-MM-JJ). */
export function ficheValues(frontmatter: Frontmatter, settings: FicheSettings): DecisionValues {
	const values: DecisionValues = {};
	for (const { property, field } of settings.ficheMapping) {
		const name = property.trim();
		const value = name ? (field === "date" ? isoDate(frontmatter?.[name]) : text(frontmatter?.[name])) : undefined;
		if (value && !values[field]) values[field] = value;
	}
	return values;
}

/** Valeurs d'une décision d'ArianeWeb, tirées de son adresse (date, numéro et juridiction y figurent). */
export function ariaValues(key: string): DecisionValues {
	const parts = parseAriaKey(key);
	if (!parts) return {};
	const [y, m, d] = parts.date.split("-");
	const court = parts.court === "TC" ? COURT_NAMES.tc : COURT_NAMES.ce;
	return { date: parts.date, court, number: parts.number, title: `${court}, ${d}/${m}/${y}, n° ${parts.number}`, url: key };
}

/** Valeurs d'une décision du Conseil constitutionnel connue par le Journal officiel ou le site du Conseil (sans texte lu : seul le numéro de la page du site est connu). */
export function ccValues(key: string): DecisionValues {
	const site = parseCcSiteKey(key);
	return { court: COURT_NAMES.cc, url: key.startsWith("http") ? key : legifranceUrl(key), ...(site && { number: site.number, title: `Conseil constitutionnel, décision n° ${site.number}` }) };
}

// --- Écarts entre une fiche et Légifrance ------------------------------------------------------

/** Une propriété de la fiche qui diffère de ce que dit Légifrance. */
export interface FicheDifference {
	property: string;
	field: FicheField;
	current: string;
	expected: string;
}

const plainText = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
/** Numéro comparé sans espaces, points, tirets, « n° » ni zéros de tête : « 19-12.345 » et « 1912345 », « 4749 » et « 04749 » sont le même. */
const bareNumber = (value: string) => plainText(value).replace(/^n\s*°\s*/, "").replace(/[\s.-]/g, "").replace(/^0+(?=\d)/, "");

const ORDINALS: [RegExp, string][] = [[/\bpremiere?\b/g, "1"], [/\bdeuxieme\b/g, "2"], [/\btroisieme\b/g, "3"], [/\bquatrieme\b/g, "4"], [/\bcinquieme\b/g, "5"], [/\bsixieme\b/g, "6"], [/\bseptieme\b/g, "7"], [/\bhuitieme\b/g, "8"], [/\bneuvieme\b/g, "9"], [/\bdixieme\b/g, "10"]];
const FORMATION_KINDS: [RegExp, string][] = [[/\b(?:reunies?|ssr)\b/, "reunies"], [/\b(?:civile?|civ)\b/, "civile"], [/\b(?:criminelle|crim)\b/, "criminelle"], [/\b(?:commerciale|com)\b/, "commerciale"], [/\b(?:sociale|soc)\b/, "sociale"], [/\bplenieres?\b/, "pleniere"], [/\bmixte\b/, "mixte"]];

/**
 * Une formation de jugement sous une forme comparable : « 2ème et 7ème sous-sections réunies »,
 * « 7ème - 2ème chambres réunies » et « 7 / 2 SSR » sont la même (mêmes numéros, réunis), tout comme
 * « Section » et « SECTION DU CONTENTIEUX ».
 */
export function formationKey(value: string) {
	let text = plainText(value);
	for (const [pattern, number] of ORDINALS) text = text.replace(pattern, number);
	const numbers = [...text.matchAll(/\d+/g)].map((m) => Number(m[0])).sort((a, b) => a - b);
	const kinds = FORMATION_KINDS.filter(([pattern]) => pattern.test(text)).map(([, kind]) => kind);
	if (numbers.length || kinds.length) return `${numbers.join(",")}|${kinds.join(",")}`;
	return text.replace(/\b(?:du|de|des|la|le|les|contentieux)\b/g, " ").replace(/[^a-z]+/g, " ").trim();
}

/** Champs comparés (pas l'intitulé ni le lien, dont la forme varie) et façon de les comparer. */
const COMPARED: Partial<Record<FicheField, (a: string, b: string) => boolean>> = {
	date: (a, b) => a.slice(0, 10) === b.slice(0, 10),
	court: (a, b) => plainText(a) === plainText(b),
	number: (a, b) => bareNumber(a) === bareNumber(b),
	formation: (a, b) => formationKey(a) === formationKey(b),
	ecli: (a, b) => a.trim().toUpperCase() === b.trim().toUpperCase(),
	solution: (a, b) => plainText(a) === plainText(b),
};

/** Propriétés renseignées de la fiche dont la valeur diffère de celle de Légifrance. */
export function ficheDifferences(frontmatter: Frontmatter, settings: FicheSettings, values: DecisionValues): FicheDifference[] {
	const differences: FicheDifference[] = [];
	for (const { property, field } of settings.ficheMapping) {
		const same = COMPARED[field];
		const name = property.trim();
		const current = name ? text(frontmatter?.[name]) : "";
		const expected = values[field]?.trim();
		if (same && current && expected && !same(current, expected)) differences.push({ property: name, field, current, expected });
	}
	return differences;
}
