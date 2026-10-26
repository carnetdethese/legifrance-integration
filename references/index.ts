import { LegalDatabase } from "./database";
import { LegalRef, parseCitations } from "./parser";
import { ResolvedLink } from "./resolver";

/** Délai avant de relancer la recherche d'une référence introuvable (24 h). */
const MISS_RETRY_MS = 24 * 60 * 60 * 1000;
/** Délai après une erreur technique (réseau, service) : on réessaie plus vite (1 h). */
export const ERROR_RETRY_MS = 60 * 60 * 1000;

/** Contenu d'une fiche de décision (table `decisions`). */
export interface DecisionFields {
	status: "complete" | "external" | "unresolved" | "error";
	legifranceId?: string;
	court?: string;
	number?: string;
	title?: string;
	date?: string;
	formation?: string;
	ecli?: string;
	solution?: string;
	html?: string;
	markdown?: string;
	error?: string;
}

/** Ligne de la table `refs`. */
interface RefRow {
	key: string;
	kind: LegalRef["kind"];
	label: string;
	query: string;
	data: string;
	url: string | null;
	fallback_url: string | null;
}

const toRef = (row: RefRow): LegalRef => ({
	key: row.key,
	kind: row.kind,
	label: row.label,
	query: row.query,
	data: JSON.parse(row.data),
	...(row.url && { url: row.url }),
	...(row.fallback_url && { fallbackUrl: row.fallback_url }),
});

/**
 * Index des références juridiques des notes, dans la base SQLite : qui cite quoi, adresses
 * retrouvées via l'API, recherches infructueuses. Indépendant d'Obsidian : le plugin fournit le
 * contenu des notes et la base.
 */
export class ReferenceIndex {
	/** Liens et échecs, gardés en mémoire : l'interface les lit à chaque affichage. */
	private links = new Map<string, ResolvedLink>();
	private misses = new Map<string, number>();

	constructor(readonly db: LegalDatabase) {
		for (const row of db.all<{ ref_key: string; url: string; title: string; text: string | null }>("SELECT ref_key, url, title, text FROM links")) {
			this.links.set(row.ref_key, { url: row.url, titre: row.title, texte: row.text ?? undefined });
		}
		for (const row of db.all<{ ref_key: string; at: number }>("SELECT ref_key, at FROM misses")) {
			this.misses.set(row.ref_key, row.at);
		}
	}

	/**
	 * Références d'une note. Le texte n'est lu et analysé que si la note a changé depuis la dernière
	 * analyse.
	 */
	async forFile(path: string, mtime: number, read: () => Promise<string>) {
		const cached = this.cached(path, mtime);
		if (cached) return cached;

		const citations = parseCitations(await read());
		this.db.transaction(() => {
			this.db.run("DELETE FROM citations WHERE note_path = ?", [path]);
			citations.forEach(({ ref, count }, ord) => {
				this.db.run(
					"INSERT OR REPLACE INTO refs (key, kind, label, query, data, url, fallback_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
					[ref.key, ref.kind, ref.label, ref.query, JSON.stringify(ref.data), ref.url ?? null, ref.fallbackUrl ?? null]
				);
				this.db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES (?, ?, ?, ?)", [path, ref.key, ord, count]);
			});
			this.db.run("INSERT OR REPLACE INTO notes (path, mtime, indexed_at) VALUES (?, ?, ?)", [path, mtime, Date.now()]);
		});
		return citations.map(({ ref }) => ref);
	}

	/** Références déjà analysées d'une note si elle n'a pas changé depuis, sans rien lire. */
	cached(path: string, mtime: number): LegalRef[] | undefined {
		if (this.db.get<{ mtime: number }>("SELECT mtime FROM notes WHERE path = ?", [path])?.mtime !== mtime) return undefined;
		return this.db
			.all<RefRow>(
				"SELECT r.* FROM citations c JOIN refs r ON r.key = c.ref_key WHERE c.note_path = ? ORDER BY c.ord",
				[path]
			)
			.map(toRef);
	}

	rename(oldPath: string, newPath: string) {
		this.db.transaction(() => {
			this.db.run("UPDATE notes SET path = ? WHERE path = ?", [newPath, oldPath]);
			this.db.run("UPDATE citations SET note_path = ? WHERE note_path = ?", [newPath, oldPath]);
		});
	}

	remove(path: string) {
		this.db.transaction(() => {
			this.db.run("DELETE FROM citations WHERE note_path = ?", [path]);
			this.db.run("DELETE FROM notes WHERE path = ?", [path]);
		});
	}

	/**
	 * Supprime les références que plus aucune note ne cite (ainsi que leurs liens, échecs et fiches
	 * de décisions).
	 * @returns le nombre de références supprimées.
	 */
	prune() {
		const orphans = this.db.all<{ key: string }>("SELECT key FROM refs WHERE key NOT IN (SELECT ref_key FROM citations)");
		this.db.transaction(() => {
			for (const { key } of orphans) {
				for (const table of ["refs", "links", "misses", "decisions"]) {
					this.db.run(`DELETE FROM ${table} WHERE ${table === "refs" ? "key" : "ref_key"} = ?`, [key]);
				}
				this.links.delete(key);
				this.misses.delete(key);
			}
		});
		return orphans.length;
	}

	/** Lien connu pour une référence : direct (identifiant) ou retrouvé via l'API. */
	linkFor(ref: LegalRef): ResolvedLink | undefined {
		return ref.url ? { url: ref.url, titre: ref.label } : this.links.get(ref.key);
	}

