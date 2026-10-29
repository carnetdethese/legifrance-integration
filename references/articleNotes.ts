/**
 * Notes d'articles : création d'une note par article (propriétés, texte, décisions qui l'appliquent, notes qui
 * le citent) et mise à jour automatique de ce que le plugin y écrit. Le contenu et les repères sont dans
 * `articleNote.ts` : seules les parties entre repères et quatre propriétés sont réécrites, jamais le reste.
 */
import { Notice, TFile, normalizePath } from "obsidian";
import type LegifrancePlugin from "main";
import { ArticleNoteData, articleNoteContent, articleProperties, refreshArticleContent } from "./articleNote";
import { decisionsApplying, statusLabel } from "./corpus";
import { safePath } from "lib/paths";
import { decisionsOf, internalLink, safeName } from "./insights";
import { byDate } from "./timeline";

/** Dernier état écrit de chaque note (par plugin), pour ne relire une note que si l'article a changé. */
const written = new WeakMap<LegifrancePlugin, Map<string, string>>();

/** Mémoire des états écrits d'un plugin. */
const memoryOf = (plugin: LegifrancePlugin) => {
	let memory = written.get(plugin);
	if (!memory) written.set(plugin, (memory = new Map()));
	return memory;
};

/** Libellé d'un article : celui de ses citations, ou celui des décisions qui l'appliquent. */
function labelOf(plugin: LegifrancePlugin, key: string) {
	const { db } = plugin.references;
	return db.get<{ label: string }>("SELECT label FROM refs WHERE key = ?", [key])?.label ?? db.get<{ label: string }>("SELECT label FROM decision_articles WHERE article_key = ? LIMIT 1", [key])?.label;
}

/** Ce que la base sait de l'article, ou `undefined` si elle ne le connaît pas. */
export function articleNoteData(plugin: LegifrancePlugin, key: string): ArticleNoteData | undefined {
	const label = labelOf(plugin, key);
	if (!label) return undefined;
	const index = plugin.references;
	const link = index.db.get<{ url: string; text: string | null; status: string | null }>("SELECT url, text, status FROM links WHERE ref_key = ?", [key]);
	const decisions = decisionsApplying(index, decisionsOf(plugin), key)
		.sort(byDate)
		.map((r) => ({ title: r.name ?? r.title ?? r.label, date: r.date, court: r.court, fichePath: r.fichePath, url: r.url }));
	const notes = index.db.all<{ note_path: string }>("SELECT DISTINCT note_path FROM citations WHERE ref_key = ? ORDER BY note_path", [key]).map((row) => row.note_path);
	return { label, text: link?.text ?? undefined, status: link?.status ? statusLabel(link.status) : undefined, url: link?.url, decisions, notes };
}

/**
 * Crée la note de l'article (dossier de base, sous-dossier « Articles ») si elle n'existe pas encore. Une note
 * existante n'est jamais réécrite ici ; elle est enregistrée pour être tenue à jour seulement si elle a été
 * créée par le plugin.
 * @returns la note, ou `undefined` si la base ne connaît pas l'article
 */
export async function ensureArticleNote(plugin: LegifrancePlugin, key: string): Promise<{ file: TFile; created: boolean } | undefined> {
	const { app, references: index, settings } = plugin;
	const known = index.articleNoteFor(key);
	const existing = known && app.vault.getFileByPath(known);
	if (existing) return { file: existing, created: false };

	const data = articleNoteData(plugin, key);
	if (!data) return undefined;
	const folder = normalizePath(`${safePath(settings.dossierBase)}/Articles`);
	const path = normalizePath(`${folder}/${safeName(data.label)}.md`);
	const same = app.vault.getFileByPath(path);
	// Un fichier du même nom que l'utilisateur a écrit lui-même : on le garde tel quel, sans le tenir à jour.
	if (same) return { file: same, created: false };

	if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder).catch(() => undefined);
	// Enregistrée avant sa création : son contenu (qui cite d'autres articles) ne doit pas compter comme des citations.
	index.setArticleNote(key, path);
	try {
		const file = await app.vault.create(path, articleNoteContent(data, internalLink(plugin, path)));
		memoryOf(plugin).set(key, JSON.stringify(data));
		return { file, created: true };
	} catch (error) {
		index.forgetArticleNote(key);
		throw error;
	}
}

/** Ouvre la note de l'article, en la créant d'abord au besoin. */
export async function openArticleNote(plugin: LegifrancePlugin, key: string) {
	const result = await ensureArticleNote(plugin, key);
	if (!result) {
		new Notice("Article inconnu de la base.");
		return undefined;
	}
	if (result.created) new Notice(`Note créée : ${result.file.path}`);
	await plugin.app.workspace.getLeaf(false).openFile(result.file);
	return result.file;
}

/** Crée les notes des articles `keys` qui n'en ont pas. @returns le nombre de notes créées */
export async function createMissingArticleNotes(plugin: LegifrancePlugin, keys: string[]) {
	let created = 0;
	for (const key of keys) if ((await ensureArticleNote(plugin, key))?.created) created++;
	if (created) new Notice(`${created} note${created > 1 ? "s" : ""} d'article créée${created > 1 ? "s" : ""}.`);
	return created;
}

/**
 * Met à jour les notes d'articles créées par le plugin (texte, statut, décisions, notes qui citent l'article).
 * Seuls les repères et les propriétés du plugin sont réécrits ; une note supprimée est oubliée. Une note n'est
 * relue que si les données de son article ont changé depuis la dernière mise à jour (`force` : toutes).
 * @returns le nombre de notes modifiées
 */
export async function refreshArticleNotes(plugin: LegifrancePlugin, force = false) {
	const { app, references: index } = plugin;
	const memory = memoryOf(plugin);
	let changed = 0;
	for (const [key, path] of index.articleNotes()) {
		const file = app.vault.getFileByPath(path);
		if (!file) {
			index.forgetArticleNote(key);
			continue;
		}
		const data = articleNoteData(plugin, key);
		if (!data) continue;
		const fingerprint = JSON.stringify(data);
		if (!force && memory.get(key) === fingerprint) continue;
		memory.set(key, fingerprint);

		const link = internalLink(plugin, path);
		const before = await app.vault.cachedRead(file);
		const after = refreshArticleContent(before, data, link);
		let touched = false;
		if (after !== before) {
			// `process` relit la note au moment d'écrire : une frappe de l'utilisateur entre-temps n'est pas perdue.
			await app.vault.process(file, (current) => refreshArticleContent(current, data, link));
			touched = true;
		}
		const front = app.metadataCache.getFileCache(file)?.frontmatter;
		const properties = articleProperties(data);
		if (Object.entries(properties).some(([name, value]) => front?.[name] !== value)) {
			await app.fileManager.processFrontMatter(file, (frontmatter) => Object.assign(frontmatter, properties));
			touched = true;
		}
		if (touched) changed++;
	}
	return changed;
}
