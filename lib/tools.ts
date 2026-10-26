/** Supprime toutes les balises HTML d'une chaîne. */
export function removeTags(str: string | null) {
	return str ? str.toString().replace(/<[^>]+>/g, "") : "";
}

/** Remplace les paragraphes HTML (`<p>`) par des retours à la ligne. */
export function replaceParaTags(str: string) {
	return str.replace(/<p>/gi, "\n").replace(/<\/p>/gi, "");
}
