import { LegalDatabase } from "./database";
import type { Relation, RelationRow } from "./genealogy";
import { decisionKey } from "./ids";
import { LegalRef, parseCitations } from "./parser";
import { ResolvedLink } from "./resolver";
import { stripMarks } from "./textMatch";
import type { ArticleVersion } from "./versions";

/** Délai avant de relancer la recherche d'une référence introuvable (24 h). */
const MISS_RETRY_MS = 24 * 60 * 60 * 1000;
/** Délai après une erreur technique (réseau, service) : on réessaie plus vite (1 h). */
export const ERROR_RETRY_MS = 60 * 60 * 1000;

/**
 * Références qui désignent une décision : citées par leurs éléments (juridiction, numéro) ou par un
 * identifiant Légifrance de décision (Cour de cassation, Conseil d'État, Conseil constitutionnel).
 * Condition SQL sur la table `refs`.
 */
export const DECISION_REFS_SQL = "kind = 'decision' OR (kind = 'identifiant' AND (label LIKE 'JURITEXT%' OR label LIKE 'CETATEXT%' OR label LIKE 'CONSTEXT%'))";

/** Contenu d'une fiche de décision (table `decisions`). */
export interface DecisionFields {
	status: "pending" | "complete" | "external" | "unresolved" | "error";
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
	/** Chemins de thèmes, résumé et vocabulaire (JSON) : voir `themes.ts` et `similarity.ts`. */
	themes?: string[];
	summary?: string;
	terms?: string;
}

/** Ligne de la table `decisions`. */
export interface StoredDecision {
	ref_key: string;
	status: string;
	legifrance_id: string | null;
	court: string | null;
	number: string | null;
	title: string | null;
	date: string | null;
	formation: string | null;
	ecli: string | null;
	solution: string | null;
	text_html: string | null;
	text_markdown: string | null;
	themes: string | null;
	summary: string | null;
	terms: string | null;
}

/** Document consulté (table `documents`). */
export interface StoredDocument {
	id: string;
	origin: string | null;
	title: string;
	date: string | null;
	number: string | null;
	court: string | null;
	formation: string | null;
	solution: string | null;
	url: string | null;
	text_html: string | null;
	text_markdown: string | null;
	fetched_at: number;
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
 *
 * Une section par groupe de tables : notes et citations (`forFile`…), généalogie, documents
 * consultés, versions d'articles, rapprochements, fiches (notes), liens et échecs de
 * résolution, décisions (contenu complété), puis effectifs et remise à zéro.
 */
export class ReferenceIndex {
	/** Liens et échecs, gardés en mémoire : l'interface les lit à chaque affichage. */
	private links = new Map<string, ResolvedLink>();
	private misses = new Map<string, number>();
	/** Fiches de décisions : identifiant Légifrance → chemin de la note. */
	private fichesById = new Map<string, string>();
	/** Notes d'articles créées par le plugin : chemin de la note → clef de l'article. */
	private articleNotePaths = new Map<string, string>();

	/** Un effectif : première colonne `n` de la requête, 0 si elle ne renvoie rien. */
	private count(sql: string) {
		return this.db.get<{ n: number }>(sql)?.n ?? 0;
	}

	/** Notes qui citent chaque référence, regroupées par clef de référence (`sql` renvoie `ref_key` et `note_path`). */
	notesByRef(sql: string) {
		const notes = new Map<string, string[]>();
		for (const { ref_key, note_path } of this.db.all<{ ref_key: string; note_path: string }>(sql)) {
			notes.set(ref_key, [...(notes.get(ref_key) ?? []), note_path]);
		}
		return notes;
	}

	/** Oublie en mémoire la fiche enregistrée pour cette note. */
	private forgetFiche(path: string) {
		for (const [id, notePath] of this.fichesById) if (notePath === path) this.fichesById.delete(id);
	}

