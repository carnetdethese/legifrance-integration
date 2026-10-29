/**
 * Base SQLite du plugin (sql.js : SQLite compilé en WebAssembly, qui fonctionne aussi sur mobile).
 * La base vit en mémoire ; le plugin en écrit le fichier (`legifrance.sqlite`, dossier du plugin) à
 * chaque série de modifications. Aucune clef étrangère : les suppressions en cascade sont faites à la main
 * (`Database.export()` de sql.js réinitialise les pragmas).
 */
import initSqlJs, { Database, SqlValue } from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm";
import { foldText } from "./textSearch";

/** Version du schéma, enregistrée dans `meta` ; à incrémenter avec une migration. */
export const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Notes analysées ; mtime permet de ne reparser que les notes modifiées.
CREATE TABLE IF NOT EXISTS notes (
	path TEXT PRIMARY KEY,
	mtime INTEGER NOT NULL,
	indexed_at INTEGER NOT NULL
);

-- Références juridiques distinctes (une ligne par texte, décision ou article cité).
CREATE TABLE IF NOT EXISTS refs (
	key TEXT PRIMARY KEY,
	kind TEXT NOT NULL,
	label TEXT NOT NULL,
	query TEXT NOT NULL,
	data TEXT NOT NULL,
	url TEXT,
	fallback_url TEXT
);

-- Qui cite quoi : rang d'apparition dans la note et nombre de citations.
CREATE TABLE IF NOT EXISTS citations (
	note_path TEXT NOT NULL,
	ref_key TEXT NOT NULL,
	ord INTEGER NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (note_path, ref_key)
);
CREATE INDEX IF NOT EXISTS citations_ref ON citations (ref_key);

-- Adresse exacte retrouvée via l'API (et texte de l'article) ; échecs de recherche.
CREATE TABLE IF NOT EXISTS links (
	ref_key TEXT PRIMARY KEY,
	url TEXT NOT NULL,
	title TEXT NOT NULL,
	text TEXT,
	resolved_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS misses (ref_key TEXT PRIMARY KEY, at INTEGER NOT NULL);

-- Notes du coffre reconnues comme fiches de décisions (voir fiches.ts) ; l'identifiant Légifrance
-- lie la fiche aux décisions citées.
CREATE TABLE IF NOT EXISTS fiches (
	note_path TEXT PRIMARY KEY,
	legifrance_id TEXT,
	indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fiches_id ON fiches (legifrance_id);

-- Fiche de chaque décision de justice retrouvée : métadonnées et texte intégral.
-- status : pending (à compléter), complete, external (page hors Légifrance, sans texte),
-- unresolved (introuvable), error.
CREATE TABLE IF NOT EXISTS decisions (
	ref_key TEXT PRIMARY KEY,
	status TEXT NOT NULL DEFAULT 'pending',
	legifrance_id TEXT,
	court TEXT,
	number TEXT,
	title TEXT,
	date TEXT,
	formation TEXT,
	ecli TEXT,
	solution TEXT,
	text_html TEXT,
	text_markdown TEXT,
	fetched_at INTEGER,
	error TEXT
);
CREATE INDEX IF NOT EXISTS decisions_status ON decisions (status);

-- Articles visés par le texte d'une décision (décision = identifiant Légifrance, article = clef de la
-- référence dans refs/le parseur) : relie la jurisprudence aux textes.
CREATE TABLE IF NOT EXISTS decision_articles (
	decision_id TEXT NOT NULL,
	article_key TEXT NOT NULL,
	label TEXT NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (decision_id, article_key)
);
CREATE INDEX IF NOT EXISTS decision_articles_key ON decision_articles (article_key);

-- Rapprochements faits à la main dans la chronologie : la décision alias_id est la même que target_id
-- (identifiants des décisions de la chronologie, voir DecisionRecord.id) ; target_id est celle qui est conservée.
CREATE TABLE IF NOT EXISTS decision_merges (
	alias_id TEXT PRIMARY KEY,
	target_id TEXT NOT NULL
);

-- Documents consultés (résultats de la recherche Légifrance : textes, articles, décisions), indépendamment
-- des citations des notes : la base sert de cache avant l'API. Le HTML est celui de la consultation.
CREATE TABLE IF NOT EXISTS documents (
	id TEXT PRIMARY KEY,
	origin TEXT,
	title TEXT NOT NULL,
	date TEXT,
	number TEXT,
	court TEXT,
	formation TEXT,
	solution TEXT,
	url TEXT,
	text_html TEXT,
	text_markdown TEXT,
	fetched_at INTEGER NOT NULL
);

-- Généalogie : décisions citées dans le texte d'une décision, et façon de les citer (voir genealogy.ts).
CREATE TABLE IF NOT EXISTS decision_relations (
	from_id TEXT NOT NULL,
	to_key TEXT NOT NULL,
	to_label TEXT NOT NULL,
	to_court TEXT,
	to_number TEXT,
	kind TEXT NOT NULL,
	extract TEXT NOT NULL,
	PRIMARY KEY (from_id, to_key)
);
CREATE INDEX IF NOT EXISTS decision_relations_to ON decision_relations (to_number);

-- Versions d'un article (identifiant, état, dates de début et de fin), relevées sur l'API à la demande :
-- permettent de retrouver la version en vigueur à la date d'une décision (voir versions.ts).
CREATE TABLE IF NOT EXISTS article_versions (
	article_key TEXT PRIMARY KEY,
	versions TEXT NOT NULL,
	fetched_at INTEGER NOT NULL
);

-- Suggestions de rapprochement écartées par l'utilisateur (paire d'identifiants de la chronologie).
CREATE TABLE IF NOT EXISTS decision_dismissed (
	a_id TEXT NOT NULL,
	b_id TEXT NOT NULL,
	PRIMARY KEY (a_id, b_id)
);

