/**
 * Détection des références juridiques (décisions, textes, articles de code,
 * identifiants Légifrance) dans le texte d'une note. Module pur : aucune
 * dépendance à Obsidian, afin d'être testable isolément. Les motifs de
 * citation s'inspirent de ceux de Marginalia.
 */
import { ID_PATHS } from "api/urls";
import { CODE_PATTERN, LEGIFRANCE_PAGES, PREAMBLE_1946, officialCodeName } from "./codes";
import { FULL_DATE_PATTERN, MONTH_PATTERN, parseCitedDate, plain } from "./dates";
import { EU_PATTERN, euArticleUrl, euCelexOf, euLabelOf } from "./eulaw";
import { lawAliasOf, lawByNameRegex } from "./lawAliases";

/**
 * Version de l'analyse des notes. À incrémenter quand le parseur change ce qu'il reconnaît : au démarrage, les
 * notes sont alors relues (en local) pour que leurs références soient celles du nouveau parseur.
 */
export const PARSER_VERSION = 3;

export type RefKind = "decision" | "texte" | "article" | "eu" | "identifiant";

/** Juridiction d'une décision. */
export type Court = "cassation" | "ce" | "cc" | "tc";

/**
 * Référence juridique détectée dans une note. `data` garde ce qu'il faut pour
 * la retrouver via l'API :
 * - `decision` : `court` et `number` (et, si la citation les donne, `name` et `decided` comme
 *   indices, hors de la clef) ; ou, pour une décision citée par ses parties, `court`, `name` et
 *   `decided` (date normalisée AAAA-MM-JJ, AAAA-MM ou AAAA) ;
 * - `texte` : `nature` (loi, ordonnance…) et `number` ; ou `nature` et `date` pour une loi
 *   citée par sa seule date (« la loi du 6 janvier 1978 ») ;
 * - `article` : `code` (nom officiel, ou texte constitutionnel) et `number` ;
 * - `eu` : `celex` (acte) et, pour un article, `number` ; ou `case` (affaire de la CJUE, « C-311/18 »).
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
	/** Lien direct, connu sans appel à l'API (identifiant Légifrance, page d'un texte, EUR-Lex…). */
	url?: string;
	/** Lien à ouvrir tant que l'API n'a pas donné l'adresse exacte (page du texte, Judilibre…). */
	fallbackUrl?: string;
}

const JUDILIBRE_SEARCH = "https://www.courdecassation.fr/recherche-judilibre?search_api_fulltext=";
const CURIA_SEARCH = "https://curia.europa.eu/juris/liste.jsf?language=fr&num=";
const EURLEX_CELEX = "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:";

const BASE_URL = "https://www.legifrance.gouv.fr";

/** Lien de recherche Légifrance : toujours disponible, sans identifiants PISTE. */
export function searchUrl(query: string) {
	return `${BASE_URL}/search/all?tab_selection=all&searchField=ALL&searchType=ALL&typePagination=DEFAUT&query=${encodeURIComponent(query)}`;
}


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
const SHORT_LAW = new RegExp(`(?<nature>${NATURES})\\s+(?:en\\s+date\\s+du|du|le)\\s+(?<date>${FULL_DATE_PATTERN})`, "giu");
const CASSATION = new RegExp(
	`(?:\\bCass\\.|\\bCour de cassation|\\b(?:Civ|Soc|Com|Crim)\\.|\\bAss\\. plén\\.|\\bCh\\. mixte)${PAYLOAD}(?:pourvoi\\s+)?n\\s?[°º]\\s*(?<number>\\d{2}-\\d{2}[.\\s]?\\d{3})`,
	"g"
);
/** Conseil d'État ou Tribunal des conflits, sous leurs désignations usuelles. */
const COURT_CE = "\\bC\\.\\s?E\\.|\\bCE\\b|\\bConseil d['’]État|\\bT\\.\\s?C\\.|\\bTC\\b|\\bTribunal des conflits";
/** Texte entre la juridiction et le numéro, sans traverser le sigle d'une autre citation (« CE, 1919, Labonne et CE, 1930, Despujol, n° 97263 »). */
const PAYLOAD_SAME_CITATION = `(?:(?!${COURT_CE})[^\\n;()]){0,70}?`;
const CONSEIL_ETAT = new RegExp(`(?:${COURT_CE})${PAYLOAD_SAME_CITATION}n\\s?[°º]\\s*(?<number>\\d{5,7})\\b`, "g");
/** Formation de jugement facultative (« Ass. », « Sect. », « 9e et 10e ch. réunies »). */
const FORMATION =
	"(?:\\s*,\\s*(?:[Aa]ss(?:emblée)?\\.?|[Ss]ect(?:ion)?\\.?|(?:\\d{1,2}(?:e|ème|ᵉ)?(?:\\s*(?:et|-)\\s*\\d{1,2}(?:e|ème|ᵉ)?)?\\s*)?(?:ss?\\.?-?\\s?sect\\.?(?:ions)?|ch\\.)(?:\\s*réunies)?)(?=\\s*,))?";
