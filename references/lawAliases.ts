/**
 * Lois citées par leur nom usuel (« loi Informatique et Libertés », « LCEN ») : table des lois, avec leur nature et
 * leur numéro, et motif de leurs désignations. Pour ajouter une loi, ajouter une entrée : le parseur la reconnaît
 * (suivie ou non de sa date) et la retrouve par son numéro. Chacun peut aussi compléter la table dans les réglages
 * (`parseCustomLaws`, une désignation par abréviation personnelle). Module pur.
 */
import { aliasPattern } from "./codes";
import { FULL_DATE_PATTERN } from "./dates";

/** Loi désignée par un nom usuel. */
export interface LawAlias {
	nature: string;
	/** Numéro officiel (« 78-17 »). */
	number: string;
	/** Désignations usuelles : noms (sans casse) et sigles en capitales (casse respectée). */
	names: string[];
}

export const LAW_ALIASES: LawAlias[] = [
	{ nature: "loi", number: "78-17", names: ["loi informatique et libertés", "loi relative à l'informatique, aux fichiers et aux libertés", "loi LIL"] },
	{ nature: "loi", number: "2004-575", names: ["loi pour la confiance dans l'économie numérique", "LCEN"] },
	{ nature: "loi", number: "2016-1321", names: ["loi pour une République numérique", "loi Lemaire"] },
	{ nature: "loi", number: "2004-801", names: ["loi du 6 août 2004 relative à la protection des personnes physiques à l'égard des traitements de données à caractère personnel"] },
];

/** Désignation normalisée (minuscules, sans accents, points, espaces ni apostrophes) → loi. */
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[\s.'’]+/g, "");

/** Lois ajoutées par l'utilisateur ; elles passent avant la table du plugin pour une même désignation. */
let customLaws: LawAlias[] = [];
let byName = new Map<string, LawAlias>();
let byNameRegex: RegExp;

/** Loi désignée par `designation` (« loi Informatique et Libertés »), si elle est dans la table. */
export const lawAliasOf = (designation: string) => byName.get(normalize(designation));

/** Apostrophe droite ou typographique ; lettres accentuées ou non (« Economie » écrit sans accent sur la capitale). */
const tolerant = (pattern: string) =>
	pattern
		.replace(/'/g, "['’]")
		.replace(/\[éÉ\]|\[èÈ\]|\[êÊ\]/g, "[eEéÉèÈêÊ]")
		.replace(/\[àÀ\]|\[âÂ\]/g, "[aAàÀâÂ]")
		.replace(/\[ôÔ\]/g, "[oOôÔ]")
		.replace(/\[îÎ\]|\[ïÏ\]/g, "[iIîÎïÏ]")
		.replace(/\[ûÛ\]|\[ùÙ\]/g, "[uUûÛùÙ]")
		.replace(/\[çÇ\]/g, "[cCçÇ]");

/** Motif de toutes les désignations : noms (sans casse), puis sigles (casse respectée, pas suivis d'une lettre). */
function aliasPatternOf(aliases: LawAlias[]) {
	const all = aliases.flatMap((alias) => alias.names);
	const isAcronym = (name: string) => /^[A-Z]{2,6}$/.test(name);
	const alternatives = (names: string[], fold: boolean) =>
		[...new Set(names)]
			.sort((a, b) => b.length - a.length)
			.map((name) => tolerant(aliasPattern(name, fold)))
			.join("|");
	return `(?:${alternatives(all.filter((n) => !isAcronym(n)), true)})|(?:${alternatives(all.filter(isAcronym), false)})(?![\\wÀ-ÿ])`;
}

/** Retient les lois à reconnaître : la table du plugin et celles de l'utilisateur (qui l'emportent pour une même désignation). */
export function setCustomLaws(laws: LawAlias[]) {
	customLaws = laws;
	const all = [...LAW_ALIASES, ...customLaws];
	byName = new Map(all.flatMap((alias) => alias.names.map((name): [string, LawAlias] => [normalize(name), alias])));
	byNameRegex = new RegExp(`(?<name>${aliasPatternOf(all)})(?:\\s*,?\\s*(?:\\(\\s*)?(?:en\\s+date\\s+du|du)\\s+(?<date>${FULL_DATE_PATTERN}))?`, "gu");
}
setCustomLaws([]);

/** Motif d'une loi citée par son nom usuel, suivi ou non de sa date (groupes `name` et `date`). */
export const lawByNameRegex = () => byNameRegex;

/** Lois ajoutées par l'utilisateur, telles que retenues (pour le compte rendu des réglages). */
export const currentCustomLaws = () => customLaws;

const NATURES = ["loi organique", "loi constitutionnelle", "loi de finances", "loi", "ordonnance", "décret-loi", "décret"];
const CUSTOM_LINE = new RegExp(
	`^(?<names>.+?)\\s*=\\s*(?:(?<nature>${NATURES.join("|")})\\s+)?(?:n\\s?[°º]\\s*)?(?<number>\\d{2,4}-\\d{1,4})\\s*$`,
	"iu"
);

/** Texte proposé dans les réglages tant que l'utilisateur n'a rien saisi. */
export const CUSTOM_LAWS_HELP = [
	"# Une loi par ligne : désignations séparées par |, puis = nature et numéro.",
	"# Exemples (retirer le # pour les activer) :",
	"# LCEN | loi confiance numérique = loi 2004-575",
	"# loi Informatique et Libertés | LIL = loi 78-17",
	"# Sans nature, « loi » est supposée. Les lignes qui commencent par # sont ignorées.",
].join("\n");

/** Lois d'un texte de réglages (une par ligne) et lignes refusées, avec leur numéro (à partir de 1). */
export function parseCustomLaws(text: string): { laws: LawAlias[]; errors: number[] } {
	const laws: LawAlias[] = [];
	const errors: number[] = [];
	text.split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (!line || line.startsWith("#")) return;
		const match = CUSTOM_LINE.exec(line);
		const names = match?.groups!.names.split("|").map((name) => name.trim().replace(/\s+/g, " ")).filter((name) => name.length >= 2);
		if (!match || !names?.length) return void errors.push(index + 1);
		laws.push({ nature: (match.groups!.nature ?? "loi").toLowerCase(), number: match.groups!.number, names });
	});
	return { laws, errors };
}
