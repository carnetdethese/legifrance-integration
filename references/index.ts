import { LegalRef, parseReferences } from "./parser";
import { ResolvedLink } from "./resolver";

/**
 * Version du format du cache : change quand l'analyse ou les clefs changent,
 * ce qui invalide les références et liens mémorisés.
 */
export const REFERENCE_DATA_VERSION = 4;

/** Délai avant de relancer la recherche d'une référence introuvable (24 h). */
const MISS_RETRY_MS = 24 * 60 * 60 * 1000;
/** Délai après une erreur technique (réseau, service) : on réessaie plus vite (1 h). */
export const ERROR_RETRY_MS = 60 * 60 * 1000;

/** Contenu persisté dans `data.json` (clef `references`). */
export interface ReferenceData {
	version: number;
	/** Références par note ; `mtime` permet de ne reparser que les notes modifiées. */
	files: Record<string, { mtime: number; refs: LegalRef[] }>;
	/** Liens retrouvés via l'API, partagés entre toutes les notes. */
	links: Record<string, ResolvedLink>;
	/** Références cherchées sans succès : clef → date de la recherche (ms). */
	misses: Record<string, number>;
}

export const emptyReferenceData = (): ReferenceData => ({
	version: REFERENCE_DATA_VERSION,
	files: {},
	links: {},
	misses: {},
});

/** Données lues dans `data.json`, ou un cache vide si elles datent d'un ancien format. */
export const loadReferenceData = (saved?: ReferenceData): ReferenceData =>
	saved?.version === REFERENCE_DATA_VERSION ? saved : emptyReferenceData();

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
		delete this.data.misses[ref.key];
		this.onChange();
	}

	/**
	 * Mémorise qu'une référence n'a pas été trouvée, pour ne pas la rechercher à chaque ouverture de
	 * la note. `retryAfterMs` raccourcit le délai avant un nouvel essai (erreur technique).
	 */
	setMiss(ref: LegalRef, retryAfterMs = MISS_RETRY_MS) {
		this.data.misses[ref.key] = Date.now() - (MISS_RETRY_MS - retryAfterMs);
		this.onChange();
	}

	/** Références déjà analysées d'une note si elle n'a pas changé depuis, sans rien lire. */
	cached(path: string, mtime: number) {
		const entry = this.data.files[path];
		return entry?.mtime === mtime ? entry.refs : undefined;
	}

	/** Une recherche récente a-t-elle déjà échoué pour cette référence ? */
	isRecentMiss(ref: LegalRef) {
		const at = this.data.misses[ref.key];
		return at !== undefined && Date.now() - at < MISS_RETRY_MS;
	}
}
