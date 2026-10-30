/** Remplace les entités HTML courantes (`&gt;`, `&amp;`, `&#39;`, `&nbsp;`…) par leur caractère : l'API en laisse dans ses titres. */
export function decodeEntities(str: string) {
	const named: Record<string, string> = { gt: ">", lt: "<", amp: "&", quot: '"', apos: "'", nbsp: " " };
	return str.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (all, dec?: string, hex?: string, name?: string) => {
		const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : undefined;
		if (code !== undefined) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
		return named[(name ?? "").toLowerCase()] ?? all;
	});
}

/** Titre de l'API lisible : sans balises ni entités, espaces réduits. Affiché comme texte, jamais comme HTML. */
export const cleanTitle = (str: string | null | undefined) => decodeEntities(removeTags(str ?? "")).replace(/\s+/g, " ").trim();

/** Supprime toutes les balises HTML d'une chaîne. */
export function removeTags(str: string | null) {
	return str ? str.toString().replace(/<[^>]+>/g, "") : "";
}
