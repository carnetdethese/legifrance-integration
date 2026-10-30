/**
 * Plan d'un document : ses intertitres (titres, chapitres, « Article 4 »…), repérés dans son HTML pour que le lecteur
 * propose d'y aller sans faire défiler. Module pur.
 */
import { cleanTitle } from "./tools";

export interface OutlineItem {
	/** Ancre ajoutée au titre dans le HTML. */
	id: string;
	/** Niveau du titre (1 à 6). */
	level: number;
	text: string;
	/** Titre d'un article (« Article 4 ») : trop nombreux pour figurer dans le plan, on les cherche par le filtre. */
	article: boolean;
}

/** HTML dont chaque intertitre porte une ancre, et la liste de ces intertitres dans l'ordre du texte. */
export function withOutline(html: string): { html: string; items: OutlineItem[] } {
	const items: OutlineItem[] = [];
	const marked = html.replace(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (all, level: string, attributes: string | undefined, inner: string) => {
		const text = cleanTitle(inner);
		if (!text) return all;
		const id = `lf-h-${items.length}`;
		items.push({ id, level: Number(level), text, article: /^articles?\b/i.test(text) });
		return `<h${level}${(attributes ?? "").replace(/\sid\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "")} id="${id}">${inner}</h${level}>`;
	});
	return { html: marked, items };
}

/** Le plan vaut d'être affiché : assez de titres de section, ou beaucoup d'articles à retrouver. */
export const worthAnOutline = (items: OutlineItem[]) => items.filter((item) => !item.article).length >= 3 || items.length >= 10;
