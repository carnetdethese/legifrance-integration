/** Supprime toutes les balises HTML d'une chaîne. */
export function removeTags(str: string | null) {
	return str ? str.toString().replace(/<[^>]+>/g, "") : "";
}
