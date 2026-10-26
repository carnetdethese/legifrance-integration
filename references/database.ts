/**
 * Base SQLite du plugin (sql.js : SQLite compilé en WebAssembly, qui fonctionne aussi sur mobile).
 * La base vit en mémoire ; le plugin en écrit le fichier (`legifrance.sqlite`, dossier du plugin) à
 * chaque série de modifications. Aucune clef étrangère : les suppressions en cascade sont faites à la main
 * (`Database.export()` de sql.js réinitialise les pragmas).
 */
import initSqlJs, { Database, SqlValue } from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm";

/** Version du schéma, enregistrée dans `meta` ; à incrémenter avec une migration. */
export const SCHEMA_VERSION = 1;

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
`;

/** Valeur acceptée en paramètre d'une requête. */
export type Param = string | number | null | Uint8Array;

export class LegalDatabase {
	private constructor(
		private db: Database,
		private onChange: () => void
	) {}

	/**
	 * Ouvre la base depuis le contenu du fichier (`undefined` : base vide) et crée les tables
	 * manquantes. `onChange` est appelé après chaque écriture, pour planifier l'enregistrement.
	 */
	static async open(bytes: Uint8Array | undefined, onChange: () => void) {
		const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
		const database = new LegalDatabase(new SQL.Database(bytes), onChange);
		database.db.run(SCHEMA);
		database.db.run("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)", [String(SCHEMA_VERSION)]);
		return database;
	}

	/** Exécute une écriture. */
	run(sql: string, params: Param[] = []) {
		this.db.run(sql, params as SqlValue[]);
		this.onChange();
	}

	/** Lignes d'une requête, sous forme d'objets (colonne → valeur). */
	all<T = Record<string, SqlValue>>(sql: string, params: Param[] = []): T[] {
		const statement = this.db.prepare(sql, params as SqlValue[]);
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
		return this.db.export();
	}

	close() {
		this.db.close();
	}
}
