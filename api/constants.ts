export const typeRecherche = new Map<string, string>([ // Type de la recherche
	["UN_DES_MOTS", "Un de ces mots"],
	["EXACTE", "Exacte"],
	["TOUS_LES_MOTS_DANS_UN_CHAMP", "Tous les mots"],
	["AUCUN_DES_MOTS", "Exclure ces mots"],
	["AUCUNE_CORRESPONDANCE_A_CETTE_EXPRESSION", "Exclure l'expression"]
]);

export const operateursRecherche = new Map<string, string>([ // Opérateur de ce champ avec les autres expressions
    ["ET", "et"],
    ["OU", "ou"]
]);

export const codeFond = new Map<string, string>([ // Fond dans lequel la recherche sera effectuée
	["ALL", "Tous les fonds"],
	["CETAT", "Juridictions administratives"],
	["CONSTIT", "Conseil constitutionnel"],
	["JURI", "Juridictions judiciaires"],
	["LEGI", "Législation"]
]);

export const champRecherche = new Map<string, string>([ // Type du champ dans lequel chercher.
	["ALL", "D"],
	["TITLE", ""],
	["TABLE", ""],
	["NOR", ""],
	["NUM", ""],
	["ADVANCED_TEXTE_ID", ""],
	["NUM_DELIB", ""],
	["NUM_DEC", ""],
	["NUM_ARTICLE", ""],
	["ARTICLE", ""],
	["MINISTERE", ""],
	["VISA", ""],
	["NOTICE", ""],
	["VISA_NOTICE", ""],
	["TRAVAUX_PREP", ""],
	["SIGNATURE", ""],
	["NOTA", ""],
	["NUM_AFFAIRE", ""],
	["ABSTRATS", ""],
	["RESUMES", ""],
	["TEXTE", ""],
	["ECLI", ""],
	["NUM_LOI_DEF", ""],
	["TYPE_DECISION", ""],
	["NUMERO_INTERNE", ""],
	["REF_PUBLI", ""],
	["RESUME_CIRC", ""],
	["TEXTE_REF", ""],
	["TITRE_LOI_DEF", ""],
	["RAISON_SOCIALE", ""],
	["MOTS_CLES", ""],
	["IDCC", ""]
]);