/**
 * Décision citée par ses parties : « CE, Ass., 8 déc. 1978, Ordre des avocats », « C.E., 21 décembre 2001,
 * M. Hoffmann - art. 34 », ou avec la seule année (« CE, 2006, Ordre des avocats au barreau de Paris »).
 * Le nom commence par une majuscule et s'arrête à la virgule, au tiret entouré d'espaces, à une
 * parenthèse ou à la fin de la ligne ; le recueil Lebon n'est pas exigé.
 */
/** Une partie (nom d'une décision) : majuscule initiale, jusqu'à la virgule, au tiret entouré d'espaces ou à la parenthèse. */
const PARTY = `[*_]{0,3}\\p{Lu}(?:(?!\\s[-–—]\\s)(?!\\s(?:pp?\\.?\\s?\\d|n\\s?°|req\\b|concl\\b))(?!\\s(?:${COURT_CE}))[^,;()\\n\\[\\]=«»:]){1,79}`;
/** Parties suivantes, jusqu'au recueil : « Sarran, Levacher, Rec. p. 368 ». */
const MORE_PARTIES = `(?:,\\s*(?!(?:Rec|Lebon)\\b)(?:(?!\\s[-–—]\\s)(?!\\s(?:pp?\\.?\\s?\\d|n\\s?°|req\\b|concl\\b))(?!\\s(?:${COURT_CE}))[^,;()\\n\\[\\]=«»:]){2,60})*`;
const CITED_BY_NAME = new RegExp(
	`(?:${COURT_CE})${FORMATION}[,.]?\\s*,?\\s*(?<date>${FULL_DATE_PATTERN}|(?:(?:${MONTH_PATTERN})\\s+)?\\d{4})\\s*,?\\s*` +
		// Plusieurs parties : seulement si le recueil suit ; sinon la première partie suffit.
		`(?:(?<names>${PARTY}${MORE_PARTIES})(?=\\s*,\\s*(?:Rec|Lebon)\\b)|(?<name>${PARTY}))`,
	"gu"
);

/** Nom et date d'une décision écrits dans une citation par numéro : même motif que la citation par les parties, sans l'indicateur global. */
const NAMED_HINT = new RegExp(CITED_BY_NAME.source, "u");

// --- Bloc de constitutionnalité : Préambule de 1946 (cité par alinéa) --------------------------

const ORDINALS: Record<string, number> = {
	premier: 1, première: 1, deuxième: 2, second: 2, seconde: 2, troisième: 3, quatrième: 4, cinquième: 5,
	sixième: 6, septième: 7, huitième: 8, neuvième: 9, dixième: 10, onzième: 11, douzième: 12, treizième: 13,
	quatorzième: 14, quinzième: 15, seizième: 16, "dix-septième": 17, "dix-huitième": 18,
};

/** Un alinéa : « alinéa 11 », « 11e alinéa », « onzième alinéa » (groupes `<prefix>_n`, `_m`, `_w`). */
const alinea = (prefix: string) =>
	`(?:(?:alinéa|al\\.?)\\s*(?<${prefix}_n>\\d{1,2})(?:er|e|ᵉ)?|(?<${prefix}_m>\\d{1,2})(?:er|e|ᵉ|ème)\\s*alinéa|(?<${prefix}_w>${Object.keys(ORDINALS)
		.sort((a, b) => b.length - a.length)
		.join("|")})\\s+alinéa)`;
const PREAMBLE_CORE = "Préambule\\s+(?:de la Constitution\\s+)?(?:(?:du\\s+27\\s+octobre|de)\\s+)?1946";
/** L'alinéa précède (« onzième alinéa du Préambule… ») ou suit (« Préambule…, alinéa 11 »), jamais les deux. */
const PREAMBLE = new RegExp(
	`${alinea("a")}\\s*,?\\s*(?:du|de)\\s+(?:la\\s+)?${PREAMBLE_CORE}` +
		`|${PREAMBLE_CORE}(?:\\s*,\\s*${alinea("b")}(?!\\s*(?:du|de)\\s+(?:la\\s+)?Préambule))?`,
	"gi"
);

