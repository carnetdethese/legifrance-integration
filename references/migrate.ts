/**
 * Migrations des données issues du parseur. Quand la façon de lire les citations change (clefs,
 * libellés), les références déjà enregistrées sont réécrites sans rien perdre de ce que l'API a coûté :
 * liens retrouvés, textes et thèmes des décisions.
 */
import type { LegalDatabase } from "./database";
import { cleanPartyName, decidedIso, namedDecisionKey, tidyLabel } from "./parser";

/**
 * Version du parseur dont les données sont issues, enregistrée dans `meta`.
 * - 2 : décisions citées par leurs parties — nom débarrassé des crochets de lien et des restes de
 *   phrase, date normalisée (AAAA-MM-JJ), clef insensible à la casse, aux accents et à la ponctuation.
 * - 3 : le nom s'arrête aux deux-points et aux renvois de page (« Camino : contrôle des faits »,
 *   « Camino p. 15 » : la décision Camino).
 * - 4 : le nom s'arrête à la fin d'une phrase (« Labonne. On fait la ») ; les citations par numéro au
 *   Conseil d'État gardent le nom et la date écrits avant le numéro, pour les rapprocher (les notes
 *   sont relues pour les relever).
 */
export const PARSER_VERSION = 4;

const META_KEY = "parser_version";

