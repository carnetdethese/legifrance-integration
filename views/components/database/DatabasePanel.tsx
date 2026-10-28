import { TFile } from "obsidian";
import { ReactNode, useEffect, useMemo, useReducer, useState } from "react";
import { REFERENCES_EVENT } from "lib/events";
import { decisionsOf } from "references/insights";
import { useDatabaseVersion, usePlugin } from "views/hooks";
import { TodoTab } from "views/components/jurisprudence/TodoTab";
import { CycleOverview } from "./CycleOverview";

/** Table affichée : requête et libellé. Les colonnes viennent du résultat de la requête. */
interface TableDef {
	id: string;
	title: string;
	sql: string;
}

const TABLES: TableDef[] = [
	{
		id: "refs",
		title: "Références",
		sql: `SELECT r.kind, r.label, r.query, r.url, r.fallback_url, l.url AS lien_api, l.title AS titre_api,
			(SELECT SUM(count) FROM citations c WHERE c.ref_key = r.key) AS citations, r.data, r.key
			FROM refs r LEFT JOIN links l ON l.ref_key = r.key ORDER BY r.kind, r.label`,
	},
	{ id: "decisions", title: "Décisions", sql: "SELECT d.*, r.label FROM decisions d LEFT JOIN refs r ON r.key = d.ref_key ORDER BY d.status, r.label" },
	{ id: "fiches", title: "Fiches", sql: "SELECT * FROM fiches ORDER BY note_path" },
	{ id: "links", title: "Liens API", sql: "SELECT l.*, r.label FROM links l LEFT JOIN refs r ON r.key = l.ref_key ORDER BY r.label" },
	{ id: "misses", title: "Échecs", sql: "SELECT m.*, r.label FROM misses m LEFT JOIN refs r ON r.key = m.ref_key ORDER BY m.at DESC" },
	{ id: "citations", title: "Citations", sql: "SELECT c.note_path, r.label, c.count, c.ord, c.ref_key FROM citations c LEFT JOIN refs r ON r.key = c.ref_key ORDER BY c.note_path, c.ord" },
	{ id: "notes", title: "Notes", sql: "SELECT * FROM notes ORDER BY path" },
	{ id: "meta", title: "Méta", sql: "SELECT * FROM meta ORDER BY key" },
];

/** Colonnes contenant un horodatage en millisecondes. */
const DATE_COLUMNS = new Set(["mtime", "indexed_at", "resolved_at", "at", "fetched_at"]);
/** Colonnes contenant un chemin de note du coffre. */
const NOTE_COLUMNS = new Set(["path", "note_path"]);
/** Au-delà, une valeur est tronquée et son contenu complet se déplie. */
const CELL_LENGTH = 80;
/** Nombre de lignes affichées à la fois. */
const PAGE_SIZE = 200;

type Row = Record<string, unknown>;

type Tab = "cycle" | "todo" | "tables";

const TABS: [Tab, string][] = [
	["cycle", "Cycle de la donnée"],
	["todo", "À faire"],
	["tables", "Tables"],
];

/**
 * Vue Base de données : le cycle de la donnée (où en est chaque étape, de la note à la fiche), ce qui
 * reste à faire, et le contenu brut des tables.
 */
export const DatabasePanel = () => {
	const plugin = usePlugin();
	const version = useDatabaseVersion();
	const [tab, setTab] = useState<Tab>(plugin.databaseTab ?? "cycle");
	// Un lien depuis une autre vue (« À faire → ») peut demander un onglet précis.
	useEffect(() => {
		if (!plugin.databaseTab) return;
		setTab(plugin.databaseTab);
		plugin.databaseTab = undefined;
	}, [version]);

	return (
		<div className="legifrance-database">
			<div className="legifrance-database-tabs">
				{TABS.map(([id, title]) => (
					<button key={id} role="tab" aria-selected={id === tab} className={id === tab ? "mod-cta" : ""} onClick={() => setTab(id)}>
						{title}
					</button>
				))}
			</div>
			{tab === "cycle" && <div className="legifrance-database-scroll"><CycleOverview /></div>}
			{tab === "todo" && <TodoPanel version={version} />}
			{tab === "tables" && <TablesPanel />}
		</div>
	);
};

