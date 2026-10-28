/**
 * Lois citées par leur nom usuel (« loi Informatique et Libertés », « LCEN ») : table des lois, avec leur nature et
 * leur numéro, et motif de leurs désignations. Pour ajouter une loi, ajouter une entrée : le parseur la reconnaît
 * (suivie ou non de sa date) et la retrouve par son numéro. Module pur.
 */
import { aliasPattern } from "./codes";

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
const BY_NAME = new Map(LAW_ALIASES.flatMap((alias) => alias.names.map((name): [string, LawAlias] => [normalize(name), alias])));

/** Loi désignée par `designation` (« loi Informatique et Libertés »), si elle est dans la table. */
export const lawAliasOf = (designation: string) => BY_NAME.get(normalize(designation));

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
export const LAW_ALIAS_PATTERN = (() => {
	const all = LAW_ALIASES.flatMap((alias) => alias.names);
	const isAcronym = (name: string) => /^[A-Z]{2,6}$/.test(name);
	const alternatives = (names: string[], fold: boolean) =>
		[...new Set(names)]
			.sort((a, b) => b.length - a.length)
			.map((name) => tolerant(aliasPattern(name, fold)))
			.join("|");
	return `(?:${alternatives(all.filter((n) => !isAcronym(n)), true)})|(?:${alternatives(all.filter(isAcronym), false)})(?![\\wÀ-ÿ])`;
})();
