/**
 * Valeurs du formulaire de recherche : libellés des types de recherche, des opérateurs et des listes de date. Les codes
 * (clefs) sont ceux de l'API Légifrance ; les fonds et leurs critères de tri sont dans `abstracts/fonds.ts`.
 */

/** Façon de chercher un mot ou une expression (`typeRecherche` d'un critère) : code de l'API → libellé. */
export const typeRecherche = new Map<string, string>([
	["UN_DES_MOTS", "Un de ces mots"],
	["EXACTE", "Exacte"],
	["TOUS_LES_MOTS_DANS_UN_CHAMP", "Tous les mots"],
	["AUCUN_DES_MOTS", "Exclure ces mots"],
	["AUCUNE_CORRESPONDANCE_A_CETTE_EXPRESSION", "Exclure l'expression"],
]);

/** Opérateur entre un champ et les autres : code de l'API → libellé. */
export const operateursRecherche = new Map<string, string>([
	["ET", "et"],
	["OU", "ou"],
]);

/** Jours proposés par le sélecteur de date : une entrée vide, puis 1 à 31. */
export const dateJour = new Map<string, string>([["", ""], ...Array.from({ length: 31 }, (_, i): [string, string] => [String(i + 1), String(i + 1)])]);

/** Mois proposés : une entrée vide, puis numéro (1 à 12) → nom. */
export const dateMois = new Map<string, string>([
	["", ""],
	["1", "Janvier"],
	["2", "Février"],
	["3", "Mars"],
	["4", "Avril"],
	["5", "Mai"],
	["6", "Juin"],
	["7", "Juillet"],
	["8", "Août"],
	["9", "Septembre"],
	["10", "Octobre"],
	["11", "Novembre"],
	["12", "Décembre"],
]);

/** Années proposées : une entrée vide, puis de l'année en cours à 1899, la plus récente d'abord. */
export const dateAnnee = new Map<string, string>([
	["", ""],
	...Array.from({ length: new Date().getFullYear() - 1899 + 1 }, (_, i): [string, string] => [String(new Date().getFullYear() - i), String(new Date().getFullYear() - i)]),
]);
