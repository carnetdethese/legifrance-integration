/**
 * Contenu d'une note d'article : propriétés, texte, décisions de la base qui l'appliquent, notes qui le citent.
 * Module pur : les données sont fournies par `articleNotes.ts`.
 *
 * Le plugin ne possède que ce qui est entre deux repères `<!-- legifrance:… -->` et dans quatre propriétés
 * (`texte`, `numero`, `statut`, `lien`) : le reste de la note est à l'utilisateur et n'est jamais réécrit.
 */
import { displayDate } from "./timeline";

/** Une décision qui applique l'article. */
export interface ArticleNoteDecision {
	title: string;
	date?: string;
	court?: string;
	/** Note de la fiche, pour un lien interne. */
	fichePath?: string;
	url?: string;
}

export interface ArticleNoteData {
	/** « Code civil, art. 1240 » */
	label: string;
	/** Texte de l'article (Markdown), s'il a été retrouvé. */
	text?: string;
	/** Statut de vigueur, en toutes lettres. */
	status?: string;
	url?: string;
	decisions: ArticleNoteDecision[];
	/** Notes qui citent l'article. */
	notes: string[];
}

/** Parties de la note tenues à jour par le plugin. */
export type ArticleBlock = "texte" | "decisions" | "notes";

/** Texte et numéro d'un libellé d'article (« Code civil, art. 1240 » : « Code civil » et « 1240 »). */
export function splitLabel(label: string) {
	const at = label.indexOf(", art. ");
	return at < 0 ? { text: label, number: "" } : { text: label.slice(0, at), number: label.slice(at + 7) };
}

/** Propriétés tenues à jour (celles sans valeur sont absentes). */
export function articleProperties({ label, status, url }: ArticleNoteData): Record<string, string> {
	const { text, number } = splitLabel(label);
	return Object.fromEntries(Object.entries({ texte: text, numero: number, statut: status, lien: url }).filter(([, value]) => value)) as Record<string, string>;
}

const open = (block: ArticleBlock) => `<!-- legifrance:${block} -->`;
const close = (block: ArticleBlock) => `<!-- /legifrance:${block} -->`;
const wrap = (block: ArticleBlock, body: string) => `${open(block)}\n${body}\n${close(block)}`;

/** Corps de chaque partie tenue à jour. `link` : lien interne vers une note (`[[…]]`) pour le chemin donné. */
export function articleBlocks({ text, decisions, notes }: ArticleNoteData, link: (path: string, alias: string) => string): Record<ArticleBlock, string> {
	const decisionLines = decisions.map((d) => {
		const target = d.fichePath ? link(d.fichePath, d.title) : d.url ? `[${d.title}](${d.url})` : d.title;
		const details = [displayDate(d.date), d.court].filter(Boolean).join(", ");
		return `- ${target}${details ? ` (${details})` : ""}`;
	});
	return {
		texte: text ? text.trim().split("\n").map((line) => `> ${line}`).join("\n") : "*Le texte de l'article n'a pas été retrouvé : il apparaîtra ici dès qu'il sera récupéré.*",
		decisions: decisionLines.length ? decisionLines.join("\n") : "*Aucune décision de la base ne l'applique (pour l'instant).*",
		notes: notes.length ? notes.map((path) => `- ${link(path, path.split("/").pop()!.replace(/\.md$/, ""))}`).join("\n") : "*Aucune.*",
	};
}

/** Note de l'article : propriétés, puis les trois parties tenues à jour, avec une place pour les remarques. */
export function articleNoteContent(data: ArticleNoteData, link: (path: string, alias: string) => string) {
	const blocks = articleBlocks(data, link);
	const front = Object.entries(articleProperties(data)).map(([name, value]) => `${name}: ${JSON.stringify(value)}`);
	return [
		"---",
		"type: article",
		...front,
		"---",
		"",
		`# ${data.label}`,
		"",
		wrap("texte", blocks.texte),
		"",
		"## Mes remarques",
		"",
		"",
		"## Décisions qui l'appliquent",
		"",
		wrap("decisions", blocks.decisions),
		"",
		"## Notes qui le citent",
		"",
		wrap("notes", blocks.notes),
		"",
	].join("\n");
}

/**
 * Contenu d'une note d'article avec ses parties tenues à jour. Ce qui est hors des repères n'est pas touché ;
 * une partie dont les repères ont disparu (supprimés par l'utilisateur) n'est pas recréée.
 */
export function refreshArticleContent(content: string, data: ArticleNoteData, link: (path: string, alias: string) => string) {
	const blocks = articleBlocks(data, link);
	let result = content;
	for (const block of Object.keys(blocks) as ArticleBlock[]) {
		const start = result.indexOf(open(block));
		const end = result.indexOf(close(block), start + 1);
		if (start < 0 || end < 0) continue;
		result = result.slice(0, start) + wrap(block, blocks[block]) + result.slice(end + close(block).length);
	}
	return result;
}
