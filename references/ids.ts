import { ccYear } from "./timeline";

/** Décision publiée au Journal officiel (cas de décisions du Conseil constitutionnel absentes de son fond). */
const JORF_ID = /\bJORFTEXT\d{12}\b/;

/** Page d'une décision sur le site du Conseil constitutionnel : `/decision/<année>/<numéro sans tiret><type>.htm`. */
const CC_SITE_PATH = /conseil-constitutionnel\.fr\/decision\/(\d{4})\/(\d{3,}[A-Za-z]+)\.htm/;
export const CC_SITE = "https://www.conseil-constitutionnel.fr";

/**
 * Adresse de la page d'une décision d'après son numéro (« 2017-670 QPC » :
 * `/decision/2017/2017670QPC.htm` ; « 71-44 DC » : `/decision/1971/7144DC.htm`), ou `undefined` si le
 * numéro n'est pas de la forme année-ordre et type.
 */
export function ccSiteUrl(number: string) {
	const m = /^\s*(\d{2,4})\s*-\s*(\d+)\s+([A-Za-z]+)\s*$/.exec(number);
	const year = ccYear(number);
	return m && year ? `${CC_SITE}/decision/${year}/${m[1]}${m[2]}${m[3].toUpperCase()}.htm` : undefined;
}

/** Numéro et année d'une décision d'après l'adresse de sa page du site du Conseil constitutionnel. */
export function parseCcSiteKey(key: string) {
	const m = CC_SITE_PATH.exec(key);
	if (!m) return undefined;
	const [, year, file] = m;
	const prefix = file.startsWith(year) ? year : file.startsWith(year.slice(2)) ? year.slice(2) : undefined;
	const rest = prefix && /^(\d+)([A-Za-z]+)$/.exec(file.slice(prefix.length));
	return rest ? { year: Number(year), number: `${prefix}-${rest[1]} ${rest[2].toUpperCase()}` } : undefined;
}

/** Page d'une décision de la Revue générale du droit : `/blog/decisions/<slug>/`. */
const RGD_PATH = /revuegeneraledudroit\.eu\/blog\/decisions\/([a-z0-9-]+)/i;
export const RGD_SITE = "https://www.revuegeneraledudroit.eu";

/** Adresse canonique d'une décision de la Revue générale du droit d'après son slug. */
export const rgdKey = (slug: string) => `${RGD_SITE}/blog/decisions/${slug.toLowerCase()}/`;

/** Slug d'une décision de la Revue générale du droit, d'après sa clef ou son adresse. */
export const rgdSlug = (key: string) => RGD_PATH.exec(key)?.[1].toLowerCase();

/** Identifiant Légifrance d'une décision (`JURITEXT…`, `CETATEXT…`, `CONSTEXT…`). */
const TEXT_ID = /\b(?:CONSTEXT|CETATEXT|JURITEXT)\d{12}\b/;

/** Page d'une décision d'ArianeWeb (Conseil d'État, Tribunal des conflits) : `/fr/arianeweb/CE/decision/AAAA-MM-JJ/numéro`. */
const ARIANE_PATH = /\/fr\/arianeweb\/([A-Za-z]+)\/decision\/(\d{4}-\d{2}-\d{2})\/([^\s/?#"')\]]+)/;

/** Identifiant de décision contenu dans une adresse Légifrance ou un identifiant, ou `undefined`. */
export const decisionTextId = (url: string) => TEXT_ID.exec(url)?.[0];

/**
 * Clef d'une décision, qui lie une fiche aux citations : identifiant Légifrance, ou, pour les
 * décisions que seul ArianeWeb connaît, l'adresse de leur page (sous sa forme canonique). Les futures
 * sources (Judilibre, droit de l'Union) ajouteront ici leur propre forme d'identifiant.
 */
export function decisionKey(text: string) {
	const textId = decisionTextId(text);
	if (textId) return textId;
	const aria = ARIANE_PATH.exec(text);
	if (aria) return `https://www.conseil-etat.fr/fr/arianeweb/${aria[1]}/decision/${aria[2]}/${aria[3]}`;
	const jorf = JORF_ID.exec(text);
	if (jorf) return jorf[0];
	const site = CC_SITE_PATH.exec(text);
	if (site) return `${CC_SITE}/decision/${site[1]}/${site[2]}.htm`;
	const rgd = rgdSlug(text);
	return rgd ? rgdKey(rgd) : undefined;
}

/** Éléments d'une adresse ArianeWeb : juridiction (`CE`, `TC`), date (AAAA-MM-JJ) et numéro. */
export function parseAriaKey(key: string) {
	const aria = ARIANE_PATH.exec(key);
	return aria ? { court: aria[1].toUpperCase(), date: aria[2], number: decodeURIComponent(aria[3]) } : undefined;
}

/** Identifiant Légifrance d'un texte ou d'un article dans un lien ou une saisie, s'il y en a un. */
export const legifranceIdOf = (text: string) => /\b(?:LEGITEXT|LEGIARTI|JORFTEXT|JORFARTI|KALITEXT|KALIARTI|KALICONT|ACCOTEXT)\d{12}\b/.exec(text)?.[0];

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 2016-10-07 » en « 7 octobre 2016 » : la forme sous laquelle les textes sont cités et recherchés. */
export function spokenDate(iso: string) {
	const [year, month, day] = iso.split("-").map(Number);
	return `${day === 1 ? "1er" : day} ${MONTHS[month - 1]} ${year}`;
}
