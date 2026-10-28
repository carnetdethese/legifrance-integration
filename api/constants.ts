
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


export const dateJour = new Map<string, string>();

for (let i = 0; i <= 31; i++) {
	if (i == 0) {
		dateJour.set("", "");
	}
	else {
		dateJour.set(i.toString(),  i.toString());
	}
}

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
	["12", "Décembre"]
]);

const currentYear: number = new Date().getFullYear();

export const dateAnnee = new Map<string, string>();

for (let i = currentYear+1; i >= 1899; i--) {
	if (i == (currentYear+1)) {
		dateAnnee.set("", "");
	}
	else {
		dateAnnee.set(i.toString(),  i.toString());
	}
}