// --- Droit de l'Union -------------------------------------------------------------------------

const EU_CASE = /(?<case>[CTF]-\d{1,4}\/\d{2})(?!\d)/g;
const ECLI = /\bECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:[A-Za-z0-9.]+/g;
const CELEX = /\bCELEX\s*:?\s*(?<celex>\d[0-9A-Z]\d{4}[A-Z]\d{4}(?:\(\d+\))?)/g;
/** Acte de l'Union ; la date, quand elle suit, ne fait pas partie du libellé mais permet de retrouver l'acte cité plus loin par sa date seule. */
const EU_ACT = new RegExp(
	`(?<label>(?<type>règlement|directive|décision)\\s+(?:d['’]exécution\\s+)?\\((?:UE|CE|CEE|Euratom)\\)\\s*(?:n\\s?[°º]\\s*)?(?<a>\\d{1,4})/(?<b>\\d{1,4}))(?:[^;.\\n]{0,160}?\\sdu\\s+(?<date>${FULL_DATE_PATTERN}))?`,
	"giu"
);
/** Acte cité par sa seule date : jamais repéré seul (« le règlement du 11 mars 2022 » peut être national). */
const SHORT_EU_ACT = new RegExp(
	`(?<type>règlement|directive)\\s+(?:d['’]exécution\\s+)?(?:\\((?:UE|CE|CEE|Euratom)\\)\\s*)?du\\s+(?<date>${FULL_DATE_PATTERN})`,
	"giu"
);
const EU_ACT_LETTER: Record<string, string> = { règlement: "R", directive: "L", décision: "D" };
/** Directive citée à l'ancienne, année d'abord : « directive 95/46/CE », « directive 2002/58/CE ». */
const EU_DIRECTIVE_OLD = /[Dd]irective\s+(?:n\s?[°º]\s*)?(?<year>\d{2}|\d{4})\/(?<number>\d{1,4})\/(?:CE|CEE|UE|Euratom)\b/g;
/** Texte de l'Union cité par son nom ou son sigle, sans article (« le RGPD », « le DSA »). */
const EU_MENTION = new RegExp(`(?:${EU_PATTERN})`, "gu");

/** Texte de l'Union visé par un article : sigle ou nom (« RGPD »), ou acte cité par son numéro. */
const EU_TARGET = `(?:(?<alias>${EU_PATTERN})|(?<type>[Rr]èglement|[Dd]irective|[Dd]écision)\\s+(?:d['’]exécution\\s+)?\\((?:UE|CE|CEE|Euratom)\\)\\s*(?:n\\s?[°º]\\s*)?(?<a>\\d{1,4})/(?<b>\\d{1,4}))`;
/** « art. 32 RGPD », « article 6, § 1, du règlement (UE) 2016/679 », « RGPD, art. 5 ». */
const EU_ARTICLE_THEN_TEXT = new RegExp(`${ART}\\s*(?<numbers>${NUMBERS})${PRECISION}${LINK}${EU_TARGET}`, "gu");
const EU_TEXT_THEN_ARTICLE = new RegExp(`(?<alias>${EU_PATTERN})\\s*,?\\s*${ART}\\s*(?<numbers>${NUMBERS})`, "gu");

/** Numéro CELEX d'un acte dérivé : depuis 2015 « année/numéro », avant « numéro/année ». */
function euActCelex(type: string, a: string, b: string) {
	const [first, second] = [Number(a), Number(b)];
	const [year, number] = first >= 1957 && first <= 2100 ? [first, second] : [second, first];
	return `3${year}${EU_ACT_LETTER[type.toLowerCase()]}${String(number).padStart(4, "0")}`;
}

/** Date normalisée pour retrouver une citation par sa date seule. */
const dateKey = (date: string) => plain(date.replace(/\b1er\b/, "1")).replace(/\s+/g, " ");

