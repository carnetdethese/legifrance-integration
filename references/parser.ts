/**
 * Détection des références juridiques (décisions, textes, articles de code,
 * identifiants Légifrance) dans le texte d'une note. Module pur : aucune
 * dépendance à Obsidian, afin d'être testable isolément. Les motifs de
 * citation s'inspirent de ceux de Marginalia.
 */
import { CODE_PATTERN, LEGIFRANCE_PAGES, PREAMBLE_1946, officialCodeName } from "./codes";
import { FULL_DATE_PATTERN, MONTH_PATTERN, plain } from "./dates";

export type RefKind = "decision" | "texte" | "article" | "eu" | "identifiant";

/** Juridiction d'une décision. */
export type Court = "cassation" | "ce" | "cc" | "tc";

/**
 * Référence juridique détectée dans une note. `data` garde ce qu'il faut pour
 * la retrouver via l'API :
 * - `decision` : `court` et `number` ; ou, pour une décision citée par ses parties,
 *   `court`, `name` et `decided` (date ou année citée) ;
 * - `texte` : `nature` (loi, ordonnance…) et `number` ; ou `nature` et `date` pour une loi
 *   citée par sa seule date (« la loi du 6 janvier 1978 ») ;
 * - `article` : `code` (nom officiel, ou texte constitutionnel) et `number` ;
 * - `eu` : `celex` (acte), ou `case` (affaire de la CJUE, « C-311/18 »).
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
/** Une partie (nom d'une décision) : majuscule initiale, jusqu'à la virgule, au tiret entouré d'espaces ou à la parenthèse. */
const PARTY = "\\p{Lu}(?:(?!\\s[-–—]\\s)[^,;()\\n]){1,59}";
/** Parties suivantes, jusqu'au recueil : « Sarran, Levacher, Rec. p. 368 ». */
const MORE_PARTIES = "(?:,\\s*(?!(?:Rec|Lebon)\\b)(?:(?!\\s[-–—]\\s)[^,;()\\n]){2,60})*";
const CITED_BY_NAME = new RegExp(
	`(?:${COURT_CE})${FORMATION}[,.]?\\s*,?\\s*(?<date>${FULL_DATE_PATTERN}|(?:(?:${MONTH_PATTERN})\\s+)?\\d{4})\\s*,?\\s*` +
		// Plusieurs parties : seulement si le recueil suit ; sinon la première partie suffit.
		`(?:(?<names>${PARTY}${MORE_PARTIES})(?=\\s*,\\s*(?:Rec|Lebon)\\b)|(?<name>${PARTY}))`,
	"gu"
);

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

const EU_CASE = /(?<![\w-])(?<case>[CTF]-\d{1,4}\/\d{2})(?!\d)/g;
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

/** Numéro CELEX d'un acte dérivé : depuis 2015 « année/numéro », avant « numéro/année ». */
function euActCelex(type: string, a: string, b: string) {
	const [first, second] = [Number(a), Number(b)];
	const [year, number] = first >= 1957 && first <= 2100 ? [first, second] : [second, first];
	return `3${year}${EU_ACT_LETTER[type.toLowerCase()]}${String(number).padStart(4, "0")}`;
}

/** Date normalisée pour retrouver une citation par sa date seule. */
const dateKey = (date: string) => plain(date.replace(/\b1er\b/, "1")).replace(/\s+/g, " ");

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

/** Liens facultatifs d'une référence, et longueur de la plage si elle est plus courte que la correspondance. */
interface AddOptions {
	url?: string;
	fallbackUrl?: string;
	length?: number;
}

