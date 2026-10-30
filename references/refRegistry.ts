/**
 * Références repérées dans le texte des notes, retrouvables par leur clef : le soulignement discret (éditeur et mode
 * lecture) ne porte que la clef (`data-lf-key`), l'aperçu au survol en retrouve la référence ici. Mémoire de la session,
 * bornée : quand elle dépasse la limite, les plus anciennes sortent.
 */
import type { LegalRef } from "./parser";

const LIMIT = 4000;
const refs = new Map<string, LegalRef>();

export function rememberRef(ref: LegalRef) {
	refs.delete(ref.key);
	refs.set(ref.key, ref);
	if (refs.size > LIMIT) for (const key of [...refs.keys()].slice(0, LIMIT / 4)) refs.delete(key);
}

export const recallRef = (key: string | undefined) => (key ? refs.get(key) : undefined);