-- Ce que l'utilisateur a précisé d'une décision introuvable (juridiction, nom, date, numéro, lien, en JSON) :
-- conservé pour préremplir le formulaire au prochain essai, même si la recherche échoue.
CREATE TABLE IF NOT EXISTS decision_precisions (
	ref_key TEXT PRIMARY KEY,
	data TEXT NOT NULL
);

-- Notes d'articles créées par le plugin (clef de l'article → note), pour les tenir à jour (voir articleNotes.ts).
CREATE TABLE IF NOT EXISTS article_notes (
	ref_key TEXT PRIMARY KEY,
	note_path TEXT NOT NULL
);
`;

/**
 * Colonnes ajoutées après la première version du schéma (ajoutées aux bases existantes à l'ouverture) :
 * - v2 : thèmes (JSON), résumé et vocabulaire (JSON) des décisions ; statut de vigueur d'un article lié.
 * - veille : statut précédent et date du dernier changement (statut ou texte) d'un article lié.
 * - lien choisi par l'utilisateur (`manual`) : la recherche automatique ne le remplace plus.
 */
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
	["decisions", "themes", "TEXT"],
	["decisions", "summary", "TEXT"],
	["decisions", "terms", "TEXT"],
	["links", "status", "TEXT"],
	["links", "previous_status", "TEXT"],
	["links", "changed_at", "INTEGER"],
	["decisions", "relations_at", "INTEGER"],
	["links", "manual", "INTEGER"],
];

/** Valeur acceptée en paramètre d'une requête. */
export type Param = string | number | null | Uint8Array;

export class LegalDatabase {
	/** Nombre d'écritures depuis l'ouverture : permet aux analyses de savoir si leur cache est périmé. */
	version = 0;

	private constructor(
		private db: Database,
		private notify: () => void
	) {}

	/**
	 * Fonctions SQL du plugin. `Database.export()` de sql.js ferme puis rouvre la base et efface les
	 * fonctions déclarées : elles sont donc redéclarées après chaque export.
	 */
	private registerFunctions() {
		// Texte réduit (minuscules, sans accents) pour la recherche dans les textes (voir textSearch.ts).
		this.db.create_function("fold", (value: unknown) => (typeof value === "string" ? foldText(value) : ""));
	}

	private onChange() {
		this.version++;
		this.notify();
	}

	/**
	 * Ouvre la base depuis le contenu du fichier (`undefined` : base vide) et crée les tables
	 * manquantes. `onChange` est appelé après chaque écriture, pour planifier l'enregistrement.
	 */
	static async open(bytes: Uint8Array | undefined, onChange: () => void) {
		const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
		const database = new LegalDatabase(new SQL.Database(bytes), onChange);
		database.registerFunctions();
		database.db.run(SCHEMA);
		for (const [table, column, type] of ADDED_COLUMNS) {
			const columns = database.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
			if (!columns.includes(column)) database.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
		}
		database.db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", [String(SCHEMA_VERSION)]);
		return database;
	}

	/** Exécute une écriture. */
	run(sql: string, params: Param[] = []) {
		this.db.run(sql, params);
		this.onChange();
	}

	/** Lignes d'une requête, sous forme d'objets (colonne → valeur). */
	all<T = Record<string, SqlValue>>(sql: string, params: Param[] = []): T[] {
		const statement = this.db.prepare(sql, params);
		try {
			const rows: T[] = [];
			while (statement.step()) rows.push(statement.getAsObject() as T);
			return rows;
		} finally {
			statement.free();
		}
	}

	/** Première ligne d'une requête, ou `undefined`. */
	get<T = Record<string, SqlValue>>(sql: string, params: Param[] = []): T | undefined {
		return this.all<T>(sql, params)[0];
	}

	/** Exécute `work` dans une transaction (annulée si elle lève une erreur). */
	transaction<T>(work: () => T): T {
		this.db.run("BEGIN");
		try {
			const result = work();
			this.db.run("COMMIT");
			this.onChange();
			return result;
		} catch (error) {
			this.db.run("ROLLBACK");
			throw error;
		}
	}

	/** Contenu du fichier SQLite. */
	export(): Uint8Array {
		const bytes = this.db.export();
		this.registerFunctions();
		return bytes;
	}

	close() {
		this.db.close();
	}
}