const CC_SUFFIX = "(?:QPC|DC|LOM|LP|L|AN|SEN|ELEC|FNR|PDR|ORGA|AUTO|AR16|I|D)";
/** Le Conseil constitutionnel sous ses désignations usuelles : « Cons. const. », « Cons. constit. », « C.C. », « CC ». */
const COURT_CC = "\\bCons\\.\\s*const(?:it)?\\.|\\bC\\.\\s?C\\.|\\bCC\\b|\\b[Cc]onseil [Cc]onstitutionnel";
// Le numéro (« 2011-210 QPC ») ne commence ni au milieu d'un nombre ni d'une date (« 2001-01-01 L'article » : « 01-01 L » n'est pas
// un numéro), et la lettre de nature n'est pas le début d'un mot (« L'article », « Dans »).
const CONSEIL_CONSTITUTIONNEL = new RegExp(
	`(?:(?:${COURT_CC})[^\\n;()]{0,40}?,?\\s*|[Dd]écision\\s+)?(?:n\\s?[°º]\\s*)?(?<number>\\d{2,4}-\\d+(?:/\\d+)*\\s+${CC_SUFFIX})(?![\\p{L}\\d'’-])(?:\\s+du\\s+\\d{1,2}(?:er)?\\s+\\p{L}+\\s+\\d{4})?`,
	"gu"
);
/** Décision du Conseil constitutionnel citée par sa seule date : « Cons. constit., 16 juillet 1971 », « C.C., … », « CC, … ». */
const CC_BY_DATE = new RegExp(`(?:${COURT_CC})\\s*,?\\s*(?:(?:[Dd]écision\\s+)?du\\s+)?(?<date>${FULL_DATE_PATTERN})`, "gu");

const ID_REGEX = new RegExp(`\\b(${Object.keys(ID_PATHS).join("|")})\\d{12}\\b`, "g");

// --- Extraction -----------------------------------------------------------------------------

const clean = (text: string) => text.replace(/\s+/g, " ").trim().replace(/^,+|,+$/g, "");

/** Mot de liaison resté en fin de nom quand une autre citation suit (« Labonne et » + « CE, 1930… »). */
const TRAILING_CONNECTOR = /\s(?:et|ou|puis|voir|cf\.?|comp\.?|contra)\s*$/i;
const ABBREVIATIONS = "Mme|Mmes|Mlle|Mlles|MM|Cie|Cies|Sté|Stés|Soc|Ets|Éts|Ste|St|Dr|Pr|Me|Mgr|Sarl|Sas";
const ABBREVIATION_END = new RegExp(`\\b(?:${ABBREVIATIONS})$`, "u");

/**
 * Le nom privé de sa fin de phrase : à partir du premier point suivi d'une espace et précédé d'au moins trois lettres,
 * hors abréviation (« Mme. », « Cie. »).
 */
function withoutSentenceEnd(name: string) {
	for (const match of name.matchAll(/\.\s/g)) {
		const before = name.slice(0, match.index);
		if (/\p{L}{3}$/u.test(before) && !ABBREVIATION_END.test(before)) return before;
	}
	return name;
}

/**
 * Nom d'une décision débarrassé de la mise en forme et de ce qui n'en fait pas partie : crochets de lien,
 * ponctuation, sous-titre après deux-points (« Camino : contrôle des faits »), renvoi de page (« Camino p. 15 »),
 * reste de phrase (« Monpeurt]] = « bien que… »).
 */
export function cleanPartyName(raw: string) {
	const [name] = raw.replace(/<[^>]+>/g, "").replace(/\[\[|\]\]/g, " ").replace(/[*_]+/g, "").split(/\s=\s|[«»]|\s?:\s|\s(?:pp?\.?\s?\d|n\s?°|req\.?\s|concl\.?\s)/i);
	// Fin de phrase (« Labonne. On fait la », « Sieur Remoux. Rec ») : un point après au moins trois lettres, sauf abréviation (« Mme. », « Cie. »).
	return withoutSentenceEnd(clean(name)).replace(TRAILING_CONNECTOR, "").replace(/[\s.,;:!?)\]]+$/g, "");
}

/** Libellé d'une citation sans crochets de lien ni ponctuation finale. */
export const tidyLabel = (label: string) => clean(label.replace(/\[\[|\]\]/g, " ")).replace(/[\s.,;:]+$/g, "");

/** Nom comparable : sans accents, casse, ponctuation ni mise en forme (« Société Générale. » = « societe generale »). */
export const normalizedName = (name: string) => plain(name).replace(/[^a-z0-9]+/g, " ").trim();

/** Date citée (« 31 juill. 1942 », « 1942 ») au format AAAA-MM-JJ, AAAA-MM ou AAAA, ou `undefined`. */
export function decidedIso(text: string) {
	const date = parseCitedDate(text);
	if (!date) return undefined;
	const pad = (n: number) => String(n).padStart(2, "0");
	return date.month ? (date.day ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : `${date.year}-${pad(date.month)}`) : String(date.year);
}

