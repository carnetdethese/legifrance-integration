/**
 * Graphe des citations : notes ↔ décisions ↔ articles. Trois sortes de liens :
 * - une note **cite** une décision (écrite en toutes lettres, ou par un lien vers sa fiche) ;
 * - une décision **applique** un article (visé dans son texte) ;
 * - une note **mentionne** un article (citation écrite dans la note).
 * Le graphe affiché est un extrait : les décisions et articles les plus liés, éventuellement filtrés par
 * thème ou par note. Les décisions pivots (très liées) et les notes isolées (qui ne partagent rien avec
 * d'autres notes) se calculent sur toute la base. Module pur.
 */
import { themeKey } from "./themes";

export type NodeKind = "note" | "decision" | "article";

/** Une décision, telle que le graphe la voit. */
export interface GraphDecision {
	id: string;
	label: string;
	/** Thèmes de plus haut niveau. */
	themes: string[];
	/** La décision a une fiche. */
	fiche: boolean;
	/** Notes qui la citent. */
	notes: string[];
}

export interface GraphInput {
	decisions: GraphDecision[];
	/** Articles écrits dans les notes. */
	noteArticles: { note: string; key: string; label: string }[];
	/** Articles visés par le texte des décisions (`decisionId` = `GraphDecision.id`). */
	decisionArticles: { decisionId: string; key: string; label: string; count: number }[];
}

export interface GraphNode {
	id: string;
	kind: NodeKind;
	label: string;
	/** Nombre de liens dans le graphe affiché. */
	degree: number;
	/** Chemin de la note, identifiant de la décision ou clef de l'article. */
	ref: string;
	theme?: string;
	fiche?: boolean;
	pivot?: boolean;
	isolated?: boolean;
	x: number;
	y: number;
}

export interface GraphEdge {
	source: string;
	target: string;
	kind: "cite" | "apply" | "mention";
	weight: number;
}

export interface GraphOptions {
	/** Thème de plus haut niveau : seules les décisions de ce thème. */
	theme?: string;
	/** Chemin d'une note : cette note, ses décisions, leurs articles et les autres notes qui les citent. */
	note?: string;
	/** Décisions gardées, les plus liées d'abord (sans effet avec un filtre par note). */
	maxDecisions?: number;
	maxArticles?: number;
	maxNotes?: number;
	showNotes?: boolean;
	showArticles?: boolean;
	/** Relier aussi les notes aux articles qu'elles écrivent. */
	mentions?: boolean;
}

export interface Graph {
	nodes: GraphNode[];
	edges: GraphEdge[];
	/** Décisions, articles et notes qui répondent aux filtres, avant de limiter l'affichage. */
	available: { decisions: number; articles: number; notes: number };
}

const idOf = (kind: NodeKind, ref: string) => `${kind}:${ref}`;

/** Degré d'une décision dans l'ensemble de la base : notes qui la citent, articles qu'elle applique. */
function decisionScores(input: GraphInput) {
	const articles = new Map<string, number>();
	for (const { decisionId } of input.decisionArticles) articles.set(decisionId, (articles.get(decisionId) ?? 0) + 1);
	return new Map(input.decisions.map((d) => [d.id, d.notes.length * 2 + (articles.get(d.id) ?? 0)]));
}

/** Décisions pivots : citées par plusieurs notes, les plus liées d'abord. */
export function pivotDecisions(input: GraphInput, limit = 10) {
	const scores = decisionScores(input);
	return input.decisions
		.filter((d) => d.notes.length >= 2)
		.sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || a.label.localeCompare(b.label))
		.slice(0, limit);
}

/** Notes isolées : tout ce qu'elles citent (décisions, articles) n'est cité par aucune autre note. */
export function isolatedNotes(input: GraphInput) {
	const citedBy = new Map<string, Set<string>>();
	const cite = (target: string, note: string) => citedBy.set(target, (citedBy.get(target) ?? new Set()).add(note));
	for (const d of input.decisions) for (const note of d.notes) cite(idOf("decision", d.id), note);
	for (const a of input.noteArticles) cite(idOf("article", a.key), a.note);

	const targetsOf = new Map<string, string[]>();
	for (const [target, notes] of citedBy) for (const note of notes) targetsOf.set(note, [...(targetsOf.get(note) ?? []), target]);
	return [...targetsOf]
		.filter(([, targets]) => targets.every((t) => citedBy.get(t)!.size === 1))
		.map(([note]) => note)
		.sort((a, b) => a.localeCompare(b));
}