	constructor(readonly db: LegalDatabase) {
		for (const row of db.all<{ note_path: string; legifrance_id: string | null }>("SELECT note_path, legifrance_id FROM fiches")) {
			if (row.legifrance_id) this.fichesById.set(row.legifrance_id, row.note_path);
		}
		for (const row of db.all<{ ref_key: string; note_path: string }>("SELECT ref_key, note_path FROM article_notes")) {
			this.articleNotePaths.set(row.note_path, row.ref_key);
		}
		for (const row of db.all<{ ref_key: string; url: string; title: string; text: string | null; status: string | null; manual: number | null }>("SELECT ref_key, url, title, text, status, manual FROM links")) {
			this.links.set(row.ref_key, { url: row.url, titre: stripMarks(row.title), texte: row.text ?? undefined, statut: row.status ?? undefined, ...(row.manual && { manuel: true }) });
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
		// Une note d'article cite d'autres articles dans son texte : ces citations ne sont pas celles de l'utilisateur.
		if (this.isArticleNote(path)) {
			this.db.run("DELETE FROM citations WHERE note_path = ?", [path]);
			return citations.map(({ ref }) => ref);
		}
		this.db.transaction(() => {
			this.db.run("DELETE FROM citations WHERE note_path = ?", [path]);
			citations.forEach(({ ref, count }, ord) => {
				// Une même décision citée par numéro peut porter un nom et une date (indices) dans une note et pas dans l'autre : on les garde.
				const data = { ...(this.hintsOf(ref) ?? {}), ...ref.data };
				this.db.run(
					"INSERT OR REPLACE INTO refs (key, kind, label, query, data, url, fallback_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
					[ref.key, ref.kind, ref.label, ref.query, JSON.stringify(data), ref.url ?? null, ref.fallbackUrl ?? null]
				);
				this.db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES (?, ?, ?, ?)", [path, ref.key, ord, count]);
			});
			this.db.run("INSERT OR REPLACE INTO notes (path, mtime, indexed_at) VALUES (?, ?, ?)", [path, mtime, Date.now()]);
		});
		return citations.map(({ ref }) => ref);
	}

	/** Indices (nom, date) déjà enregistrés pour une décision citée par son numéro. */
	private hintsOf(ref: LegalRef): { name: string; decided: string } | undefined {
		if (ref.kind !== "decision" || !ref.data.number || ref.data.name) return undefined;
		const stored = this.db.get<{ data: string }>("SELECT data FROM refs WHERE key = ?", [ref.key]);
		const data = stored ? (JSON.parse(stored.data) as Record<string, string>) : undefined;
		return data?.name && data.decided ? { name: data.name, decided: data.decided } : undefined;
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

	/**
	 * Si les notes ont été analysées par une autre version du parseur (`PARSER_VERSION`), toutes sont à relire :
	 * leurs références ne sont plus celles que reconnaît le parseur actuel (nouvelles citations, fausses citations
	 * écartées). La relecture est locale, sans requête.
	 * @returns `true` si des notes sont à relire
	 */
	parserChanged(version: number) {
		const stored = this.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'parser_version'")?.value;
		if (stored === String(version)) return false;
		this.db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('parser_version', ?)", [String(version)]);
		if (!this.db.get("SELECT 1 FROM notes LIMIT 1")) return false;
		this.db.run("UPDATE notes SET mtime = 0");
		return true;
	}

	rename(oldPath: string, newPath: string) {
		this.db.transaction(() => {
			this.db.run("UPDATE notes SET path = ? WHERE path = ?", [newPath, oldPath]);
			this.db.run("UPDATE citations SET note_path = ? WHERE note_path = ?", [newPath, oldPath]);
			this.db.run("UPDATE fiches SET note_path = ? WHERE note_path = ?", [newPath, oldPath]);
			this.db.run("UPDATE article_notes SET note_path = ? WHERE note_path = ?", [newPath, oldPath]);
		});
		const articleKey = this.articleNotePaths.get(oldPath);
		if (articleKey) {
			this.articleNotePaths.delete(oldPath);
			this.articleNotePaths.set(newPath, articleKey);
		}
		for (const [id, path] of this.fichesById) if (path === oldPath) this.fichesById.set(id, newPath);
	}

	remove(path: string) {
		this.db.transaction(() => {
			this.db.run("DELETE FROM citations WHERE note_path = ?", [path]);
			this.db.run("DELETE FROM notes WHERE path = ?", [path]);
			this.db.run("DELETE FROM article_notes WHERE note_path = ?", [path]);
		});
		this.articleNotePaths.delete(path);
		this.removeFiche(path);
	}

	// --- Généalogie ------------------------------------------------------------------------------

	/** Enregistre les décisions citées par le texte de `fromId` et note que son texte a été analysé. */
	saveRelations(fromId: string, relations: Relation[]) {
		this.db.transaction(() => {
			this.db.run("DELETE FROM decision_relations WHERE from_id = ?", [fromId]);
			for (const { ref, kind, extract } of relations) {
				this.db.run(
					"INSERT OR REPLACE INTO decision_relations (from_id, to_key, to_label, to_court, to_number, kind, extract) VALUES (?, ?, ?, ?, ?, ?, ?)",
					[fromId, ref.key, ref.label, ref.data.court ?? null, ref.data.number ?? null, kind, extract]
				);
			}
			this.db.run("UPDATE decisions SET relations_at = ? WHERE legifrance_id = ?", [Date.now(), fromId]);
		});
	}

	/** Toutes les relations enregistrées. */
	allRelations(): RelationRow[] {
		return this.db.all<RelationRow>("SELECT from_id, to_key, to_label, to_court, to_number, kind, extract FROM decision_relations");
	}

	/** Décisions complètes dont le texte n'a pas encore été analysé pour la généalogie. */
	decisionsWithoutRelations() {
		return this.db.all<{ legifrance_id: string; text_markdown: string }>(
			"SELECT legifrance_id, text_markdown FROM decisions WHERE status = 'complete' AND relations_at IS NULL AND text_markdown IS NOT NULL AND legifrance_id IS NOT NULL"
		);
	}

	// --- Documents consultés ---------------------------------------------------------------------

	/** Enregistre (ou remplace) un document consulté ; le surlignage de la recherche (`<mark>`) n'est pas conservé. */
	saveDocument(doc: Omit<StoredDocument, "fetched_at">) {
		const unmark = (html: string | null) => html?.replace(/<\/?mark\b[^>]*>/gi, "") ?? null;
		this.db.run(
			`INSERT OR REPLACE INTO documents (id, origin, title, date, number, court, formation, solution, url, text_html, text_markdown, fetched_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[doc.id, doc.origin, doc.title, doc.date, doc.number, doc.court, doc.formation, doc.solution, doc.url, unmark(doc.text_html), unmark(doc.text_markdown), Date.now()]
		);
	}

	/** Document consulté, s'il est en base. */
	documentFor(id: string): StoredDocument | undefined {
		return this.db.get<StoredDocument>("SELECT * FROM documents WHERE id = ?", [id]);
	}

	/** Lien (et texte) d'un article ou d'un texte retrouvé pour les citations, d'après l'identifiant de son adresse. */
	linkByDocumentId(id: string) {
		return this.db.get<{ url: string; title: string; text: string | null; status: string | null }>(
			"SELECT url, title, text, status FROM links WHERE url LIKE ? AND text IS NOT NULL LIMIT 1",
			[`%${id}%`]
		);
	}

	// --- Versions des articles -------------------------------------------------------------------

	/** Versions d'un article relevées sur l'API, ou `undefined` si elles ne l'ont pas encore été. */
	articleVersions(key: string): ArticleVersion[] | undefined {
		const row = this.db.get<{ versions: string }>("SELECT versions FROM article_versions WHERE article_key = ?", [key]);
		return row ? (JSON.parse(row.versions) as ArticleVersion[]) : undefined;
	}

	saveArticleVersions(key: string, versions: ArticleVersion[]) {
		this.db.run("INSERT OR REPLACE INTO article_versions (article_key, versions, fetched_at) VALUES (?, ?, ?)", [key, JSON.stringify(versions), Date.now()]);
	}

	// --- Rapprochements manuels ------------------------------------------------------------------

	/** Rapprochements faits à la main : [identifiant rapproché, identifiant conservé]. */
	manualMerges(): [string, string][] {
		return this.db.all<{ alias_id: string; target_id: string }>("SELECT alias_id, target_id FROM decision_merges").map((r) => [r.alias_id, r.target_id]);
	}

	/** Enregistre des rapprochements ([identifiant rapproché, identifiant conservé]). */
	mergeDecisions(merges: [string, string][]) {
		this.db.transaction(() => {
			for (const [alias, target] of merges) {
				// Une décision conservée jusque-là qui est rapprochée à son tour : ses propres alias suivent.
				this.db.run("UPDATE decision_merges SET target_id = ? WHERE target_id = ?", [target, alias]);
				this.db.run("INSERT OR REPLACE INTO decision_merges (alias_id, target_id) VALUES (?, ?)", [alias, target]);
			}
		});
	}

	/** Défait les rapprochements manuels qui touchent ces identifiants. */
	unmergeDecisions(ids: string[]) {
		this.db.transaction(() => {
			for (const id of ids) this.db.run("DELETE FROM decision_merges WHERE alias_id = ? OR target_id = ?", [id, id]);
		});
	}

	/** Suggestions de rapprochement écartées : paires d'identifiants. */
	dismissedMerges(): [string, string][] {
		return this.db.all<{ a_id: string; b_id: string }>("SELECT a_id, b_id FROM decision_dismissed").map((r) => [r.a_id, r.b_id]);
	}

	/** Écarte une suggestion de rapprochement pour toutes les références des deux décisions. */
	dismissMerge(a: string[], b: string[]) {
		this.db.transaction(() => {
			for (const x of a) for (const y of b) this.db.run("INSERT OR REPLACE INTO decision_dismissed (a_id, b_id) VALUES (?, ?)", [x, y]);
		});
	}

	// --- Fiches : notes Obsidian reconnues comme fiches de décisions ------------------------------

	/**
	 * Enregistre une note comme fiche de décision (avec son identifiant Légifrance, s'il est connu).
	 * @returns `true` si la base a changé.
	 */
	setFiche(path: string, legifranceId?: string) {
		const current = this.db.get<{ legifrance_id: string | null }>("SELECT legifrance_id FROM fiches WHERE note_path = ?", [path]);
		if (current && (current.legifrance_id ?? undefined) === legifranceId) return false;
		this.db.run("INSERT OR REPLACE INTO fiches (note_path, legifrance_id, indexed_at) VALUES (?, ?, ?)", [path, legifranceId ?? null, Date.now()]);
		this.forgetFiche(path);
		if (legifranceId) this.fichesById.set(legifranceId, path);
		return true;
	}

	/** La note n'est plus une fiche. @returns `true` si elle l'était. */
	removeFiche(path: string) {
		if (!this.db.get("SELECT 1 FROM fiches WHERE note_path = ?", [path])) return false;
		this.db.run("DELETE FROM fiches WHERE note_path = ?", [path]);
		this.forgetFiche(path);
		return true;
	}

	/** Chemin de la fiche liée à cet identifiant Légifrance, s'il y en a une. */
	ficheByLegifranceId(id: string) {
		return this.fichesById.get(id);
	}

	/** Chemins des notes enregistrées comme fiches. */
	fichePaths() {
		return this.db.all<{ note_path: string }>("SELECT note_path FROM fiches").map((row) => row.note_path);
	}

	/**
	 * Fiche de la décision citée : celle dont l'identifiant Légifrance est celui de la référence
	 * (identifiant cité, adresse directe, lien retrouvé via l'API ou fiche complétée).
	 */
	ficheFor(ref: LegalRef): string | undefined {
		if (this.fichesById.size === 0 || (ref.kind !== "decision" && ref.kind !== "identifiant")) return undefined;
		const candidates = [
			decisionKey(ref.label),
			ref.url && decisionKey(ref.url),
			this.links.get(ref.key) && decisionKey(this.links.get(ref.key)!.url),
			this.db.get<{ legifrance_id: string | null }>("SELECT legifrance_id FROM decisions WHERE ref_key = ?", [ref.key])?.legifrance_id,
		];
		for (const id of candidates) {
			const path = id ? this.fichesById.get(id) : undefined;
			if (path) return path;
		}
		return undefined;
	}

	ficheStats() {
		return {
			fiches: this.count("SELECT COUNT(*) AS n FROM fiches"),
			identified: this.count("SELECT COUNT(*) AS n FROM fiches WHERE legifrance_id IS NOT NULL"),
		};
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
				for (const table of ["refs", "links", "misses", "decisions", "decision_precisions"]) {
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

	/**
	 * Enregistre le lien d'une référence. Un lien choisi par l'utilisateur (`manual`) n'est jamais remplacé par une
	 * recherche automatique : seul un nouveau choix (`manual`) ou `clearLink` le change.
	 */
	setLink(ref: LegalRef, link: ResolvedLink, manual = false) {
		const before = this.links.get(ref.key);
		if (before?.manuel && !manual) return;
		link = { ...link, titre: stripMarks(link.titre), ...(manual && { manuel: true }) };
		this.links.set(ref.key, link);
		this.misses.delete(ref.key);
		// Veille : un statut de vigueur ou un texte qui change entre deux consultations du même document est signalé.
		const changed = !!before && before.url === link.url && (before.statut !== link.statut || (!!before.texte && !!link.texte && before.texte !== link.texte));
		this.db.transaction(() => {
			this.db.run(
				`INSERT INTO links (ref_key, url, title, text, resolved_at, status, manual) VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(ref_key) DO UPDATE SET url = excluded.url, title = excluded.title, text = excluded.text, resolved_at = excluded.resolved_at, status = excluded.status, manual = excluded.manual`,
				[ref.key, link.url, link.titre, link.texte ?? null, Date.now(), link.statut ?? null, manual ? 1 : 0]
			);
			// Un autre document : l'ancien statut et l'ancien signalement de changement ne le concernent pas.
			if (before && before.url !== link.url) this.db.run("UPDATE links SET previous_status = NULL, changed_at = NULL WHERE ref_key = ?", [ref.key]);
			if (changed) this.db.run("UPDATE links SET previous_status = ?, changed_at = ? WHERE ref_key = ?", [before.statut ?? null, Date.now(), ref.key]);
			this.db.run("DELETE FROM misses WHERE ref_key = ?", [ref.key]);
		});
	}

	/** Oublie le lien d'une référence (même choisi par l'utilisateur) : la recherche automatique la reprendra. */
	clearLink(ref: LegalRef) {
		this.links.delete(ref.key);
		this.misses.delete(ref.key);
		this.db.transaction(() => {
			this.db.run("DELETE FROM links WHERE ref_key = ?", [ref.key]);
			this.db.run("DELETE FROM misses WHERE ref_key = ?", [ref.key]);
		});
	}

	/** Articles et textes dont le lien a été vérifié avant `before` (ms), les plus citées d'abord. */
	articlesToRefresh(before: number): LegalRef[] {
		return this.db
			.all<RefRow>(
				`SELECT r.* FROM refs r JOIN links l ON l.ref_key = r.key
				 LEFT JOIN (SELECT ref_key, SUM(count) AS total FROM citations GROUP BY ref_key) c ON c.ref_key = r.key
				 WHERE r.kind IN ('article', 'texte') AND l.resolved_at < ? AND COALESCE(l.manual, 0) = 0
				 ORDER BY COALESCE(c.total, 0) DESC, l.resolved_at`,
				[before]
			)
			.map(toRef);
	}

	/** Le lien vient d'être revérifié sans nouvelle information : il ne sera pas redemandé avant le prochain délai. */
	touchLink(key: string) {
		this.db.run("UPDATE links SET resolved_at = ? WHERE ref_key = ?", [Date.now(), key]);
	}

	/** Articles et textes dont le statut ou le texte a changé depuis la dernière vérification, non encore signalés comme vus. */
	changedArticles(): { key: string; label: string; url: string; status: string | null; previousStatus: string | null; changedAt: number; notes: string[] }[] {
		const notes = this.notesByRef("SELECT ref_key, note_path FROM citations");
		return this.db
			.all<{ key: string; label: string; url: string; status: string | null; previous_status: string | null; changed_at: number }>(
				`SELECT r.key, r.label, l.url, l.status, l.previous_status, l.changed_at FROM links l JOIN refs r ON r.key = l.ref_key
				 WHERE l.changed_at IS NOT NULL ORDER BY l.changed_at DESC`
			)
			.map((row) => ({ key: row.key, label: row.label, url: row.url, status: row.status, previousStatus: row.previous_status, changedAt: row.changed_at, notes: notes.get(row.key) ?? [] }));
	}

	/** L'utilisateur a pris connaissance du changement. */
	acknowledgeChange(key: string) {
		this.db.run("UPDATE links SET changed_at = NULL, previous_status = NULL WHERE ref_key = ?", [key]);
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

	/** Une recherche a-t-elle déjà échoué pour cette clef (référence ou fiche), quel que soit son âge ? */
	hasMiss(key: string) {
		return this.misses.has(key);
	}

	/** Mémorise une recherche infructueuse sous une clef libre (fiche sans identifiant). */
	setMissKey(key: string) {
		const at = Date.now();
		this.misses.set(key, at);
		this.db.run("INSERT OR REPLACE INTO misses (ref_key, at) VALUES (?, ?)", [key, at]);
	}

	/** Une recherche récente a-t-elle déjà échoué pour cette référence ? */
	isRecentMiss(ref: LegalRef) {
		const at = this.misses.get(ref.key);
		return at !== undefined && Date.now() - at < MISS_RETRY_MS;
	}

	// --- Notes d'articles --------------------------------------------------------------------------

	/** Cette note est-elle une note d'article créée par le plugin ? */
	isArticleNote(path: string) {
		return this.articleNotePaths.has(path);
	}

	/** Chemin de la note de l'article, si elle a été créée. */
	articleNoteFor(key: string) {
		for (const [path, articleKey] of this.articleNotePaths) if (articleKey === key) return path;
		return undefined;
	}

	/** Notes d'articles : [clef de l'article, chemin de la note]. */
	articleNotes(): [string, string][] {
		return [...this.articleNotePaths].map(([path, key]) => [key, path]);
	}

	/** Enregistre la note d'un article (à faire avant sa création : son contenu ne doit pas compter comme des citations). */
	setArticleNote(key: string, path: string) {
		const previous = this.articleNoteFor(key);
		if (previous) this.articleNotePaths.delete(previous);
		this.articleNotePaths.set(path, key);
		this.db.run("INSERT OR REPLACE INTO article_notes (ref_key, note_path) VALUES (?, ?)", [key, path]);
	}

	/** Oublie la note d'un article (elle n'est plus tenue à jour). */
	forgetArticleNote(key: string) {
		const path = this.articleNoteFor(key);
		if (path) this.articleNotePaths.delete(path);
		this.db.run("DELETE FROM article_notes WHERE ref_key = ?", [key]);
	}

	// --- Précisions de l'utilisateur -------------------------------------------------------------

	/** Ce que l'utilisateur a précisé pour cette référence (formulaire « Préciser »), s'il l'a fait. */
	precisionsFor(key: string): Record<string, string> | undefined {
		const row = this.db.get<{ data: string }>("SELECT data FROM decision_precisions WHERE ref_key = ?", [key]);
		return row ? (JSON.parse(row.data) as Record<string, string>) : undefined;
	}

	/** Conserve les précisions saisies (les champs vides sont écartés ; rien de renseigné : on oublie). */
	savePrecisions(key: string, precisions: Record<string, string | undefined>) {
		const kept = Object.fromEntries(Object.entries(precisions).filter(([, value]) => value?.trim()).map(([name, value]) => [name, value!.trim()]));
		if (Object.keys(kept).length === 0) this.db.run("DELETE FROM decision_precisions WHERE ref_key = ?", [key]);
		else this.db.run("INSERT OR REPLACE INTO decision_precisions (ref_key, data) VALUES (?, ?)", [key, JSON.stringify(kept)]);
	}

	/** Décisions citées que la recherche n'a pas retrouvées, les plus citées d'abord. */
	unresolvedDecisions(): (LegalRef & { citations: number; notes: string[] })[] {
		const notes = this.notesByRef("SELECT c.ref_key, c.note_path FROM citations c JOIN decisions d ON d.ref_key = c.ref_key WHERE d.status = 'unresolved'");
		return this.db
			.all<RefRow & { total: number }>(
				`SELECT r.*, SUM(c.count) AS total FROM refs r JOIN decisions d ON d.ref_key = r.key JOIN citations c ON c.ref_key = r.key
				 WHERE d.status = 'unresolved' GROUP BY r.key ORDER BY total DESC, r.label`
			)
			.map((row) => ({ ...toRef(row), citations: row.total, notes: notes.get(row.key) ?? [] }));
	}

	/** Articles et textes cités dont l'adresse n'est pas connue et dont la recherche n'a pas échoué récemment, les plus cités d'abord. */
	unresolvedArticles(): LegalRef[] {
		return [...this.allReferences("article"), ...this.allReferences("texte")]
			.filter((ref) => !this.linkFor(ref) && !this.isRecentMiss(ref))
			.sort((a, b) => b.citations - a.citations || a.label.localeCompare(b.label));
	}

	/**
	 * Articles et textes cités sans adresse retrouvée, les plus cités d'abord : ceux dont la recherche a échoué
	 * (`tried`), ceux pas encore cherchés et ceux que l'API ne sait pas retrouver (code inconnu…).
	 */
	unlinkedTexts(): (LegalRef & { citations: number; notes: string[]; tried: boolean })[] {
		const notes = this.notesByRef("SELECT c.ref_key, c.note_path FROM citations c JOIN refs r ON r.key = c.ref_key WHERE r.kind IN ('article', 'texte') ORDER BY c.note_path");
		return [...this.allReferences("article"), ...this.allReferences("texte")]
			.filter((ref) => !this.linkFor(ref))
			.map((ref) => ({ ...ref, notes: notes.get(ref.key) ?? [], tried: this.hasMiss(ref.key) }))
			.sort((a, b) => b.citations - a.citations || a.label.localeCompare(b.label));
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

	// --- Décisions : contenu récupéré sur l'API (table `decisions`) -------------------------------

	/** Crée une fiche « à compléter » pour chaque décision citée qui n'en a pas encore. */
	ensureDecisionRows() {
		this.db.run(`INSERT OR IGNORE INTO decisions (ref_key) SELECT key FROM refs WHERE ${DECISION_REFS_SQL}`);
	}

	/**
	 * Références des décisions dont la fiche reste à compléter : jamais traitées, ou en erreur
	 * technique. Les décisions marquées « introuvables » ne sont reprises que sur demande
	 * (`retryUnresolved`) : chaque nouvel essai coûte des requêtes.
	 */
	pendingDecisions(retryUnresolved = false): LegalRef[] {
		return this.db
			.all<RefRow>(
				`SELECT r.* FROM decisions d JOIN refs r ON r.key = d.ref_key
				 WHERE d.status IN ('pending', 'error'${retryUnresolved ? ", 'unresolved'" : ""})
				    OR (d.status = 'complete' AND d.themes IS NULL) -- complétées avant la lecture des thèmes (une liste vide compte)
				 ORDER BY r.label`
			)
			.map(toRef);
	}

	/** Enregistre la fiche d'une décision. */
	saveDecision(refKey: string, fields: DecisionFields) {
		this.db.run(
			`UPDATE decisions SET status = ?, legifrance_id = ?, court = ?, number = ?, title = ?, date = ?, formation = ?,
			 ecli = ?, solution = ?, text_html = ?, text_markdown = ?, fetched_at = ?, error = ?, themes = ?, summary = ?, terms = ? WHERE ref_key = ?`,
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
				fields.status === "complete" ? JSON.stringify(fields.themes ?? []) : null,
				fields.summary ?? null,
				fields.terms ?? null,
				refKey,
			]
		);
	}

	/**
	 * Fiche déjà complétée d'une décision (par son identifiant Légifrance), lue dans la base : évite de
	 * la redemander à l'API.
	 * @param analyzed exige aussi les thèmes et le vocabulaire (fiche complétée depuis la lecture des thèmes).
	 */
	completeDecision(textId: string, analyzed = false) {
		return this.db.get<StoredDecision>(
			`SELECT * FROM decisions WHERE legifrance_id = ? AND status = 'complete' ${analyzed ? "AND themes IS NOT NULL AND terms IS NOT NULL" : ""} ORDER BY fetched_at DESC LIMIT 1`,
			[textId]
		);
	}

	/** Recopie dans la fiche de `refKey` une fiche déjà complétée (même décision citée d'une autre façon). */
	copyDecision(from: StoredDecision, refKey: string) {
		this.saveDecision(refKey, {
			status: "complete",
			legifranceId: from.legifrance_id ?? undefined,
			court: from.court ?? undefined,
			number: from.number ?? undefined,
			title: from.title ?? undefined,
			date: from.date ?? undefined,
			formation: from.formation ?? undefined,
			ecli: from.ecli ?? undefined,
			solution: from.solution ?? undefined,
			html: from.text_html ?? undefined,
			markdown: from.text_markdown ?? undefined,
			themes: from.themes ? (JSON.parse(from.themes) as string[]) : [],
			summary: from.summary ?? undefined,
			terms: from.terms ?? undefined,
		});
	}

	/** Enregistre les articles visés par une décision (remplace les précédents). */
	saveDecisionArticles(decisionId: string, articles: { key: string; label: string; count: number }[]) {
		this.db.transaction(() => {
			this.db.run("DELETE FROM decision_articles WHERE decision_id = ?", [decisionId]);
			for (const { key, label, count } of articles) {
				this.db.run("INSERT OR REPLACE INTO decision_articles (decision_id, article_key, label, count) VALUES (?, ?, ?, ?)", [decisionId, key, label, count]);
			}
		});
	}

	/** Avancement du complément des fiches de décisions : décisions citées, par état de leur fiche. */
	decisionProgress() {
		const cited = this.count(`SELECT COUNT(*) AS n FROM refs WHERE ${DECISION_REFS_SQL}`);
		const status = (value: string) => this.count(`SELECT COUNT(*) AS n FROM decisions WHERE status = '${value}'`);
		const complete = status("complete");
		const external = status("external");
		const unresolved = status("unresolved");
		const errors = status("error");
		return { cited, complete, external, unresolved, errors, pending: Math.max(0, cited - complete - external - unresolved - errors) };
	}

	/** Notes reconnues comme fiches, avec l'identifiant de leur décision (s'il est connu). */
	ficheEntries() {
		return this.db.all<{ note_path: string; legifrance_id: string | null }>("SELECT note_path, legifrance_id FROM fiches ORDER BY note_path").map((row) => ({
			path: row.note_path,
			id: row.legifrance_id ?? undefined,
		}));
	}

	/** Date de la dernière analyse d'une note (ms), ou 0. */
	lastIndexedAt() {
		return this.db.get<{ at: number | null }>("SELECT MAX(indexed_at) AS at FROM notes")?.at ?? 0;
	}

	/** Effectifs de la base, pour les réglages. */
	stats() {
		return {
			notes: this.count("SELECT COUNT(*) AS n FROM notes"),
			references: this.count("SELECT COUNT(*) AS n FROM refs"),
			decisions: this.count("SELECT COUNT(*) AS n FROM refs WHERE kind = 'decision'"),
			links: this.count("SELECT COUNT(*) AS n FROM links"),
			complete: this.count("SELECT COUNT(*) AS n FROM decisions WHERE status = 'complete'"),
		};
	}

	/** Vide la base (notes, références, liens, fiches). */
	clear() {
		this.db.transaction(() => {
			for (const table of ["notes", "refs", "citations", "links", "misses", "decisions", "decision_articles", "fiches", "documents", "decision_relations", "decision_precisions", "article_notes"]) this.db.run(`DELETE FROM ${table}`);
		});
		this.fichesById.clear();
		this.articleNotePaths.clear();
		this.links.clear();
		this.misses.clear();
	}
}
