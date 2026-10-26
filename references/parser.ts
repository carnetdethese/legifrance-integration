/**
 * Détection des références juridiques (décisions, textes, articles de code,
 * identifiants Légifrance) dans le texte d'une note. Module pur : aucune
 * dépendance à Obsidian, afin d'être testable isolément. Les motifs de
 * citation s'inspirent de ceux de Marginalia.
 */
import { CODE_PATTERN, officialCodeName } from "./codes";

export type RefKind = "decision" | "texte" | "article" | "identifiant";

/** Juridiction d'une décision. */
export type Court = "cassation" | "ce" | "cc";

/**
 * Référence juridique détectée dans une note. `data` garde ce qu'il faut pour
 * la retrouver via l'API :
 * - `decision` : `court` et `number` ;
 * - `texte` : `nature` (loi, ordonnance…) et `number` ;
 * - `article` : `code` (nom officiel) et `number`.
 */
export interface LegalRef {
	/** Clef de déduplication et de cache, stable d'une note à l'autre. */
	key: string;
	kind: RefKind;
	/** Citation affichée (normalisée pour les articles). */
	label: string;
	/** Termes de recherche Légifrance, utilisés par le lien de repli. */
	query: string;
	data: Record<string, string>;
	/** Lien direct, connu sans appel à l'API (identifiants Légifrance). */
	url?: string;
}

const BASE_URL = "https://www.legifrance.gouv.fr";

/** Lien de recherche Légifrance : toujours disponible, sans identifiants PISTE. */
export function searchUrl(query: string) {
	return `${BASE_URL}/search/all?tab_selection=all&searchField=ALL&searchType=ALL&typePagination=DEFAUT&query=${encodeURIComponent(query)}`;
}

/** Préfixe d'un identifiant Légifrance → chemin de sa page. */
const ID_PATHS: Record<string, string> = {
	JURITEXT: "juri/id",
	CETATEXT: "ceta/id",
	CONSTEXT: "cons/id",
	JORFTEXT: "jorf/id",
	LEGITEXT: "codes/texte_lc",
	LEGIARTI: "codes/article_lc",
	JORFARTI: "jorf/article_jo",
};

// --- Motifs ---------------------------------------------------------------------------------

/** Texte libre entre la juridiction et le numéro : jamais de fin de phrase ni de parenthèse. */
const PAYLOAD = "[^\\n;()]{0,70}?";

const NUMBER =
	"(?:[LRD]\\*?\\.?\\s?)?\\d+(?:-\\d+)*(?:er)?(?:\\s?(?:bis|ter|quater|quinquies|sexies|septies|octies))?";
const NUMBERS = `${NUMBER}(?:\\s*(?:,|et|à|ou)\\s*${NUMBER})*`;
const ART = "[Aa]rt(?:icles?)?\\b\\.?";
const PRECISION = "(?:\\s*,?\\s*(?:[Aa]l(?:inéa|\\.)?\\s*\\d+(?:er|e)?|§\\s*\\d+))*";
const LINK = "\\s*,?\\s*(?:(?:dudit|du|de la|de l['’]|des)\\s*)?";

const ARTICLE_THEN_CODE = new RegExp(
	`${ART}\\s*(?<numbers>${NUMBERS})${PRECISION}${LINK}(?<code>${CODE_PATTERN})`,
	"g"
);
const CODE_THEN_ARTICLE = new RegExp(
	`(?<code>${CODE_PATTERN})\\s*,?\\s*${ART}\\s*(?<numbers>${NUMBERS})`,
	"g"
);
const NUMBER_ITEM = new RegExp(NUMBER, "g");

const LAW =
	/(?<nature>loi\s+organique|loi\s+constitutionnelle|loi\s+de\s+finances|loi|ordonnance|décret-loi|décret|arrêté)\s+(?:n\s?[°ºo]\s*)?(?<number>\d{2,4}-\d+)(?:\s+(?:du|en date du)\s+\d{1,2}(?:er)?\s+\p{L}+\s+\d{4})?/giu;

