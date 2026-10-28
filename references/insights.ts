/**
 * Analyses de la jurisprudence du coffre qui touchent aux notes : fiches manquantes ou orphelines,
 * écarts avec Légifrance, table des décisions d'une note.
 */
import { Notice, TFile, normalizePath } from "obsidian";
import { codeJuridiction } from "abstracts/decisions";
import type LegifrancePlugin from "main";
import { BIB_FORMATS, BibEntry, BibFilter, BibFormat, decisionEntries, filterDecisions, formatBibliography, isFiltered } from "./bibliography";
import { articlesByDecision, citedTexts, loadDecisions, statusLabel } from "./corpus";
import { DecisionValues, FicheDifference, ficheDifferences, ficheId, ficheValues } from "./fiches";
import { PlanOptions, coursePlan, planThemes } from "./plan";
import { DecisionRecord, decisionsTable, ficheFileName, themeCounts } from "./timeline";

/** Dernier recensement des décisions, avec l'état de la base et des liens entre notes pour lequel il a été fait. */
const cache = new WeakMap<LegifrancePlugin, { databaseVersion: number; notesVersion: number; records: DecisionRecord[] }>();

/**
 * Décisions du coffre : celles que les notes citent (en toutes lettres ou par un lien vers leur
 * fiche) et les fiches, avec ce que leurs propriétés disent de la décision. Le recensement parcourt
 * toute la base : il est conservé tant que la base et les notes ne changent pas.
 */
export function decisionsOf(plugin: LegifrancePlugin): DecisionRecord[] {
	const databaseVersion = plugin.references.db.version;
	const known = cache.get(plugin);
	if (known && known.databaseVersion === databaseVersion && known.notesVersion === plugin.notesVersion) return known.records;
	const records = loadAllDecisions(plugin);
	cache.set(plugin, { databaseVersion, notesVersion: plugin.notesVersion, records });
	return records;
}

function loadAllDecisions(plugin: LegifrancePlugin): DecisionRecord[] {
	const { app, settings } = plugin;
	const inbound = new Map<string, string[]>();
	for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
		for (const target of Object.keys(targets)) {
			const sources = inbound.get(target);
			if (sources) sources.push(source);
			else inbound.set(target, [source]);
		}
	}
	return loadDecisions(plugin.references, {
		inbound,
		values: (path) => {
			const file = app.vault.getFileByPath(path);
			return ficheValues(file && app.metadataCache.getFileCache(file)?.frontmatter, settings);
		},
	});
}

/** Décisions citées sans fiche, les plus citées d'abord. */
export const missingFiches = (records: DecisionRecord[]) =>
	records.filter((r) => !r.fichePath).sort((a, b) => b.notes.length - a.notes.length || a.label.localeCompare(b.label));

/**
 * Fiches que vos notes ne citent ni ne lient (jamais utilisées), et fiches sans identifiant, que l'on
 * ne peut pas relier aux citations écrites en toutes lettres.
 */
export function orphanFiches(plugin: LegifrancePlugin, records: DecisionRecord[]) {
	return {
		unused: records.filter((r) => r.fichePath && r.notes.length === 0).map((r) => r.fichePath!),
		unidentified: plugin.references.ficheEntries().filter((e) => !e.id).map((e) => e.path),
	};
}

/** Une fiche dont des propriétés diffèrent de Légifrance. */
export interface FicheDiscrepancy {
	path: string;
	title: string;
	differences: FicheDifference[];
}

/**
 * Compare chaque fiche à la décision enregistrée dans la base (texte récupéré sur Légifrance). Seules
 * les décisions complétées peuvent être comparées.
 */
export function ficheDiscrepancies(plugin: LegifrancePlugin): FicheDiscrepancy[] {
	const { settings, references: index } = plugin;
	const stored = new Map(
		index.db
			.all<{ legifrance_id: string; court: string | null; number: string | null; date: string | null; formation: string | null; ecli: string | null; solution: string | null }>(
				"SELECT legifrance_id, court, number, date, formation, ecli, solution FROM decisions WHERE status = 'complete' AND legifrance_id IS NOT NULL"
			)
			.map((row) => [row.legifrance_id, row])
	);
	const found: FicheDiscrepancy[] = [];
	for (const { path, id } of index.ficheEntries()) {
		const row = id ? stored.get(id) : undefined;
		const file = plugin.app.vault.getFileByPath(path);
		if (!row || !file) continue;
		const values: DecisionValues = {
			date: row.date ?? undefined,
			court: row.court ? codeJuridiction.get(row.court) ?? row.court : undefined,
			number: row.number ?? undefined,
			formation: row.formation ?? undefined,
			ecli: row.ecli ?? undefined,
			solution: row.solution ?? undefined,
		};
		const differences = ficheDifferences(plugin.app.metadataCache.getFileCache(file)?.frontmatter, settings, values);
		if (differences.length) found.push({ path, title: file.basename, differences });
	}
	return found;
}

