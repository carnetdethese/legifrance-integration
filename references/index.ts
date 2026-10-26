import { LegalRef, parseReferences } from "./parser";
import { ResolvedLink } from "./resolver";

/** Contenu persisté dans `data.json` (clef `references`). */
export interface ReferenceData {
	/** Références par note ; `mtime` permet de ne reparser que les notes modifiées. */
	files: Record<string, { mtime: number; refs: LegalRef[] }>;
	/** Liens retrouvés via l'API, partagés entre toutes les notes. */
	links: Record<string, ResolvedLink>;
}

export const emptyReferenceData = (): ReferenceData => ({ files: {}, links: {} });

/**
 * Cache des références juridiques par note. Indépendant d'Obsidian : le plugin
 * fournit le contenu des notes et persiste `data` lorsque `onChange` est appelé.
 */
export class ReferenceIndex {
	constructor(
		readonly data: ReferenceData,
		private onChange: () => void
	) {}

	/**
	 * Références d'une note. Le texte n'est lu et analysé que si la note a
	 * changé depuis la dernière analyse.
	 */
	async forFile(path: string, mtime: number, read: () => Promise<string>) {
		const cached = this.data.files[path];
		if (cached?.mtime === mtime) return cached.refs;

		const refs = parseReferences(await read());
		this.data.files[path] = { mtime, refs };
		this.onChange();
		return refs;
	}

	rename(oldPath: string, newPath: string) {
		if (!this.data.files[oldPath]) return;
		this.data.files[newPath] = this.data.files[oldPath];
		this.remove(oldPath);
	}

	remove(path: string) {
		delete this.data.files[path];
		this.onChange();
	}

	/** Lien connu pour une référence : direct (identifiant) ou retrouvé via l'API. */
	linkFor(ref: LegalRef): ResolvedLink | undefined {
		return ref.url ? { url: ref.url, titre: ref.label } : this.data.links[ref.key];
	}

	setLink(ref: LegalRef, link: ResolvedLink) {
		this.data.links[ref.key] = link;
		this.onChange();
	}
}
