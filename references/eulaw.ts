/**
 * Textes de l'Union européenne cités par leur nom ou leur sigle (« art. 32 RGPD », « art. 267
 * TFUE ») : table des textes, avec leur numéro CELEX, et motif de leurs désignations. Pour un
 * acte cité par son numéro (« règlement (UE) 2016/679 »), le CELEX se déduit du numéro (parser).
 */
import { aliasPattern } from "./codes";

/** Texte de l'Union : libellé affiché et désignations usuelles (sigles sensibles à la casse). */
interface EuText {
	label: string;
	aliases: string[];
}

/** Numéro CELEX → texte. Traités : versions consolidées 2016 (12016E, 12016M, 12016P). */
export const EU_TEXTS: Record<string, EuText> = {
	"32016R0679": {
		label: "RGPD",
		aliases: ["règlement général sur la protection des données", "RGPD", "GDPR"],
	},
	"12016E": {
		label: "TFUE",
		aliases: ["traité sur le fonctionnement de l'Union européenne", "TFUE"],
	},
	"12016M": {
		label: "TUE",
		aliases: ["traité sur l'Union européenne", "TUE"],
	},
	"12016P": {
		label: "Charte des droits fondamentaux de l'UE",
		aliases: [
			"Charte des droits fondamentaux de l'Union européenne",
			"Charte des droits fondamentaux",
			"CDFUE",
		],
	},
	"32022R2065": {
		label: "DSA",
		aliases: ["règlement sur les services numériques", "Digital Services Act", "DSA"],
	},
	"32022R1925": {
		label: "DMA",
		aliases: ["règlement sur les marchés numériques", "Digital Markets Act", "DMA"],
	},
	"32024R1689": {
		label: "Règlement sur l'IA",
		aliases: ["règlement sur l'intelligence artificielle", "AI Act", "RIA"],
	},
	"32002L0058": {
		label: "Directive ePrivacy",
		aliases: ["directive vie privée et communications électroniques", "ePrivacy", "directive 2002/58/CE"],
	},
	"31995L0046": {
		label: "Directive 95/46/CE",
		aliases: ["directive sur la protection des données de 1995"],
	},
	"32023R2854": {
		label: "Data Act",
		aliases: ["règlement sur les données"],
	},
	"32022R0868": {
		label: "Data Governance Act",
		aliases: ["règlement sur la gouvernance des données", "DGA"],
	},
	"32022L2555": {
		label: "NIS 2",
		aliases: ["directive NIS 2", "directive NIS2", "NIS2"],
	},
	"32014R0910": {
		label: "eIDAS",
		aliases: ["règlement eIDAS"],
	},
};

/** Désignation normalisée (minuscules, sans points ni espaces) → CELEX. */
const normalize = (text: string) => text.replace(/[\s.]+/g, "").toLowerCase();
const CELEX_BY_NAME = new Map(
	Object.entries(EU_TEXTS).flatMap(([celex, { label, aliases }]) =>
		[label, ...aliases].map((name): [string, string] => [normalize(name), celex])
	)
);

/** CELEX du texte désigné par `designation` (« RGPD », « traité sur le fonctionnement… »). */
export const euCelexOf = (designation: string) => CELEX_BY_NAME.get(normalize(designation));

/** Libellé court d'un texte de la table (« RGPD ») ; `undefined` pour un autre acte. */
export const euLabelOf = (celex: string) => EU_TEXTS[celex]?.label;

/** Motif de toutes les désignations : noms complets (sans casse) puis sigles (casse respectée), les plus longs d'abord. */
export const EU_PATTERN = (() => {
	const full: string[] = [];
	const short: string[] = [];
	for (const { label, aliases } of Object.values(EU_TEXTS)) {
		for (const name of [label, ...aliases]) (/^[A-Z]{2,5}$/.test(name) ? short : full).push(name);
	}
	const alternatives = (names: string[], fold: boolean) =>
		[...new Set(names)]
			.sort((a, b) => b.length - a.length)
			.map((name) => aliasPattern(name, fold))
			.join("|");
	return `(?:${alternatives(full, true)})|(?:${alternatives(short, false)})(?![\\wÀ-ÿ])`;
})();

/** Adresse d'un article d'un texte de l'Union sur EUR-Lex : le texte, ancré sur l'article (`#art_N`, selon le texte). */
export const euArticleUrl = (celex: string, article: string) =>
	`https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:${encodeURIComponent(celex)}#art_${encodeURIComponent(article)}`;