/** Remplace dans la fiche les propriétés indiquées par les valeurs de Légifrance. */
export async function fixFiche(plugin: LegifrancePlugin, path: string, differences: FicheDifference[]) {
	const file = plugin.app.vault.getFileByPath(path);
	if (!file) return;
	await plugin.app.fileManager.processFrontMatter(file, (front) => {
		for (const { property, expected } of differences) front[property] = expected;
	});
}

/** Table Markdown des décisions citées par une note, par date. */
export function noteDecisionsTable(plugin: LegifrancePlugin, file: TFile) {
	const records = decisionsOf(plugin).filter((r) => r.notes.includes(file.path));
	if (records.length === 0) return undefined;
	return decisionsTable(records, (path, alias) => {
		const target = plugin.app.vault.getFileByPath(path);
		return target ? plugin.app.fileManager.generateMarkdownLink(target, file.path, undefined, alias) : alias;
	});
}

/** Caractères interdits dans un nom de fichier. */
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Crée la fiche d'une décision citée : ses propriétés (réglage « correspondance ») sont remplies avec
 * ce que la base sait déjà, l'identifiant Légifrance est enregistré. Un fichier existant n'est jamais
 * écrasé.
 */
export async function createFiche(plugin: LegifrancePlugin, record: DecisionRecord) {
	const { settings, app } = plugin;
	if (!settings.ficheProperty.trim()) {
		new Notice("Choisissez d'abord la propriété qui désigne une fiche (Réglages → Fiches de décisions).");
		return undefined;
	}
	const values: DecisionValues = {
		date: record.date && record.date.length === 10 ? record.date : undefined,
		court: record.court,
		formation: record.formation,
		title: record.title ?? record.label,
		number: record.number,
		solution: record.solution,
		url: record.url,
	};
	const front: Record<string, string> = { [settings.ficheProperty.trim()]: record.court ?? "" };
	if (settings.ficheIdProperty.trim()) front[settings.ficheIdProperty.trim()] = record.id;
	for (const { property, field } of settings.ficheMapping) if (property.trim() && values[field]) front[property.trim()] = values[field]!;

	const folder = normalizePath(record.court && safeName(record.court) ? `${settings.dossierBase}/${safeName(record.court)}` : settings.dossierBase);
	if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
	// Nom de la note : parties et année si on les connaît (« couiteas1923 »), sinon l'intitulé de la décision.
	const fileName = safeName(ficheFileName(record) ?? record.title ?? record.label);
	let path = normalizePath(`${folder}/${fileName}.md`);
	if (app.vault.getFileByPath(path)) path = normalizePath(`${folder}/${fileName}-${Date.now()}.md`);

	const yaml = Object.entries(front).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
	const file = await app.vault.create(path, `---\n${yaml}\n---\n\n## Fiche et commentaire\n\n${record.summary ? `### Résumé\n\n${record.summary}\n\n` : ""}`);
	return file;
}

/** Lien interne vers une note, écrit comme Obsidian l'écrirait depuis `from`. */
export const internalLink = (plugin: LegifrancePlugin, from: string) => (path: string, alias: string) => {
	const target = plugin.app.vault.getFileByPath(path);
	return target ? plugin.app.fileManager.generateMarkdownLink(target, from, undefined, alias) : alias;
};

/** Décisions citées par une note. */
const decisionsCitedBy = (plugin: LegifrancePlugin, file: TFile) => decisionsOf(plugin).filter((r) => r.notes.includes(file.path));

/** Thèmes du plan des décisions citées par une note (vide si elle n'en cite aucune). */
export const notePlanThemes = (plugin: LegifrancePlugin, file: TFile) => planThemes(decisionsCitedBy(plugin, file));

/** Plan « thème → décisions → articles » des décisions citées par une note, ou `undefined` si elle n'en cite aucune. */
export function notePlan(plugin: LegifrancePlugin, file: TFile, options: PlanOptions = {}) {
	const records = decisionsCitedBy(plugin, file);
	if (records.length === 0) return undefined;
	return coursePlan(records, articlesByDecision(plugin.references, records), internalLink(plugin, file.path), options);
}

/** Décisions citées par une note (ou tout le coffre), thèmes de plus haut niveau compris, pour proposer un filtre. */
export const exportableThemes = (plugin: LegifrancePlugin, file?: TFile) =>
	themeCounts(decisionsOf(plugin).filter((r) => !file || r.notes.includes(file.path))).map(([theme]) => theme);

/**
 * Décisions et textes cités par une note (`file`) ou par tout le coffre. Avec un filtre, seules les décisions
 * sont gardées : un article n'a ni thème ni date de décision.
 */
export function bibliographyOf(plugin: LegifrancePlugin, file?: TFile, filter: BibFilter = {}): BibEntry[] {
	const cited = decisionsOf(plugin).filter((r) => !file || r.notes.includes(file.path));
	if (isFiltered(filter)) return decisionEntries(filterDecisions(cited, filter));
	const texts = citedTexts(plugin.references, file?.path).map(
		(t): BibEntry => ({
			kind: "texte",
			label: t.label,
			url: t.link_url ?? t.url ?? t.fallback_url ?? undefined,
			status: t.status ? statusLabel(t.status) : undefined,
			notes: t.notes,
		})
	);
	return [...decisionEntries(cited), ...texts];
}

/** Bibliographie en Markdown d'une note, prête à insérer. */
export function noteBibliography(plugin: LegifrancePlugin, file: TFile) {
	const entries = bibliographyOf(plugin, file);
	return entries.length ? formatBibliography(entries, "markdown", internalLink(plugin, file.path)) : undefined;
}

/** Où va l'export : un fichier à la racine du coffre, ou le presse-papiers. */
export type ExportTarget = "file" | "clipboard";

/**
 * Exporte la bibliographie. Dans un fichier, il est créé à la racine du coffre (« Bibliographie - note.bib ») ;
 * un fichier existant n'est jamais écrasé.
 * @returns le chemin du fichier créé, ou `undefined` (presse-papiers, ou rien à exporter)
 */
export async function exportBibliography(plugin: LegifrancePlugin, format: BibFormat, file?: TFile, filter: BibFilter = {}, target: ExportTarget = "file") {
	const entries = bibliographyOf(plugin, file, filter);
	if (entries.length === 0) {
		new Notice("Rien à exporter : aucune décision ni aucun texte cité (ou aucune ne répond au filtre).");
		return undefined;
	}
	if (target === "clipboard") {
		await navigator.clipboard.writeText(formatBibliography(entries, format, internalLink(plugin, file?.path ?? "")));
		new Notice(`${entries.length} entrées copiées dans le presse-papiers.`);
		return undefined;
	}
	const { extension } = BIB_FORMATS[format];
	const base = safeName(`Bibliographie - ${file ? file.basename : "coffre"}${isFiltered(filter) ? " (filtrée)" : ""}`);
	let path = normalizePath(`${base}.${extension}`);
	if (plugin.app.vault.getFileByPath(path)) path = normalizePath(`${base} ${new Date().toISOString().slice(0, 10)} ${Date.now() % 100000}.${extension}`);
	const content = formatBibliography(entries, format, internalLink(plugin, path));
	await plugin.app.vault.create(path, `${content}\n`);
	new Notice(`${entries.length} entrées exportées : ${path}`);
	return path;
}

/**
 * Après un rapprochement manuel : écrit l'identifiant Légifrance de la décision conservée (`main`) dans les
 * fiches rapprochées qui n'en ont pas, pour que le lien tienne sans le rapprochement manuel. Seule une décision
 * retrouvée sur Légifrance (et non une page ArianeWeb) a un identifiant à écrire ; une fiche qui en a déjà un
 * n'est jamais modifiée.
 * @returns les chemins des fiches mises à jour
 */
export async function writeFicheIds(plugin: LegifrancePlugin, chosen: DecisionRecord[], main: DecisionRecord) {
	const property = plugin.settings.ficheIdProperty.trim();
	if (!property || !/^(CETATEXT|JURITEXT|CONSTEXT)\d+$/.test(main.id)) return [];
	const written: string[] = [];
	for (const path of new Set(chosen.map((r) => r.fichePath).filter((p): p is string => !!p))) {
		const file = plugin.app.vault.getFileByPath(path);
		if (!file || ficheId(plugin.app.metadataCache.getFileCache(file)?.frontmatter, plugin.settings)) continue;
		await plugin.app.fileManager.processFrontMatter(file, (front) => {
			if (!front[property]) front[property] = main.id;
		});
		written.push(path);
	}
	return written;
}