/** Clef d'une décision citée par ses parties : juridiction, date normalisée et nom normalisé. */
export const namedDecisionKey = (court: string, name: string, decided: string) => makeKey("decision", { court, decided, name: normalizedName(name) });

/** Clef de cache : type, puis les données triées (insensible à la casse). */
function makeKey(kind: RefKind, data: Record<string, string>) {
	const parts = Object.entries(data)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v.toLowerCase()}`);
	return [kind, ...parts].join("|");
}

/** Numéro d'article normalisé : « L121-1 » devient « L. 121-1 », « 1er » devient « 1 ». */
function articleNumber(raw: string) {
	const number = clean(raw).replace(/(\d)er$/, "$1");
	return /^[LRD]/.test(number) ? number.replace(/^([LRD])\*?\.?\s?/, "$1. ") : number;
}

/**
 * Les correspondances de `regex` que `rejected` n'écarte pas. Remplace un lookbehind négatif, que les iOS
 * antérieurs à 16.4 ne comprennent pas — et qui empêcherait le plugin de se charger : après un rejet, la recherche
 * reprend un caractère plus loin, comme le ferait le moteur.
 */
function* matchesWhere(text: string, regex: RegExp, rejected: (match: RegExpExecArray) => boolean) {
	const search = new RegExp(regex.source, regex.flags);
	let match: RegExpExecArray | null;
	while ((match = search.exec(text))) {
		if (rejected(match)) {
			search.lastIndex = match.index + 1;
			continue;
		}
		if (match[0] === "") search.lastIndex++;
		yield match;
	}
}

/** Le caractère qui précède la position `index` de `text` est-il l'un de `chars` ? */
const followsChar = (text: string, index: number, chars: RegExp) => index > 0 && chars.test(text[index - 1]);

interface Candidate {
	start: number;
	end: number;
	ref: LegalRef;
}

/** Liens facultatifs d'une référence, et longueur de la plage si elle est plus courte que la correspondance. */
interface AddOptions {
	url?: string;
	fallbackUrl?: string;
	length?: number;
	/** Clef de la référence, si elle ne se déduit pas telle quelle de `data`. */
	key?: string;
}

/** Candidate construite à partir d'une correspondance de motif. */
function candidate(
	match: RegExpMatchArray,
	kind: RefKind,
	label: string,
	query: string,
	data: Record<string, string>,
	{ url, fallbackUrl, length, key }: AddOptions = {}
): Candidate {
	const start = match.index ?? 0;
	return {
		start,
		end: start + (length ?? match[0].length),
		ref: { key: key ?? makeKey(kind, data), kind, label, query, data, ...(url && { url }), ...(fallbackUrl && { fallbackUrl }) },
	};
}

/**
 * Références d'un texte avec leur plage, avant suppression des chevauchements. L'ordre des familles
 * est l'ordre de priorité de `citationSpans` : en cas de chevauchement, la première l'emporte.
 */
function scan(text: string): Candidate[] {
	return [
		...scanCodeArticles(text),
		...scanEuArticles(text),
		...scanPreamble(text),
		...scanLawAliases(text),
		...scanLaws(text),
		...scanDecisions(text),
		...scanCcSiteUrls(text),
		...scanDecisionsByName(text),
		...scanCcByDate(text),
		...scanEcli(text),
		...scanEuLaw(text),
		...scanEuMentions(text),
		...scanIdentifiers(text),
	];
}

/**
 * Articles de codes et de textes constitutionnels. Charte de l'environnement : sa page seulement ;
 * Constitution et Déclaration de 1789 : la page tant que l'API n'a pas donné l'article exact.
 */
function scanCodeArticles(text: string): Candidate[] {
	const found: Candidate[] = [];
	for (const pattern of [ARTICLE_THEN_CODE, CODE_THEN_ARTICLE]) {
		for (const match of text.matchAll(pattern)) {
			for (const item of match.groups!.numbers.matchAll(NUMBER_ITEM)) {
				const number = articleNumber(item[0]);
				// L'abréviation peut convenir à plusieurs codes (« CPCE ») : le numéro d'article départage.
				const code = officialCodeName(match.groups!.code, number);
				if (!code) continue;
				const page = LEGIFRANCE_PAGES[code];
				const apiResolvable = code.startsWith("Code ") || code === "Constitution" || code.startsWith("Déclaration");
				found.push(
					candidate(match, "article", `${code}, art. ${number}`, `${code} article ${number}`, { code, number }, {
						url: page && !apiResolvable ? page : undefined,
						fallbackUrl: page,
					})
				);
			}
		}
	}
	return found;
}

/** Articles de textes de l'Union : adresse du texte sur EUR-Lex, ancrée sur l'article. */
function scanEuArticles(text: string): Candidate[] {
	const found: Candidate[] = [];
	for (const pattern of [EU_ARTICLE_THEN_TEXT, EU_TEXT_THEN_ARTICLE]) {
		for (const match of text.matchAll(pattern)) {
			const g = match.groups!;
			const celex = g.alias ? euCelexOf(g.alias) : euActCelex(g.type, g.a, g.b);
			if (!celex) continue;
			const name = euLabelOf(celex) ?? (g.alias ? clean(g.alias) : `${g.type.toLowerCase()} (UE) ${g.a}/${g.b}`);
			for (const item of g.numbers.matchAll(NUMBER_ITEM)) {
				const number = articleNumber(item[0]);
				found.push(candidate(match, "eu", `${name}, art. ${number}`, `${name} article ${number}`, { celex, number }, { url: euArticleUrl(celex, number) }));
			}
		}
	}
	return found;
}

/** Préambule de la Constitution de 1946, cité par alinéa. */
function scanPreamble(text: string): Candidate[] {
	const found: Candidate[] = [];
	for (const match of text.matchAll(PREAMBLE)) {
		const g = match.groups!;
		const word = g.a_w ?? g.b_w;
		const alinea = g.a_n ?? g.a_m ?? g.b_n ?? g.b_m ?? (word ? String(ORDINALS[word.toLowerCase()]) : "");
		const number = alinea ? `al. ${alinea}` : "";
		found.push(
			candidate(match, "article", alinea ? `${PREAMBLE_1946}, al. ${alinea}` : PREAMBLE_1946, PREAMBLE_1946, { code: PREAMBLE_1946, number }, { url: LEGIFRANCE_PAGES[PREAMBLE_1946] })
		);
	}
	return found;
}

/** Lois citées par leur nom usuel : retrouvées par leur numéro, la date écrite à la suite est reprise dans la citation. */
function scanLawAliases(text: string): Candidate[] {
	return [...text.matchAll(lawByNameRegex())].flatMap((match) => {
		const alias = lawAliasOf(match.groups!.name);
		if (!alias) return [];
		const { nature, number } = alias;
		return [candidate(match, "texte", clean(match[0]), `${nature} n° ${number}`, { nature, number })];
	});
}

/** Lois, ordonnances, décrets et arrêtés, par leur numéro ou par leur seule date. */
function scanLaws(text: string): Candidate[] {
	const found: Candidate[] = [];
	// Lois citées en entier avec leur date : elles servent à rattacher les citations par la date seule.
	const lawNumbers = new Map<string, string>();
	for (const match of text.matchAll(LAW)) {
		const nature = clean(match.groups!.nature).toLowerCase();
		const number = match.groups!.number;
		if (match.groups!.date) lawNumbers.set(`${nature}|${dateKey(match.groups!.date)}`, number);
		found.push(candidate(match, "texte", clean(match[0]), `${nature} n° ${number}`, { nature, number }));
	}
	for (const match of text.matchAll(SHORT_LAW)) {
		const nature = clean(match.groups!.nature).toLowerCase();
		const date = clean(match.groups!.date);
		const number = lawNumbers.get(`${nature}|${dateKey(date)}`);
		const data: Record<string, string> = number ? { nature, number } : { nature, date };
		found.push(candidate(match, "texte", clean(match[0]), number ? `${nature} n° ${number}` : `${nature} du ${date}`, data));
	}
	return found;
}

/** Décisions citées par leur numéro (Cour de cassation, Conseil d'État, Conseil constitutionnel). */
function scanDecisions(text: string): Candidate[] {
	const found: Candidate[] = [];
	const decisions: [Court, RegExp][] = [
		["cassation", CASSATION],
		["ce", CONSEIL_ETAT],
		["cc", CONSEIL_CONSTITUTIONNEL],
	];
	/** Le numéro d'une décision du Conseil constitutionnel ne commence ni au milieu d'un nombre ni d'une date. */
	const insideNumber = (m: RegExpExecArray) => followsChar(text, m.index + m[0].indexOf(m.groups!.number), /[\d/.-]/);
	for (const [court, pattern] of decisions) {
		const matches = court === "cc" ? matchesWhere(text, pattern, insideNumber) : text.matchAll(pattern);
		for (const match of matches) {
			let number = clean(match.groups!.number);
			if (court === "cassation") number = number.replace(/^(\d{2}-\d{2})[.\s]?(\d{3})$/, "$1.$2");
			// Au Conseil d'État, le nom et la date écrits avant le numéro (« CE, 10 janvier 1930, Despujol, n° 97263 ») sont
			// conservés comme indices, hors de la clef : ils permettent de rapprocher cette citation de la même décision citée
			// par son nom, sans attendre que l'API les relie.
			const data: Record<string, string> = { court, number };
			const hint = court === "ce" ? NAMED_HINT.exec(match[0]) : null;
			const hintName = hint && cleanPartyName(hint.groups!.names ?? hint.groups!.name);
			if (hint && hintName) {
				data.name = hintName;
				data.decided = decidedIso(clean(hint.groups!.date)) ?? clean(hint.groups!.date);
			}
			found.push(
				candidate(match, "decision", clean(match[0]), number, data, {
					key: makeKey("decision", { court, number }),
					fallbackUrl: court === "cassation" ? JUDILIBRE_SEARCH + encodeURIComponent(number) : undefined,
				})
			);
		}
	}
	return found;
}

/** Décision du Conseil constitutionnel citée par l'adresse de sa page : « …/decision/2004/2004499DC.htm » (2004-499 DC). */
const CC_SITE_URL = /conseil-constitutionnel\.fr\/decision\/\d{4}\/(?<year>\d{4})(?<order>\d{1,4})(?<kind>QPC|DC|LOM|LP|AN|SEN|ELEC|FNR|PDR|ORGA|AUTO|AR16|L|I|D)(?:\.htm)?/gi;

function scanCcSiteUrls(text: string): Candidate[] {
	return [...text.matchAll(CC_SITE_URL)].map((match) => {
		const { year, order, kind } = match.groups!;
		const number = `${year}-${Number(order)} ${kind.toUpperCase()}`;
		return candidate(match, "decision", `Décision n° ${number}`, number, { court: "cc", number }, { key: makeKey("decision", { court: "cc", number }) });
	});
}

/** Décisions du Conseil d'État ou du Tribunal des conflits citées par leurs parties et leur date. */
function scanDecisionsByName(text: string): Candidate[] {
	const found: Candidate[] = [];
	for (const match of text.matchAll(CITED_BY_NAME)) {
		const court = /^(?:T\.?\s?C\.?|Tribunal)/.test(match[0]) ? "tc" : "ce";
		const raw = match.groups!.names ?? match.groups!.name;
		const name = cleanPartyName(raw);
		if (!name) continue;
		const written = clean(match.groups!.date);
		// La date est conservée normalisée : « 31 juillet 1942 » et « 31 juill. 1942 » sont la même décision.
		const decided = decidedIso(written) ?? written;
		// Le libellé s'arrête au nom retenu (pas au reste de la phrase).
		const label = tidyLabel(match[0].slice(0, match[0].length - raw.length) + name);
		found.push(candidate(match, "decision", label, `${name} ${written}`, { court, name, decided }, { key: namedDecisionKey(court, name, decided) }));
	}
	return found;
}

/**
 * Décisions du Conseil constitutionnel citées par leur date seule. Plusieurs décisions peuvent porter la même date
 * (le 16 juillet 1971 : 71-44 DC et 71-45 DC) : la recherche le sait et fait choisir.
 */
function scanCcByDate(text: string): Candidate[] {
	return [...text.matchAll(CC_BY_DATE)].flatMap((match) => {
		const written = clean(match.groups!.date);
		const decided = decidedIso(written);
		return decided ? [candidate(match, "decision", clean(match[0]), `Conseil constitutionnel ${written}`, { court: "cc", decided }, { key: makeKey("decision", { court: "cc", decided }) })] : [];
	});
}

/** Identifiants ECLI. */
function scanEcli(text: string): Candidate[] {
	return [...text.matchAll(ECLI)].map((match) => candidate(match, "decision", match[0], match[0], { court: "ecli", number: match[0] }));
}

/** Droit de l'Union : adresses exactes d'EUR-Lex (acte) ou recherche CURIA (affaire de la CJUE). */
function scanEuLaw(text: string): Candidate[] {
	const found: Candidate[] = [];
	const euActs = new Map<string, string>(); // « lettre|date » → CELEX, pour les citations par la date seule
	const euRef = (match: RegExpMatchArray, celex: string, label: string, length?: number) =>
		found.push(candidate(match, "eu", label, celex, { celex }, { url: EURLEX_CELEX + encodeURIComponent(celex), length }));
	for (const match of text.matchAll(CELEX)) euRef(match, match.groups!.celex, `CELEX ${match.groups!.celex}`);
	for (const match of text.matchAll(EU_ACT)) {
		const g = match.groups!;
		const celex = euActCelex(g.type, g.a, g.b);
		if (g.date) euActs.set(`${EU_ACT_LETTER[g.type.toLowerCase()]}|${dateKey(g.date)}`, celex);
		euRef(match, celex, clean(g.label), g.label.length);
	}
	for (const match of matchesWhere(text, EU_CASE, (m) => followsChar(text, m.index, /[\w-]/))) {
		const eu = match.groups!.case;
		found.push(candidate(match, "eu", `aff. ${eu}`, eu, { case: eu }, { url: CURIA_SEARCH + encodeURIComponent(eu) }));
	}
	for (const match of matchesWhere(text, EU_DIRECTIVE_OLD, (m) => followsChar(text, m.index, /[\w/]/))) {
		const { year, number } = match.groups!;
		const full = year.length === 2 ? (Number(year) >= 57 ? 1900 : 2000) + Number(year) : Number(year);
		euRef(match, `3${full}L${number.padStart(4, "0")}`, clean(match[0]));
	}
	for (const match of text.matchAll(SHORT_EU_ACT)) {
		const celex = euActs.get(`${EU_ACT_LETTER[match.groups!.type.toLowerCase()]}|${dateKey(match.groups!.date)}`);
		if (celex) euRef(match, celex, clean(match[0]));
	}
	return found;
}

/** Sigles reconnus avec un article (« art. 5 RIA ») mais trop courants pour être pris seuls (« DGA » : Direction générale de l'armement). */
const AMBIGUOUS_ACRONYMS = new Set(["RIA", "DGA"]);

/** Textes de l'Union cités par leur nom ou leur sigle, sans article. */
function scanEuMentions(text: string): Candidate[] {
	return [...matchesWhere(text, EU_MENTION, (m) => followsChar(text, m.index, /[\wÀ-ÿ]/))].flatMap((match) => {
		if (AMBIGUOUS_ACRONYMS.has(match[0])) return [];
		const celex = euCelexOf(match[0]);
		return celex ? [candidate(match, "eu", euLabelOf(celex) ?? clean(match[0]), celex, { celex }, { url: EURLEX_CELEX + encodeURIComponent(celex) })] : [];
	});
}

/** Identifiants Légifrance (LEGIARTI…, JURITEXT…) : adresse directe. */
function scanIdentifiers(text: string): Candidate[] {
	return [...text.matchAll(ID_REGEX)].map((match) =>
		candidate(match, "identifiant", match[0], match[0], {}, { key: `identifiant|${match[0]}`, url: `${BASE_URL}/${ID_PATHS[match[1]]}/${match[0]}` })
	);
}

/** Référence détectée et nombre de fois où la note la cite. */
export interface Citation {
	ref: LegalRef;
	count: number;
}

/** Citation retenue dans un texte, avec sa plage (indices de caractères). */
export interface CitationSpan {
	ref: LegalRef;
	start: number;
	end: number;
}

/**
 * Citations d'un texte, dans l'ordre d'apparition, chacune avec sa plage. Une citation déjà couverte
 * par une autre (même plage) est écartée ; l'ordre de `scan` donne la priorité.
 */
export function citationSpans(text: string): CitationSpan[] {
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
	return taken.sort((a, b) => a.start - b.start).map(({ ref, start, end }) => ({ ref, start, end }));
}

/**
 * Extrait les références juridiques d'un texte, une fois chacune (dans l'ordre de première
 * apparition), avec leur nombre de citations.
 */
export function parseCitations(text: string): Citation[] {
	const citations = new Map<string, Citation>();
	for (const { ref } of citationSpans(text)) {
		const known = citations.get(ref.key);
		if (known) known.count++;
		else citations.set(ref.key, { ref, count: 1 });
	}
	return [...citations.values()];
}

/** Références d'un texte, sans doublon, dans l'ordre d'apparition. */
export const parseReferences = (text: string): LegalRef[] => parseCitations(text).map(({ ref }) => ref);
