/**
 * Codes juridiques : nom officiel (celui du filtre `NOM_CODE` de Légifrance) et désignations
 * usuelles. Table reprise de Marginalia. Les abréviations sont sensibles à la casse
 * (« CP » n'est pas « cp ») ; les noms complets ne le sont pas.
 */
export const CODES: Record<string, string[]> = {
	"Code civil": ["C. civ.", "C. civil", "Cciv"],
	"Code pénal": ["C. pén.", "C. pénal", "CP"],
	"Code de procédure civile": ["C. pr. civ.", "CPC"],
	"Code de procédure pénale": ["C. pr. pén.", "CPP"],
	"Code de commerce": ["C. com."],
	"Code du travail": ["C. trav."],
	"Code de la consommation": ["C. consom.", "C. cons."],
	"Code de la sécurité sociale": ["CSS", "C. sec. soc.", "C. séc. soc."],
	"Code général des impôts": ["CGI"],
	"Code de justice administrative": ["CJA"],
	"Code de l'environnement": ["C. env."],
	"Code de l'urbanisme": ["C. urb."],
	"Code de la santé publique": ["CSP", "C. santé publ."],
	"Code monétaire et financier": ["CMF", "C. mon. fin."],
	"Code de la propriété intellectuelle": ["CPI", "C. propr. intell."],
	"Code de l'entrée et du séjour des étrangers et du droit d'asile": ["CESEDA"],
	"Code général des collectivités territoriales": ["CGCT"],
	"Code rural et de la pêche maritime": ["C. rur.", "CRPM"],
	"Code de l'éducation": ["C. éduc."],
	"Code de la route": ["C. route"],
	"Code des assurances": ["C. assur."],
	"Code de l'action sociale et des familles": ["CASF"],
	"Code des relations entre le public et l'administration": ["CRPA"],
	"Code général de la fonction publique": ["CGFP"],
	"Code général de la propriété des personnes publiques": ["CG3P", "CGPPP"],
	"Code de la construction et de l'habitation": ["CCH"],
	"Code de l'organisation judiciaire": ["COJ"],
	"Code des procédures civiles d'exécution": ["CPCE", "C. pr. exéc.", "CPCEx"],
	"Code de la sécurité intérieure": ["CSI"],
	"Code électoral": ["C. élect."],
	"Code de la défense": ["C. défense"],
	"Code des douanes": ["C. douanes"],
	"Code de l'énergie": ["C. énergie"],
	"Code des transports": ["C. transp."],
	"Code des postes et des communications électroniques": ["CPCE", "Code des postes", "C. post."],
};

/**
 * Textes constitutionnels (le « bloc de constitutionnalité »), cités comme les codes mais ni codes
 * ni lois pour Légifrance.
 */
export const CONSTITUTIONAL_TEXTS: Record<string, string[]> = {
	Constitution: ["Const.", "Constitution du 4 octobre 1958", "Constitution de 1958"],
	"Déclaration des droits de l'homme et du citoyen de 1789": [
		"DDHC",
		"Déclaration de 1789",
		"Déclaration des droits de l'homme et du citoyen",
	],
	"Charte de l'environnement de 2004": ["Charte de l'environnement", "Charte de 2004"],
};

/** Le Préambule de 1946 n'a pas d'articles mais des alinéas : cité à part. */
export const PREAMBLE_1946 = "Préambule de la Constitution de 1946";

/**
 * Textes constitutionnels dont l'article exact vient de l'API : route de consultation, identifiant
 * et fragment du titre attendu (le titre reçu est contrôlé : un identifiant faux ne donne jamais
 * l'article d'un autre texte). Valeurs vérifiées par Marginalia.
 */
export const LEGIFRANCE_TEXTS: Record<string, [route: string, textId: string, expectedTitle: string]> = {
	Constitution: ["/consult/legiPart", "LEGITEXT000006071194", "Constitution du 4 octobre 1958"],
	"Déclaration des droits de l'homme et du citoyen de 1789": [
		"/consult/lawDecree",
		"JORFTEXT000000697056",
		"Déclaration du 26 août 1789",
	],
};