/** Ce qui reste à faire : le recensement des décisions n'est fait qu'à l'ouverture de l'onglet. */
const TodoPanel = ({ version }: { version: number }) => {
	const plugin = usePlugin();
	const records = useMemo(() => decisionsOf(plugin), [plugin, version]);
	return <div className="legifrance-database-scroll"><TodoTab records={records} /></div>;
};

/** Contenu de la base SQLite du plugin, table par table, avec liens vers Légifrance et vers les notes. */
const TablesPanel = () => {
	const plugin = usePlugin();
	const [tableId, setTableId] = useState(TABLES[0].id);
	const [filter, setFilter] = useState("");
	const [limit, setLimit] = useState(PAGE_SIZE);
	/** Relit la base quand le plugin signale un changement (analyse, lien retrouvé) ou sur demande. */
	const [version, refresh] = useReducer((n: number) => n + 1, 0);

	useEffect(() => {
		const ref = plugin.events.on(REFERENCES_EVENT, refresh);
		return () => plugin.events.offref(ref);
	}, [plugin]);

	const counts = useMemo(
		() =>
			Object.fromEntries(
				TABLES.map(({ id }) => [id, plugin.references.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${id}`)?.n ?? 0])
			),
		[plugin, version]
	);

	const table = TABLES.find((t) => t.id === tableId) ?? TABLES[0];
	const rows = useMemo(() => plugin.references.db.all<Row>(table.sql), [plugin, table, version]);
	const needle = filter.trim().toLowerCase();
	const shown = needle ? rows.filter((row) => Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(needle))) : rows;
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

	return (
		<>
			<div className="legifrance-database-tabs">
				{TABLES.map(({ id, title }) => (
					<button key={id} className={id === tableId ? "mod-cta" : ""} onClick={() => { setTableId(id); setLimit(PAGE_SIZE); }}>
						{title} ({counts[id]})
					</button>
				))}
			</div>
			<div className="legifrance-database-bar">
				<input type="search" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
				<button onClick={refresh}>Actualiser</button>
				<span className="setting-item-description">
					{shown.length} ligne{shown.length > 1 ? "s" : ""} · {plugin.manifest.dir}/legifrance.sqlite
				</span>
			</div>

			{rows.length === 0 ? (
				<p className="legifrance-empty">Cette table est vide.</p>
			) : (
				<div className="legifrance-database-scroll">
					<table>
						<thead>
							<tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
						</thead>
						<tbody>
							{shown.slice(0, limit).map((row, i) => (
								<tr key={i}>
									{columns.map((column) => <td key={column}>{<Cell column={column} value={row[column]} />}</td>)}
								</tr>
							))}
						</tbody>
					</table>
					{shown.length > limit && <button onClick={() => setLimit(limit + PAGE_SIZE)}>Afficher {Math.min(PAGE_SIZE, shown.length - limit)} lignes de plus</button>}
				</div>
			)}
		</>
	);
};

const Cell = ({ column, value }: { column: string; value: unknown }): ReactNode => {
	const plugin = usePlugin();
	if (value === null || value === undefined) return <span className="legifrance-database-null">—</span>;
	if (DATE_COLUMNS.has(column) && typeof value === "number") return new Date(value).toLocaleString("fr-FR");

	const text = String(value);
	if (/^https?:\/\//.test(text)) return <a href={text} title={text}>{text.replace(/^https?:\/\/(www\.)?/, "").slice(0, CELL_LENGTH)}</a>;
	if (NOTE_COLUMNS.has(column)) {
		const file = plugin.app.vault.getAbstractFileByPath(text);
		return file instanceof TFile ? <a onClick={() => plugin.app.workspace.getLeaf(false).openFile(file)}>{text}</a> : text;
	}
	if (text.length <= CELL_LENGTH) return text;
	return (
		<details>
			<summary>{text.slice(0, CELL_LENGTH).trimEnd()}…</summary>
			<pre>{text}</pre>
		</details>
	);
};