/** Références d'un texte avec leur plage, avant suppression des chevauchements. */
function scan(text: string): Candidate[] {
	const found: Candidate[] = [];
	const add = (
		match: RegExpMatchArray,
		kind: RefKind,
		label: string,
		query: string,
		data: Record<string, string>,
		{ url, fallbackUrl, length }: AddOptions = {}
	) =>
		found.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + (length ?? match[0].length),
			ref: { key: makeKey(kind, data), kind, label, query, data, ...(url && { url }), ...(fallbackUrl && { fallbackUrl }) },
		});

	// Articles de codes et de textes constitutionnels. Charte de l'environnement : sa page seulement ;
	// Constitution et Déclaration de 1789 : la page tant que l'API n'a pas donné l'article exact.
	for (const pattern of [ARTICLE_THEN_CODE, CODE_THEN_ARTICLE]) {
		for (const match of text.matchAll(pattern)) {
			const code = officialCodeName(match.groups!.code);
			if (!code) continue;
			const page = LEGIFRANCE_PAGES[code];
			const apiResolvable = code.startsWith("Code ") || code === "Constitution" || code.startsWith("Déclaration");
			for (const item of match.groups!.numbers.matchAll(NUMBER_ITEM)) {
				const number = articleNumber(item[0]);
				add(match, "article", `${code}, art. ${number}`, `${code} article ${number}`, { code, number }, {
					url: page && !apiResolvable ? page : undefined,
					fallbackUrl: page,
				});
			}
		}
	}

	for (const match of text.matchAll(PREAMBLE)) {
		const g = match.groups!;
		const word = g.a_w ?? g.b_w;
		const alinea = g.a_n ?? g.a_m ?? g.b_n ?? g.b_m ?? (word ? String(ORDINALS[word.toLowerCase()]) : "");
		const number = alinea ? `al. ${alinea}` : "";
		add(match, "article", alinea ? `${PREAMBLE_1946}, al. ${alinea}` : PREAMBLE_1946, PREAMBLE_1946, { code: PREAMBLE_1946, number }, { url: LEGIFRANCE_PAGES[PREAMBLE_1946] });
	}

	// Lois citées en entier avec leur date : elles servent à rattacher les citations par la date seule.
	const lawNumbers = new Map<string, string>();
	for (const match of text.matchAll(LAW)) {
		const nature = clean(match.groups!.nature).toLowerCase();
		const number = match.groups!.number;
		if (match.groups!.date) lawNumbers.set(`${nature}|${dateKey(match.groups!.date)}`, number);
		add(match, "texte", clean(match[0]), `${nature} n° ${number}`, { nature, number });
	}
	for (const match of text.matchAll(SHORT_LAW)) {
		const nature = clean(match.groups!.nature).toLowerCase();
		const date = clean(match.groups!.date);
		const number = lawNumbers.get(`${nature}|${dateKey(date)}`);
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
			add(match, "decision", clean(match[0]), number, { court, number }, {
				fallbackUrl: court === "cassation" ? JUDILIBRE_SEARCH + encodeURIComponent(number) : undefined,
			});
		}
	}

	for (const match of text.matchAll(CITED_BY_NAME)) {
		const court = /^(?:T\.?\s?C\.?|Tribunal)/.test(match[0]) ? "tc" : "ce";
		const name = clean(match.groups!.names ?? match.groups!.name);
		const decided = clean(match.groups!.date);
		add(match, "decision", clean(match[0]), `${name} ${decided}`, { court, name, decided });
	}

	for (const match of text.matchAll(ECLI)) {
		add(match, "decision", match[0], match[0], { court: "ecli", number: match[0] });
	}

	// Droit de l'Union : adresses exactes d'EUR-Lex (acte) ou recherche CURIA (affaire de la CJUE).
	const euActs = new Map<string, string>(); // « lettre|date » → CELEX, pour les citations par la date seule
	const euRef = (match: RegExpMatchArray, celex: string, label: string, length?: number) =>
		add(match, "eu", label, celex, { celex }, { url: EURLEX_CELEX + encodeURIComponent(celex), length });
	for (const match of text.matchAll(CELEX)) euRef(match, match.groups!.celex, `CELEX ${match.groups!.celex}`);
	for (const match of text.matchAll(EU_ACT)) {
		const g = match.groups!;
		const celex = euActCelex(g.type, g.a, g.b);
		if (g.date) euActs.set(`${EU_ACT_LETTER[g.type.toLowerCase()]}|${dateKey(g.date)}`, celex);
		euRef(match, celex, clean(g.label), g.label.length);
	}
	for (const match of text.matchAll(EU_CASE)) {
		const eu = match.groups!.case;
		add(match, "eu", `aff. ${eu}`, eu, { case: eu }, { url: CURIA_SEARCH + encodeURIComponent(eu) });
	}
	for (const match of text.matchAll(SHORT_EU_ACT)) {
		const celex = euActs.get(`${EU_ACT_LETTER[match.groups!.type.toLowerCase()]}|${dateKey(match.groups!.date)}`);
		if (celex) euRef(match, celex, clean(match[0]));
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