const CASSATION = new RegExp(
	`(?:\\bCass\\.|\\bCour de cassation|\\b(?:Civ|Soc|Com|Crim)\\.|\\bAss\\. plén\\.|\\bCh\\. mixte)${PAYLOAD}(?:pourvoi\\s+)?n\\s?[°º]\\s*(?<number>\\d{2}-\\d{2}[.\\s]?\\d{3})`,
	"g"
);
const CONSEIL_ETAT = new RegExp(
	`(?:\\bCE\\b|\\bConseil d['’]État)${PAYLOAD}n\\s?[°º]\\s*(?<number>\\d{5,7})\\b`,
	"g"
);
const CC_SUFFIX = "(?:QPC|DC|LOM|LP|L|AN|SEN|ELEC|FNR|PDR|ORGA|AUTO|AR16|I|D)";
const CONSEIL_CONSTITUTIONNEL = new RegExp(
	`(?:(?:\\bCons\\.\\s*const\\.|\\bConseil constitutionnel|\\bCC\\b)[^\\n;()]{0,40}?,?\\s*|[Dd]écision\\s+)?(?:n\\s?[°º]\\s*)?(?<number>\\d{2,4}-\\d+(?:/\\d+)*\\s+${CC_SUFFIX})\\b(?:\\s+du\\s+\\d{1,2}(?:er)?\\s+\\p{L}+\\s+\\d{4})?`,
	"gu"
);

const ID_REGEX = /\b(JURITEXT|CETATEXT|CONSTEXT|JORFTEXT|LEGITEXT|LEGIARTI|JORFARTI)\d{12}\b/g;

// --- Extraction -----------------------------------------------------------------------------

const clean = (text: string) => text.replace(/\s+/g, " ").trim().replace(/^,+|,+$/g, "");

/** Clef de cache : type, puis les données triées (insensible à la casse). */
function makeKey(kind: RefKind, data: Record<string, string>) {
	const parts = Object.entries(data)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v.toLowerCase()}`);
	return [kind, ...parts].join("|");
}

/** Numéro d'article normalisé : « L121-1 » devient « L. 121-1 », « 1er » devient « 1 ». */
function articleNumber(raw: string) {
	const number = clean(raw).replace(/(?<=\d)er$/, "");
	return /^[LRD]/.test(number) ? number.replace(/^([LRD])\*?\.?\s?/, "$1. ") : number;
}

interface Candidate {
	start: number;
	end: number;
	ref: LegalRef;
}

/** Références d'un texte avec leur plage, avant suppression des chevauchements. */
function scan(text: string): Candidate[] {
	const found: Candidate[] = [];
	const add = (match: RegExpMatchArray, kind: RefKind, label: string, query: string, data: Record<string, string>) =>
		found.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			ref: { key: makeKey(kind, data), kind, label, query, data },
		});

	for (const pattern of [ARTICLE_THEN_CODE, CODE_THEN_ARTICLE]) {
		for (const match of text.matchAll(pattern)) {
			const code = officialCodeName(match.groups!.code);
			if (!code) continue;
			for (const item of match.groups!.numbers.matchAll(NUMBER_ITEM)) {
				const number = articleNumber(item[0]);
				add(match, "article", `${code}, art. ${number}`, `${code} article ${number}`, { code, number });
			}
		}
	}

	for (const match of text.matchAll(LAW)) {
		const nature = clean(match.groups!.nature).toLowerCase();
		const number = match.groups!.number;
		add(match, "texte", clean(match[0]), `${nature} n° ${number}`, { nature, number });
	}

	const decisions: [Court, RegExp][] = [
		["cassation", CASSATION],
		["ce", CONSEIL_ETAT],
		["cc", CONSEIL_CONSTITUTIONNEL],
	];
	for (const [court, pattern] of decisions) {
		for (const match of text.matchAll(pattern)) {
			let number = clean(match.groups!.number);
			if (court === "cassation") number = number.replace(/^(\d{2}-\d{2})[.\s]?(\d{3})$/, "$1.$2");
			add(match, "decision", clean(match[0]), number, { court, number });
		}
	}

	for (const match of text.matchAll(ID_REGEX)) {
		const ref = { key: `identifiant|${match[0]}`, kind: "identifiant" as const, label: match[0], query: match[0], data: {}, url: `${BASE_URL}/${ID_PATHS[match[1]]}/${match[0]}` };
		found.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, ref });
	}
	return found;
}

/**
 * Extrait les références juridiques d'un texte, dédupliquées, dans l'ordre
 * d'apparition. Une citation déjà couverte par une autre (même plage) n'est
 * comptée qu'une fois ; l'ordre de `scan` donne la priorité.
 */
export function parseReferences(text: string): LegalRef[] {
	const taken: Candidate[] = [];
	for (const candidate of scan(text)) {
		const overlaps = taken.some(
			(other) =>
				candidate.start < other.end &&
				other.start < candidate.end &&
				// Plusieurs articles d'une même citation (« art. 1240 et 1241 ») partagent la plage.
				!(other.start === candidate.start && other.end === candidate.end && candidate.ref.kind === "article")
		);
		if (!overlaps) taken.push(candidate);
	}

	const seen = new Set<string>();
	return taken
		.sort((a, b) => a.start - b.start)
		.map(({ ref }) => ref)
		.filter((ref) => !seen.has(ref.key) && !!seen.add(ref.key));
}
