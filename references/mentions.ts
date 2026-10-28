/**
 * Endroits où une décision est citée, à la manière des rétroliens d'Obsidian : pour chaque note, les
 * lignes qui la citent (lien vers sa fiche, ou citation écrite en toutes lettres).
 */
import { TFile, getLinkpath } from "obsidian";
import type LegifrancePlugin from "main";
import { citationSpans } from "./parser";
import type { DecisionRecord } from "./timeline";

/** Une ligne d'une note qui cite la décision. */
export interface Mention {
	/** Numéro de ligne (à partir de 0). */
	line: number;
	text: string;
	/** Plages (caractères de `text`) à surligner : la citation ou le lien. */
	ranges: [number, number][];
}

export interface NoteMentions {
	path: string;
	mentions: Mention[];
}

/** Longueur maximale d'une ligne affichée : au-delà, on garde le voisinage de la première citation. */
const MAX_LENGTH = 220;

/** Ligne tronquée autour de sa première plage, plages décalées en conséquence. */
function shorten(text: string, ranges: [number, number][]): { text: string; ranges: [number, number][] } {
	if (text.length <= MAX_LENGTH) return { text, ranges };
	const start = Math.max(0, Math.min(ranges[0]?.[0] ?? 0, text.length - MAX_LENGTH) - 40);
	const end = Math.min(text.length, start + MAX_LENGTH);
	const prefix = start > 0 ? "…" : "";
	return {
		text: `${prefix}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
		ranges: ranges.filter(([a, b]) => a >= start && b <= end).map(([a, b]): [number, number] => [a - start + prefix.length, b - start + prefix.length]),
	};
}

/** Lignes de `file` qui citent `record` : liens vers sa fiche (corps ou propriétés) et citations en toutes lettres. */
async function mentionsIn(plugin: LegifrancePlugin, file: TFile, record: DecisionRecord): Promise<Mention[]> {
	const { vault, metadataCache } = plugin.app;
	const lines = (await vault.cachedRead(file)).split("\n");
	const byLine = new Map<number, [number, number][]>();
	const add = (line: number, range?: [number, number]) => {
		const ranges = byLine.get(line) ?? [];
		if (range && !ranges.some(([a, b]) => a === range[0] && b === range[1])) ranges.push(range);
		byLine.set(line, ranges);
	};

	// Liens et intégrations vers la fiche.
	const cache = metadataCache.getFileCache(file);
	const pointsToFiche = (link: string) => !!record.fichePath && metadataCache.getFirstLinkpathDest(getLinkpath(link), file.path)?.path === record.fichePath;
	for (const link of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
		if (pointsToFiche(link.link)) add(link.position.start.line, link.position.start.line === link.position.end.line ? [link.position.start.col, link.position.end.col] : undefined);
	}
	for (const link of cache?.frontmatterLinks ?? []) {
		if (!pointsToFiche(link.link)) continue;
		const line = lines.findIndex((text) => text.includes(link.original));
		if (line >= 0) add(line, [lines[line].indexOf(link.original), lines[line].indexOf(link.original) + link.original.length]);
	}

	// Citations écrites (ligne à ligne : les citations ne s'étendent pas sur plusieurs lignes).
	const keys = new Set(record.refKeys ?? []);
	if (keys.size > 0) {
		lines.forEach((text, line) => {
			for (const span of citationSpans(text)) if (keys.has(span.ref.key)) add(line, [span.start, span.end]);
		});
	}

	return [...byLine.entries()]
		.sort(([a], [b]) => a - b)
		.map(([line, ranges]) => ({ line, ...shorten(lines[line], ranges.sort((a, b) => a[0] - b[0])) }))
		.filter((mention) => mention.text.trim());
}

/** Mentions de la décision dans chacune de ses notes (celles qui n'ont plus de ligne retrouvée sont gardées, sans ligne). */
export async function decisionMentions(plugin: LegifrancePlugin, record: DecisionRecord): Promise<NoteMentions[]> {
	const result: NoteMentions[] = [];
	for (const path of record.notes) {
		const file = plugin.app.vault.getFileByPath(path);
		if (!file) continue;
		result.push({ path, mentions: await mentionsIn(plugin, file, record).catch(() => []) });
	}
	return result;
}
