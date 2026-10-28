/**
 * Contenu d'une note d'article : propriétés, texte, décisions de la base qui l'appliquent, notes qui le citent.
 * Module pur : les données sont fournies par `createArticleNote` (`insights.ts`).
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

/** Texte et numéro d'un libellé d'article (« Code civil, art. 1240 » : « Code civil » et « 1240 »). */
export function splitLabel(label: string) {
	const at = label.indexOf(", art. ");
	return at < 0 ? { text: label, number: "" } : { text: label.slice(0, at), number: label.slice(at + 7) };
}

/**
 * Note de l'article en Markdown.
 * @param link lien interne vers une note (`[[…]]`) pour le chemin donné
 */
export function articleNoteContent({ label, text, status, url, decisions, notes }: ArticleNoteData, link: (path: string, alias: string) => string) {
	const parts = splitLabel(label);
	const quote = (value: string) => JSON.stringify(value);
	const front = ["type: article", `texte: ${quote(parts.text)}`, parts.number && `numero: ${quote(parts.number)}`, status && `statut: ${quote(status)}`, url && `lien: ${quote(url)}`].filter(Boolean);
	const lines = ["---", ...front, "---", "", `# ${label}`, ""];
	if (text) lines.push(...text.trim().split("\n").map((line) => `> ${line}`), "");
	else lines.push("*Le texte de l'article n'a pas été retrouvé : complétez-le depuis le panneau des références.*", "");

	lines.push("## Décisions qui l'appliquent", "");
	if (decisions.length === 0) lines.push("*Aucune décision de la base ne l'applique (pour l'instant).*");
	for (const d of decisions) {
		const target = d.fichePath ? link(d.fichePath, d.title) : d.url ? `[${d.title}](${d.url})` : d.title;
		const details = [displayDate(d.date), d.court].filter(Boolean).join(", ");
		lines.push(`- ${target}${details ? ` (${details})` : ""}`);
	}
	lines.push("", "## Notes qui le citent", "");
	if (notes.length === 0) lines.push("*Aucune.*");
	for (const path of notes) lines.push(`- ${link(path, path.split("/").pop()!.replace(/\.md$/, ""))}`);
	return lines.join("\n");
}