/**
 * Extrait du graphe selon les filtres et les limites. Les nœuds n'ont pas encore de position
 * (`layoutGraph`). Les décisions sont gardées par nombre de liens décroissant ; les articles, parmi ceux
 * que les décisions gardées appliquent ; les notes, parmi celles qui citent ce qui est gardé.
 */
export function buildGraph(input: GraphInput, options: GraphOptions = {}): Graph {
	const { theme, note, maxDecisions = 40, maxArticles = 40, maxNotes = 120, showNotes = true, showArticles = true, mentions = false } = options;
	const scores = decisionScores(input);

	// 1. Décisions.
	let decisions = input.decisions.filter((d) => d.notes.length > 0 || scores.get(d.id)! > 0);
	if (theme) decisions = decisions.filter((d) => d.themes.some((t) => themeKey(t) === themeKey(theme)));
	if (note) decisions = decisions.filter((d) => d.notes.includes(note));
	const availableDecisions = decisions.length;
	decisions = decisions.sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || a.label.localeCompare(b.label));
	if (!note) decisions = decisions.slice(0, maxDecisions);
	const keptDecisions = new Map(decisions.map((d) => [d.id, d]));

	// 2. Articles : ceux que les décisions gardées appliquent (et, avec un filtre par note, ceux que la note écrit).
	const articleLabels = new Map<string, string>();
	const appliedBy = new Map<string, Map<string, number>>();
	for (const a of input.decisionArticles) {
		if (!keptDecisions.has(a.decisionId)) continue;
		articleLabels.set(a.key, a.label);
		appliedBy.set(a.key, (appliedBy.get(a.key) ?? new Map()).set(a.decisionId, a.count));
	}
	const writtenBy = new Map<string, Set<string>>();
	for (const a of input.noteArticles) {
		writtenBy.set(a.key, (writtenBy.get(a.key) ?? new Set()).add(a.note));
		if (!articleLabels.has(a.key)) articleLabels.set(a.key, a.label);
	}
	let articleKeys = [...appliedBy.keys()];
	if (note) articleKeys = [...new Set([...articleKeys, ...input.noteArticles.filter((a) => a.note === note).map((a) => a.key)])];
	const articleScore = (key: string) => (appliedBy.get(key)?.size ?? 0) + (writtenBy.get(key)?.size ?? 0);
	const availableArticles = articleKeys.length;
	articleKeys = showArticles ? articleKeys.sort((a, b) => articleScore(b) - articleScore(a) || a.localeCompare(b)).slice(0, maxArticles) : [];
	const keptArticles = new Set(articleKeys);

	// 3. Notes : celles qui citent une décision gardée (ou, si demandé, un article gardé).
	const notesOf = new Map<string, number>();
	const bump = (path: string) => notesOf.set(path, (notesOf.get(path) ?? 0) + 1);
	for (const d of decisions) for (const path of d.notes) bump(path);
	if (mentions || note) for (const a of input.noteArticles) if (keptArticles.has(a.key)) bump(a.note);
	if (note) notesOf.set(note, (notesOf.get(note) ?? 0) + 1);
	const availableNotes = notesOf.size;
	const keptNotes = new Set(showNotes ? [...notesOf].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maxNotes).map(([path]) => path) : []);
	if (showNotes && note) keptNotes.add(note);

	// 4. Nœuds et liens.
	const nodes = new Map<string, GraphNode>();
	const node = (kind: NodeKind, ref: string, label: string, extra: Partial<GraphNode> = {}) => {
		const id = idOf(kind, ref);
		if (!nodes.has(id)) nodes.set(id, { id, kind, label, ref, degree: 0, x: 0, y: 0, ...extra });
		return id;
	};
	const edges: GraphEdge[] = [];
	const link = (source: string, target: string, kind: GraphEdge["kind"], weight = 1) => edges.push({ source, target, kind, weight });

	const pivots = new Set(pivotDecisions(input).map((d) => d.id));
	const isolated = new Set(isolatedNotes(input));
	for (const d of decisions) {
		const id = node("decision", d.id, d.label, { theme: d.themes[0], fiche: d.fiche, pivot: pivots.has(d.id) });
		for (const path of d.notes) if (keptNotes.has(path)) link(node("note", path, noteLabel(path), { isolated: isolated.has(path) }), id, "cite");
	}
	for (const key of keptArticles) {
		const id = node("article", key, articleLabels.get(key) ?? key);
		for (const [decisionId, count] of appliedBy.get(key) ?? []) link(id, idOf("decision", decisionId), "apply", count);
		if (mentions || note) for (const path of writtenBy.get(key) ?? []) if (keptNotes.has(path)) link(node("note", path, noteLabel(path), { isolated: isolated.has(path) }), id, "mention");
	}
	for (const path of keptNotes) node("note", path, noteLabel(path), { isolated: isolated.has(path) });

	for (const edge of edges) {
		nodes.get(edge.source)!.degree++;
		nodes.get(edge.target)!.degree++;
	}
	return { nodes: [...nodes.values()], edges, available: { decisions: availableDecisions, articles: availableArticles, notes: availableNotes } };
}

