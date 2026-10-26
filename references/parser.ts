/**
 * Détection des références juridiques (décisions, textes, articles de code,
 * identifiants Légifrance) dans le texte d'une note. Module pur : aucune
 * dépendance à Obsidian, afin d'être testable isolément.
 */

export type RefKind = "decision" | "texte" | "article" | "identifiant";

/** Référence juridique détectée dans une note. */
export interface LegalRef {
	/** Clef de déduplication et de cache, stable d'une note à l'autre. */
	key: string;
	kind: RefKind;
	/** Citation telle qu'écrite dans la note (espaces normalisés). */
	label: string;
	/** Termes de recherche (numéro de décision, de loi, article…). */
	query: string;
	/** Fond de l'API dans lequel retrouver la référence ; absent si non résoluble par l'API. */
	fond?: string;
	/** Lien direct, connu sans appel à l'API (identifiants Légifrance). */
	url?: string;
}

const BASE_URL = "https://www.legifrance.gouv.fr";

/** Lien de recherche Légifrance : toujours disponible, sans identifiants PISTE. */
export function searchUrl(query: string) {
	return `${BASE_URL}/search/all?tab_selection=all&searchField=ALL&searchType=ALL&query=${encodeURIComponent(query)}`;
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

/** Séparateur entre la juridiction et le numéro : tout sauf fin de phrase ou parenthèse. */
const GAP = "[^\\n;()]{0,90}?";

interface Rule {
	kind: RefKind;
	fond?: string;
	regex: RegExp;
	/** Numéro (ou termes de recherche) extrait de la correspondance. */
	query: (m: RegExpExecArray) => string;
}

const RULES: Rule[] = [
	{
		// Cass. civ. 1re, 12 mars 2020, n° 18-12.345
		kind: "decision",
		fond: "JURI",
		regex: new RegExp(
			`\\b(?:Cass(?:ation)?\\b\\.?|Cour de cassation|Crim\\.|Civ\\.|Soc\\.|Com\\.|Ass\\. plén\\.)${GAP}\\bn°\\s*(\\d{2}-\\d{2}[. ]?\\d{3})`,
			"g"
		),
		query: (m) => m[1].replace(/[ ]/, "."),
	},
	{
		// CE, sect., 12 mars 2020, n° 123456
		kind: "decision",
		fond: "CETAT",
		regex: new RegExp(`\\b(?:CE|Conseil d['’]État)\\b[,.]?${GAP}\\bn°\\s*(\\d{5,6})\\b`, "g"),
		query: (m) => m[1],
	},
	{
		// Cons. const., décision n° 2019-778 DC
		kind: "decision",
		fond: "CONSTIT",
		regex: new RegExp(
			`\\b(?:Cons\\.\\s*const\\.|CC|Conseil constitutionnel)[,.]?${GAP}\\b(?:n°\\s*)?(\\d{4}-\\d{1,4}\\s*(?:DC|QPC|LP|ORGA|PDR|FNR|AN|SEN|ELEC|REF|[LDI])\\b)`,
			"g"
		),
		query: (m) => m[1].replace(/\s+/g, " "),
	},
	{
		// loi n° 2016-1088 du 8 août 2016, ordonnance n° 2016-131, décret n° 2020-1310…
		kind: "texte",
		fond: "LODA_ETAT",
		regex: /\b(?:loi(?: organique| constitutionnelle)?|ordonnance|décret(?:-loi)?|arrêté)\s+n°\s*(\d{2,4}-\d+)(?:\s+du\s+\d{1,2}(?:er)?\s+\p{L}+\s+\d{4})?/giu,
		query: (m) => m[1],
	},
	{
		// article L. 1234-5 du code du travail
		kind: "article",
		regex: /\b(?:articles?|art\.)\s+((?:[LRD]\.?\s*)?\d+(?:-\d+)*)\s+du\s+(code\s+(?:de la |de l['’]|des |du |de |d['’])?\p{L}+(?:\s+(?:de la|de l['’]|des|du|de|d['’])?\s*\p{L}+){0,2}?)(?=\s*[,.;:)\n]|\s+(?:et|ou|dans|qui|est|sont|ne|a|prévoit|dispose)\b|$)/giu,
		query: (m) => `article ${m[1].replace(/\s+/g, "")} ${m[2].toLowerCase()}`,
	},
];

const ID_REGEX = /\b(JURITEXT|CETATEXT|CONSTEXT|JORFTEXT|LEGITEXT|LEGIARTI|JORFARTI)\d{12}\b/g;

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Extrait les références juridiques d'un texte, dédupliquées, dans l'ordre
 * d'apparition.
 */
export function parseReferences(text: string): LegalRef[] {
	const found: { index: number; ref: LegalRef }[] = [];

	for (const rule of RULES) {
		for (const m of text.matchAll(rule.regex)) {
			const query = normalize(rule.query(m as RegExpExecArray));
			found.push({
				index: m.index ?? 0,
				ref: {
					key: `${rule.kind}:${rule.fond ?? ""}:${query.toLowerCase()}`,
					kind: rule.kind,
					label: normalize(m[0]),
					query,
					fond: rule.fond,
				},
			});
		}
	}

	for (const m of text.matchAll(ID_REGEX)) {
		found.push({
			index: m.index ?? 0,
			ref: {
				key: `identifiant:${m[0]}`,
				kind: "identifiant",
				label: m[0],
				query: m[0],
				url: `${BASE_URL}/${ID_PATHS[m[1]]}/${m[0]}`,
			},
		});
	}

	const seen = new Set<string>();
	return found
		.sort((a, b) => a.index - b.index)
		.map(({ ref }) => ref)
		.filter((ref) => !seen.has(ref.key) && !!seen.add(ref.key));
}