	setLink(ref: LegalRef, link: ResolvedLink) {
		this.links.set(ref.key, link);
		this.misses.delete(ref.key);
		this.db.transaction(() => {
			this.db.run("INSERT OR REPLACE INTO links (ref_key, url, title, text, resolved_at) VALUES (?, ?, ?, ?, ?)", [
				ref.key,
				link.url,
				link.titre,
				link.texte ?? null,
				Date.now(),
			]);
			this.db.run("DELETE FROM misses WHERE ref_key = ?", [ref.key]);
		});
	}

	/**
	 * Mémorise qu'une référence n'a pas été trouvée, pour ne pas la rechercher à chaque ouverture de
	 * la note. `retryAfterMs` raccourcit le délai avant un nouvel essai (erreur technique).
	 */
	setMiss(ref: LegalRef, retryAfterMs = MISS_RETRY_MS) {
		const at = Date.now() - (MISS_RETRY_MS - retryAfterMs);
		this.misses.set(ref.key, at);
		this.db.run("INSERT OR REPLACE INTO misses (ref_key, at) VALUES (?, ?)", [ref.key, at]);
	}

	/** Une recherche récente a-t-elle déjà échoué pour cette référence ? */
	isRecentMiss(ref: LegalRef) {
		const at = this.misses.get(ref.key);
		return at !== undefined && Date.now() - at < MISS_RETRY_MS;
	}

	/** Toutes les références du coffre, avec leur nombre total de citations. */
	allReferences(kind?: LegalRef["kind"]): (LegalRef & { citations: number })[] {
		return this.db
			.all<RefRow & { total: number }>(
				`SELECT r.*, SUM(c.count) AS total FROM refs r JOIN citations c ON c.ref_key = r.key
				 ${kind ? "WHERE r.kind = ?" : ""} GROUP BY r.key ORDER BY r.kind, r.label`,
				kind ? [kind] : []
			)
			.map((row) => ({ ...toRef(row), citations: row.total }));
	}

	/** Reprend les liens et échecs enregistrés dans `data.json` par les versions sans base SQLite. */
	importLegacy(legacy: { links?: Record<string, ResolvedLink>; misses?: Record<string, number> }) {
		this.db.transaction(() => {
			for (const [key, link] of Object.entries(legacy.links ?? {})) {
				this.links.set(key, link);
				this.db.run("INSERT OR IGNORE INTO links (ref_key, url, title, text, resolved_at) VALUES (?, ?, ?, ?, ?)", [key, link.url, link.titre, link.texte ?? null, Date.now()]);
			}
			for (const [key, at] of Object.entries(legacy.misses ?? {})) {
				this.misses.set(key, at);
				this.db.run("INSERT OR IGNORE INTO misses (ref_key, at) VALUES (?, ?)", [key, at]);
			}
		});
	}

	// --- Fiches de décisions -------------------------------------------------------------------

	/** Crée une fiche « à compléter » pour chaque décision citée qui n'en a pas encore. */
	ensureDecisionRows() {
		this.db.run(
			`INSERT OR IGNORE INTO decisions (ref_key) SELECT key FROM refs
			 WHERE kind = 'decision' OR (kind = 'identifiant' AND (label LIKE 'JURITEXT%' OR label LIKE 'CETATEXT%' OR label LIKE 'CONSTEXT%'))`
		);
	}

	/** Références des décisions dont la fiche reste à compléter (ou à retenter). */
	pendingDecisions(): LegalRef[] {
		return this.db
			.all<RefRow>(
				`SELECT r.* FROM decisions d JOIN refs r ON r.key = d.ref_key
				 WHERE d.status IN ('pending', 'unresolved', 'error') ORDER BY r.label`
			)
			.map(toRef);
	}

	/** Enregistre la fiche d'une décision. */
	saveDecision(refKey: string, fields: DecisionFields) {
		this.db.run(
			`UPDATE decisions SET status = ?, legifrance_id = ?, court = ?, number = ?, title = ?, date = ?, formation = ?,
			 ecli = ?, solution = ?, text_html = ?, text_markdown = ?, fetched_at = ?, error = ? WHERE ref_key = ?`,
			[
				fields.status,
				fields.legifranceId ?? null,
				fields.court ?? null,
				fields.number ?? null,
				fields.title ?? null,
				fields.date ?? null,
				fields.formation ?? null,
				fields.ecli ?? null,
				fields.solution ?? null,
				fields.html ?? null,
				fields.markdown ?? null,
				Date.now(),
				fields.error ?? null,
				refKey,
			]
		);
	}

	/** Effectifs de la base, pour les réglages. */
	stats() {
		const count = (sql: string) => this.db.get<{ n: number }>(sql)?.n ?? 0;
		return {
			notes: count("SELECT COUNT(*) AS n FROM notes"),
			references: count("SELECT COUNT(*) AS n FROM refs"),
			decisions: count("SELECT COUNT(*) AS n FROM refs WHERE kind = 'decision'"),
			links: count("SELECT COUNT(*) AS n FROM links"),
			complete: count("SELECT COUNT(*) AS n FROM decisions WHERE status = 'complete'"),
		};
	}

	/** Vide la base (notes, références, liens, fiches). */
	clear() {
		this.db.transaction(() => {
			for (const table of ["notes", "refs", "citations", "links", "misses", "decisions"]) this.db.run(`DELETE FROM ${table}`);
		});
		this.links.clear();
		this.misses.clear();
	}
}