/** Nom d'une note d'après son chemin. */
const noteLabel = (path: string) => path.split("/").pop()!.replace(/\.md$/, "");

/** Position d'un nœud dans un cadre de `width` × `height`. */
export interface LayoutOptions {
	width?: number;
	height?: number;
	iterations?: number;
	/** Marge conservée autour du dessin. */
	padding?: number;
}

/**
 * Dispose les nœuds (algorithme de Fruchterman et Reingold : les nœuds se repoussent, les liens les
 * rapprochent). Déterministe : le même graphe donne le même dessin. Les positions de `nodes` sont
 * remplacées ; le coût est quadratique, ce qui convient pour quelques centaines de nœuds.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], { width = 1000, height = 700, iterations = 250, padding = 40 }: LayoutOptions = {}) {
	const n = nodes.length;
	if (n === 0) return nodes;
	const index = new Map(nodes.map((node, i) => [node.id, i]));
	// Départ : spirale, dans l'ordre des identifiants (déterministe).
	const order = nodes.map((_, i) => i).sort((a, b) => nodes[a].id.localeCompare(nodes[b].id));
	const x = new Float64Array(n);
	const y = new Float64Array(n);
	order.forEach((i, rank) => {
		const angle = rank * 2.399963; // angle d'or
		const radius = Math.sqrt(rank + 1) * 0.5 * Math.sqrt((width * height) / n);
		x[i] = Math.cos(angle) * radius;
		y[i] = Math.sin(angle) * radius;
	});

	const k = Math.sqrt((width * height) / n) * 0.8;
	const pairs = edges.map((e) => [index.get(e.source), index.get(e.target), e.weight] as const).filter((p): p is readonly [number, number, number] => p[0] !== undefined && p[1] !== undefined);
	const dx = new Float64Array(n);
	const dy = new Float64Array(n);
	for (let step = 0; step < iterations; step++) {
		const temperature = (width / 10) * (1 - step / iterations) + 0.5;
		dx.fill(0);
		dy.fill(0);
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				let ex = x[i] - x[j];
				let ey = y[i] - y[j];
				let d = Math.hypot(ex, ey);
				if (d < 0.01) {
					ex = (i - j) * 0.01;
					ey = 0.01;
					d = Math.hypot(ex, ey);
				}
				const force = (k * k) / d / d;
				dx[i] += ex * force;
				dy[i] += ey * force;
				dx[j] -= ex * force;
				dy[j] -= ey * force;
			}
		}
		for (const [a, b, weight] of pairs) {
			const ex = x[a] - x[b];
			const ey = y[a] - y[b];
			const d = Math.hypot(ex, ey) || 0.01;
			const force = (d / k) * (1 + Math.log1p(weight) * 0.3);
			dx[a] -= ex * force;
			dy[a] -= ey * force;
			dx[b] += ex * force;
			dy[b] += ey * force;
		}
		for (let i = 0; i < n; i++) {
			// Gravité vers le centre : sans elle, les groupes sans lien partent à l'infini.
			dx[i] -= x[i] * 0.05;
			dy[i] -= y[i] * 0.05;
			const d = Math.hypot(dx[i], dy[i]) || 1;
			const move = Math.min(d, temperature);
			x[i] += (dx[i] / d) * move;
			y[i] += (dy[i] / d) * move;
		}
	}

	// Mise à l'échelle dans le cadre, sans déformer.
	const minX = Math.min(...x), maxX = Math.max(...x), minY = Math.min(...y), maxY = Math.max(...y);
	const scale = Math.min((width - 2 * padding) / (maxX - minX || 1), (height - 2 * padding) / (maxY - minY || 1));
	const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale;
	const offsetY = (height - (maxY - minY) * scale) / 2 - minY * scale;
	nodes.forEach((node, i) => {
		node.x = x[i] * scale + offsetX;
		node.y = y[i] * scale + offsetY;
	});
	return nodes;
}

/** Identifiants des voisins directs d'un nœud. */
export function neighbors(edges: GraphEdge[], id: string) {
	const found = new Set<string>();
	for (const e of edges) {
		if (e.source === id) found.add(e.target);
		else if (e.target === id) found.add(e.source);
	}
	return found;
}
