/**
 * Détection des références juridiques (décisions, textes, articles de code,
 * identifiants Légifrance) dans le texte d'une note. Module pur : aucune
 * dépendance à Obsidian, afin d'être testable isolément. Les motifs de
 * citation s'inspirent de ceux de Marginalia.
 */
import { CODE_PATTERN, officialCodeName } from "./codes";
import { FULL_DATE_PATTERN, MONTH_PATTERN, plain } from "./dates";

export type RefKind = "decision" | "texte" | "article" | "identifiant";

/** Juridiction d'une décision. */
export type Court = "cassation" | "ce" | "cc" | "tc";

/**
 * Référence juridique détectée dans une note. `data` garde ce qu'il faut pour
 * la retrouver via l'API :
 * - `decision` : `court` et `number` ; ou, pour une décision citée par ses parties,
 *   `court`, `name` et `decided` (date ou année citée) ;
 * - `texte` : `nature` (loi, ordonnance…) et `number` ; ou `nature` et `date` pour une loi
 *   citée par sa seule date (« la loi du 6 janvier 1978 ») ;
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

const NATURES = "loi\\s+organique|loi\\s+constitutionnelle|loi\\s+de\\s+finances|loi|ordonnance|décret-loi|décret";
const LAW = new RegExp(
	`(?<nature>${NATURES}|arrêté)\\s+(?:n\\s?[°ºo]\\s*)?(?<number>\\d{2,4}-\\d+)(?:\\s+(?:du|en date du)\\s+(?<date>${FULL_DATE_PATTERN}))?`,
	"giu"
);
/** Texte cité par sa seule date (« la loi du 6 janvier 1978 »), rattaché à sa citation complète s'il y en a une. */
const SHORT_LAW = new RegExp(`(?<nature>${NATURES})\\s+du\\s+(?<date>${FULL_DATE_PATTERN})`, "giu");

const CASSATION = new RegExp(
	`(?:\\bCass\\.|\\bCour de cassation|\\b(?:Civ|Soc|Com|Crim)\\.|\\bAss\\. plén\\.|\\bCh\\. mixte)${PAYLOAD}(?:pourvoi\\s+)?n\\s?[°º]\\s*(?<number>\\d{2}-\\d{2}[.\\s]?\\d{3})`,
	"g"
);
/** Conseil d'État ou Tribunal des conflits, sous leurs désignations usuelles. */
const COURT_CE = "\\bC\\.\\s?E\\.|\\bCE\\b|\\bConseil d['’]État|\\bT\\.\\s?C\\.|\\bTC\\b|\\bTribunal des conflits";
const CONSEIL_ETAT = new RegExp(`(?:${COURT_CE})${PAYLOAD}n\\s?[°º]\\s*(?<number>\\d{5,7})\\b`, "g");
/** Formation de jugement facultative (« Ass. », « Sect. », « 9e et 10e ch. réunies »). */
const FORMATION =
	"(?:\\s*,\\s*(?:[Aa]ss(?:emblée)?\\.?|[Ss]ect(?:ion)?\\.?|(?:\\d{1,2}(?:e|ème|ᵉ)?(?:\\s*(?:et|-)\\s*\\d{1,2}(?:e|ème|ᵉ)?)?\\s*)?(?:ss?\\.?-?\\s?sect\\.?(?:ions)?|ch\\.)(?:\\s*réunies)?)(?=\\s*,))?";
/**
 * Décision citée par ses parties : « CE, Ass., 8 déc. 1978, Ordre des avocats », « C.E., 21 décembre 2001,
 * M. Hoffmann - art. 34 », ou avec la seule année (« CE, 2006, Ordre des avocats au barreau de Paris »).
 * Le nom commence par une majuscule et s'arrête à la virgule, au tiret entouré d'espaces, à une
 * parenthèse ou à la fin de la ligne ; le recueil Lebon n'est pas exigé.
 */
const CITED_BY_NAME = new RegExp(
	`(?:${COURT_CE})${FORMATION}[,.]?\\s*,?\\s*(?<date>${FULL_DATE_PATTERN}|(?:(?:${MONTH_PATTERN})\\s+)?\\d{4})\\s*,?\\s*` +
		"(?<name>\\p{Lu}(?:(?!\\s[-–—]\\s|\\s(?:Rec|Lebon)\\b)[^,;()\\n]){1,59})",
	"gu"
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

	// Lois citées en entier avec leur date : elles servent à rattacher les citations par la date seule.
	const lawNumbers = new Map<string, string>();
	for (const match of text.matchAll(LAW)) {
		const nature = clean(match.groups!.nature).toLowerCase();
		const number = match.groups!.number;
		if (match.groups!.date) lawNumbers.set(`${nature}|${plain(match.groups!.date.replace(/\b1er\b/, "1"))}`, number);
		add(match, "texte", clean(match[0]), `${nature} n° ${number}`, { nature, number });
	}
	for (const match of text.matchAll(SHORT_LAW)) {
		const nature = clean(match.groups!.nature).toLowerCase();
		const date = clean(match.groups!.date);
		const number = lawNumbers.get(`${nature}|${plain(date.replace(/\b1er\b/, "1"))}`);
		const data: Record<string, string> = number ? { nature, number } : { nature, date };
		add(match, "texte", clean(match[0]), number ? `${nature} n° ${number}` : `${nature} du ${date}`, data);
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

	for (const match of text.matchAll(CITED_BY_NAME)) {
		const court = /^(?:T\.?\s?C\.?|Tribunal)/.test(match[0]) ? "tc" : "ce";
		const name = clean(match.groups!.name);
		const decided = clean(match.groups!.date);
		add(match, "decision", clean(match[0]), `${name} ${decided}`, { court, name, decided });
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