/** Les références enregistrées sont-elles issues d'un parseur plus ancien ? (une base neuve ne l'est pas) */
export function needsParserMigration(db: LegalDatabase) {
	const stored = Number(db.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", [META_KEY])?.value ?? 0);
	const hasRefs = (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM refs")?.n ?? 0) > 0;
	return stored < PARSER_VERSION && hasRefs;
}

/** Bilan d'une migration. */
export interface MigrationReport {
	/** Références réécrites (clef, libellé ou nom modifiés). */
	rewritten: number;
	/** Références en doublon fusionnées dans une autre. */
	merged: number;
}

interface Plan {
	oldKey: string;
	key: string;
	label: string;
	query: string;
	data: string;
	url: string | null;
	fallbackUrl: string | null;
	changed: boolean;
	/** Le nom était abîmé (crochets, ponctuation, reste de phrase) : une recherche faite avec lui ne prouve rien. */
	nameChanged: boolean;
}

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** Statuts d'une fiche de décision, de la plus utile à la moins utile. */
const STATUS_RANK = ["complete", "external", "error", "unresolved", "pending"];

/**
 * Réécrit les décisions citées par leurs parties selon le parseur actuel et fusionne celles qui sont
 * en réalité la même. Pour chaque décision fusionnée :
 * - les citations des notes sont additionnées ;
 * - le lien retrouvé et la fiche complétée les plus complets sont conservés ;
 * - un échec de recherche (introuvable) est oublié : il datait d'un nom abîmé, la recherche vaut
 *   d'être retentée avec le nom corrigé.
 * Les notes sont ensuite marquées « à réanalyser » : la prochaine indexation relit leur texte.
 */
export function migrateParser(db: LegalDatabase): MigrationReport {
	const report: MigrationReport = { rewritten: 0, merged: 0 };

	const plans: Plan[] = [];
	for (const row of db.all<{ key: string; label: string; query: string; data: string; url: string | null; fallback_url: string | null }>(
		"SELECT key, label, query, data, url, fallback_url FROM refs WHERE kind = 'decision'"
	)) {
		const data = JSON.parse(row.data) as Record<string, string>;
		if (!data.court || data.number !== undefined || data.name === undefined || data.decided === undefined) continue; // citée par son numéro (le nom n'est qu'un indice)
		const name = cleanPartyName(data.name);
		if (!name) continue;
		const decided = decidedIso(data.decided) ?? data.decided;
		const key = namedDecisionKey(data.court, name, decided);
		const label = tidyLabel(row.label);
		const query = tidyLabel(`${name} ${data.decided}`);
		const newData = JSON.stringify({ court: data.court, name, decided });
		plans.push({ oldKey: row.key, key, label, query, data: newData, url: row.url, fallbackUrl: row.fallback_url, changed: key !== row.key || label !== row.label || newData !== row.data, nameChanged: name !== data.name });
	}

	const groups = new Map<string, Plan[]>();
	for (const plan of plans) groups.set(plan.key, [...(groups.get(plan.key) ?? []), plan]);

	db.transaction(() => {
		for (const [key, group] of groups) {
			if (group.length === 1 && !group[0].changed) continue;
			const oldKeys = [...new Set(group.map((p) => p.oldKey))];
			const all = [...new Set([...oldKeys, key])];
			const marks = placeholders(all.length);
			// Un nom abîmé justifie de retenter la recherche ; une simple date normalisée, non.
			const renamed = group.some((p) => p.nameChanged);

			// Citations : une ligne par note, nombres additionnés.
			const citations = db.all<{ note_path: string; count: number; ord: number }>(
				`SELECT note_path, SUM(count) AS count, MIN(ord) AS ord FROM citations WHERE ref_key IN (${marks}) GROUP BY note_path`,
				all
			);
			db.run(`DELETE FROM citations WHERE ref_key IN (${marks})`, all);
			for (const c of citations) db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES (?, ?, ?, ?)", [c.note_path, key, c.ord, c.count]);

			// Lien retrouvé : le plus complet (avec texte), puis le plus récent.
			const link = db.get<{ ref_key: string }>(`SELECT ref_key FROM links WHERE ref_key IN (${marks}) ORDER BY (text IS NOT NULL) DESC, resolved_at DESC LIMIT 1`, all);
			if (link) {
				db.run(`DELETE FROM links WHERE ref_key IN (${marks}) AND ref_key != ?`, [...all, link.ref_key]);
				if (link.ref_key !== key) db.run("UPDATE links SET ref_key = ? WHERE ref_key = ?", [key, link.ref_key]);
			}

			// Échec de recherche : oublié si le nom a changé, sinon conservé sous la nouvelle clef.
			const miss = db.get<{ at: number }>(`SELECT MAX(at) AS at FROM misses WHERE ref_key IN (${marks})`, all);
			db.run(`DELETE FROM misses WHERE ref_key IN (${marks})`, all);
			if (miss?.at && !renamed && !link) db.run("INSERT INTO misses (ref_key, at) VALUES (?, ?)", [key, miss.at]);

			// Fiche de décision : la plus avancée.
			const decisions = db.all<{ ref_key: string; status: string }>(`SELECT ref_key, status FROM decisions WHERE ref_key IN (${marks})`, all);
			if (decisions.length) {
				const best = [...decisions].sort((a, b) => STATUS_RANK.indexOf(a.status) - STATUS_RANK.indexOf(b.status))[0];
				db.run(`DELETE FROM decisions WHERE ref_key IN (${marks}) AND ref_key != ?`, [...all, best.ref_key]);
				if (best.ref_key !== key) db.run("UPDATE decisions SET ref_key = ? WHERE ref_key = ?", [key, best.ref_key]);
				if (renamed && ["unresolved", "error"].includes(best.status)) db.run("UPDATE decisions SET status = 'pending', error = NULL WHERE ref_key = ?", [key]);
			}

			// Référence : une seule ligne, celle de la clef actuelle.
			const keep = group.find((p) => p.oldKey === key) ?? group[0];
			db.run(`DELETE FROM refs WHERE key IN (${marks})`, all);
			db.run("INSERT INTO refs (key, kind, label, query, data, url, fallback_url) VALUES (?, 'decision', ?, ?, ?, ?, ?)", [key, keep.label, keep.query, keep.data, keep.url, keep.fallbackUrl]);

			report.rewritten += group.filter((p) => p.changed).length;
			report.merged += oldKeys.length - 1;
		}
		// Les notes seront relues : leurs références se rattachent aux clefs actuelles.
		db.run("UPDATE notes SET mtime = -1");
		db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [META_KEY, String(PARSER_VERSION)]);
	});
	return report;
}

/** Enregistre la version du parseur dans une base neuve (rien à migrer). */
export function stampParserVersion(db: LegalDatabase) {
	db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [META_KEY, String(PARSER_VERSION)]);
}

/**
 * Met les données au niveau du parseur actuel : migration si des références plus anciennes existent,
 * simple enregistrement de la version pour une base neuve, rien si c'est déjà à jour (aucune écriture).
 * @returns le bilan de la migration, s'il y en a eu une.
 */
export function upgradeParserData(db: LegalDatabase): MigrationReport | undefined {
	if (needsParserMigration(db)) return migrateParser(db);
	const stored = Number(db.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", [META_KEY])?.value ?? 0);
	if (stored < PARSER_VERSION) stampParserVersion(db);
	return undefined;
}
