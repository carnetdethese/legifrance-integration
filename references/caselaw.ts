/**
 * Lecture de la réponse de l'API pour une décision de justice (`POST /consult/juri`). Comme dans
 * Marginalia, on ne présume pas de la structure : on cherche les champs connus dans tout l'arbre,
 * des plus proches de la racine aux plus profonds.
 */
import { htmlToMarkdown } from "obsidian";

/** Clefs où l'on cherche, dans l'ordre de préférence, chaque champ. */
const TEXT_KEYS = ["texteHtml", "textHtml", "texteIntegral", "texte", "text", "contenu", "content"];
const TITLE_KEYS = ["titre", "title", "titrePrincipal"];
const NUMBER_KEYS = ["numero", "num", "number"];
const DATE_KEYS = ["dateTexte", "dateDecision", "dateDec", "date"];
/** Suffixes du numéro d'une décision du Conseil constitutionnel (champ `nature` : « DC », « QPC »…). */
const CC_NATURES = ["DC", "QPC", "LOM", "LP", "L", "AN", "SEN", "ELEC", "FNR", "PDR", "ORGA", "AUTO", "I", "D"];

/** Identifiant Légifrance d'une décision (`JURITEXT…`, `CETATEXT…`, `CONSTEXT…`). */
const TEXT_ID = /\b(?:CONSTEXT|CETATEXT|JURITEXT)\d{12}\b/;

/** Identifiant de décision contenu dans une adresse Légifrance ou un identifiant, ou `undefined`. */
export const decisionTextId = (url: string) => TEXT_ID.exec(url)?.[0];

/** Ce que l'on retient de la réponse de l'API. */
export interface DecisionText {
	title: string;
	html: string;
	markdown: string;
	/** Date au format AAAA-MM-JJ. */
	date?: string;
	number?: string;
	ecli?: string;
	solution?: string;
	/** Juridiction, telle que Légifrance la donne. */
	court?: string;
	formation?: string;
}

/** Couples (clef, valeur) de tout l'arbre JSON, en largeur : les clefs proches de la racine d'abord. */
function* walk(node: unknown): Generator<[string, unknown]> {
	const queue = [node];
	while (queue.length) {
		const current = queue.shift();
		if (Array.isArray(current)) queue.push(...current);
		else if (current && typeof current === "object") {
			for (const [key, value] of Object.entries(current)) {
				yield [key, value];
				queue.push(value);
			}
		}
	}
}

/** Première valeur non vide d'une des `keys` (par ordre de préférence des clefs). */
function first(response: unknown, keys: string[], types: string[] = ["string"]) {
	const found = new Map<string, unknown>();
	for (const [key, value] of walk(response)) {
		if (keys.includes(key) && types.includes(typeof value) && value !== "" && !found.has(key)) found.set(key, value);
	}
	return keys.map((key) => found.get(key)).find((value) => value !== undefined);
}

/** Date de l'API : millisecondes depuis 1970, ou texte ISO (« 2012-08-09 »). */
function toDate(value: unknown) {
	const date = typeof value === "number" ? new Date(value) : typeof value === "string" ? new Date(value.slice(0, 10)) : undefined;
	return date && !isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}

/** La décision que contient la réponse de `/consult/juri`, ou `null` sans texte. */
export function readDecision(response: unknown): DecisionText | null {
	const body = first(response, TEXT_KEYS) as string | undefined;
	if (!body) return null;

	let number = first(response, NUMBER_KEYS) as string | undefined;
	const nature = first(response, ["nature"]) as string | undefined;
	if (number && nature && CC_NATURES.includes(nature)) number = `${number} ${nature}`; // « 2012-653 » + « DC »

	return {
		title: (first(response, TITLE_KEYS) as string | undefined) ?? "Décision",
		html: body,
		markdown: htmlToMarkdown(body).trim(),
		date: toDate(first(response, DATE_KEYS, ["string", "number"])),
		number,
		ecli: first(response, ["ecli"]) as string | undefined,
		solution: first(response, ["solution"]) as string | undefined,
		court: first(response, ["juridiction"]) as string | undefined,
		formation: first(response, ["formation"]) as string | undefined,
	};
}
