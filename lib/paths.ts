/**
 * Noms et chemins de notes sûrs : ce qui vient de l'API ou de la saisie ne doit ni sortir du dossier prévu (`..`),
 * ni contenir de caractère interdit dans un nom de fichier ou dans un lien Obsidian. Module sans dépendance.
 */

/** Un nom de fichier (ou de dossier) : sans séparateur ni caractère interdit, jamais « . » ou « .. ». */
export const safeName = (name: string) =>
	name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+$/, "").slice(0, 120);

/** Un chemin dont chaque segment est un nom sûr ; les segments vides, « . » et « .. » disparaissent. */
export const safePath = (path: string) =>
	path
		.split(/[\\/]/)
		.map(safeName)
		.filter(Boolean)
		.join("/");

/** Remplace les séparateurs d'une valeur qui deviendra un nom de fichier : « 3/4/2020 » reste un nom, pas des dossiers. */
export const withoutSeparators = (value: string) => value.replace(/[\\/]/g, "-");