/** Page du texte entier sur Légifrance, pour chaque texte du bloc de constitutionnalité. */
export const LEGIFRANCE_PAGES: Record<string, string> = {
	Constitution: "https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006071194",
	"Déclaration des droits de l'homme et du citoyen de 1789": "https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000697056",
	"Charte de l'environnement de 2004":
		"https://www.legifrance.gouv.fr/contenu/menu/droit-national-en-vigueur/constitution/charte-de-l-environnement",
	[PREAMBLE_1946]: "https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006071193",
};

/** Minuscules sans points ni espaces : « C. civ. » et « c.civ » se comparent égaux. */
const normalize = (text: string) => text.replace(/[\s.]+/g, "").toLowerCase();

/** Désignation normalisée → noms officiels des codes qui la portent (plusieurs si elle est ambiguë). */
const CODES_BY_NAME = new Map<string, string[]>();
for (const [code, aliases] of Object.entries({ ...CODES, ...CONSTITUTIONAL_TEXTS })) {
	for (const name of [code, ...aliases]) {
		const key = normalize(name);
		const known = CODES_BY_NAME.get(key) ?? [];
		if (!known.includes(code)) CODES_BY_NAME.set(key, [...known, code]);
	}
}

/**
 * « CPCE » désigne le Code des postes et des communications électroniques comme le Code des
 * procédures civiles d'exécution. Les articles de ce dernier ont un premier chiffre à trois
 * positions (« L. 111-1 », « R. 121-1 ») ; ceux du Code des postes un ou deux (« L. 33-1 »,
 * « L. 34-11 ») ou pas de tiret (« L. 130 »).
 */
const isCivilEnforcementNumber = (number: string) => /^[LRD]?\.?\s*\d{3}-\d/.test(number);

/**
 * Nom officiel du code désigné par `designation` (« C. civ. », « code civil »…). Si la désignation
 * convient à plusieurs codes, le numéro d'article départage ; sans numéro, le premier l'emporte.
 */
export function officialCodeName(designation: string, articleNumber = "") {
	const candidates = CODES_BY_NAME.get(normalize(designation));
	if (candidates && candidates.length > 1 && normalize(designation) === "cpce") {
		const enforcement = "Code des procédures civiles d'exécution";
		return isCivilEnforcementNumber(articleNumber) ? enforcement : candidates.find((c) => c !== enforcement);
	}
	return candidates?.[0];
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Motif insensible à la casse (JS n'a pas de groupe `(?i:…)` fiable sur toutes les plateformes). */
export const caseInsensitive = (text: string) =>
	[...text]
		.map((char) => {
			const [lower, upper] = [char.toLowerCase(), char.toUpperCase()];
			return lower === upper ? escapeRegex(char) : `[${lower}${upper}]`;
		})
		.join("");

/** Désignation tolérante aux points et aux espaces (« C.civ », « C. civ »). */
export const aliasPattern = (alias: string, fold: boolean) =>
	alias
		.split(/(\.\s*|\s+)/)
		.filter(Boolean)
		.map((token) =>
			token.startsWith(".") ? "\\.?\\s*" : /^\s+$/.test(token) ? "\\s+" : fold ? caseInsensitive(token) : escapeRegex(token)
		)
		.join("");

/**
 * Motif de toutes les désignations de codes : noms complets (sans casse), puis abréviations
 * (casse respectée, non suivies d'une lettre). Les plus longues d'abord.
 */
export const CODE_PATTERN = (() => {
	const full: string[] = [];
	const short: string[] = [];
	for (const [code, aliases] of Object.entries({ ...CODES, ...CONSTITUTIONAL_TEXTS })) {
		full.push(code);
		for (const alias of aliases) (/^(code |constitution|déclaration|charte)/i.test(alias) ? full : short).push(alias);
	}
	const alternatives = (names: string[], fold: boolean) =>
		names
			.sort((a, b) => b.length - a.length)
			.map((name) => aliasPattern(name, fold))
			.join("|");
	return `(?:${alternatives(full, true)})|(?:${alternatives(short, false)})(?![\\wÀ-ÿ])`;
})();
