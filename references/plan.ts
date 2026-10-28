/**
 * Plan de cours d'une note, à partir des décisions qu'elle cite : « thème → décisions → articles
 * appliqués ». Module pur : les décisions, leurs articles et la forme des liens sont fournis.
 */
import { themeKey, topTheme } from "./themes";
import { DecisionRecord, byDate, displayDate } from "./timeline";

/** Un article appliqué par une décision, et le nombre de fois où elle le cite. */
export interface PlanArticle {
	label: string;
	count: number;
}

/** Nombre d'articles listés sous chaque décision. */
const MAX_ARTICLES = 5;

/** Libellé d'un thème de plus haut niveau, ou, faute de thème, la juridiction. */
function groupOf(record: DecisionRecord) {
	const theme = record.themes[0] && topTheme(record.themes[0]);
	if (theme) return { key: `t:${themeKey(theme)}`, title: theme, themed: true };
	const court = record.court ?? "Juridiction inconnue";
	return { key: `c:${court}`, title: `Sans thème — ${court}`, themed: false };
}

/**
 * Plan en Markdown. Les décisions sont regroupées par thème de plus haut niveau (les thèmes les plus
 * fournis d'abord), puis, pour celles dont le thème n'est pas connu (texte pas encore complété), par
 * juridiction. Dans un groupe, ordre chronologique.
 * @param articles articles appliqués, par identifiant de décision (`DecisionRecord.id`)
 * @param link lien interne vers une note (`[[…]]`) pour le chemin donné
 * @param level niveau du titre « Plan » (les thèmes sont un niveau plus bas)
 */
export function coursePlan(records: DecisionRecord[], articles: Map<string, PlanArticle[]>, link: (path: string, alias: string) => string, level = 2) {
	const groups = new Map<string, { title: string; themed: boolean; items: DecisionRecord[] }>();
	for (const record of [...records].sort(byDate)) {
		const { key, title, themed } = groupOf(record);
		const group = groups.get(key) ?? { title, themed, items: [] };
		group.items.push(record);
		groups.set(key, group);
	}
	const ordered = [...groups.values()].sort((a, b) => Number(b.themed) - Number(a.themed) || b.items.length - a.items.length || a.title.localeCompare(b.title));

	const hash = (n: number) => "#".repeat(Math.min(n, 6));
	const lines = [`${hash(level)} Plan des décisions citées`];
	for (const group of ordered) {
		lines.push("", `${hash(level + 1)} ${group.title} (${group.items.length})`, "");
		for (const r of group.items) {
			const name = (r.name ?? r.title ?? r.label).replace(/\s+/g, " ").trim();
			const target = r.fichePath ? link(r.fichePath, name) : r.url ? `[${name}](${r.url})` : name;
			const details = [displayDate(r.date), r.court].filter(Boolean).join(", ");
			lines.push(`- ${target}${details ? ` (${details})` : ""}${r.solution ? ` — ${r.solution}` : ""}`);
			const applied = [...(articles.get(r.id) ?? [])].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
			if (applied.length) {
				const shown = applied.slice(0, MAX_ARTICLES).map((a) => a.label);
				const more = applied.length - shown.length;
				lines.push(`  - Articles : ${shown.join(" ; ")}${more > 0 ? ` (+ ${more})` : ""}`);
			}
		}
	}
	return lines.join("\n");
}
