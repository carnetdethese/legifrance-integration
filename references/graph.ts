/**
 * Graphe des citations : notes ↔ décisions ↔ articles. Trois sortes de liens :
 * - une note **cite** une décision (écrite en toutes lettres, ou par un lien vers sa fiche) ;
 * - une décision **applique** un article (visé dans son texte) ;
 * - une note **mentionne** un article (citation écrite dans la note).
 * Les liens sont orientés dans ce sens (note → décision → article, note → article) : ce sont les flèches du graphe.
 * Le graphe affiché est un extrait : les décisions et articles les plus liés, éventuellement filtrés par
 * thème ou par note. Les décisions pivots (très liées) et les notes isolées (qui ne partagent rien avec
 * d'autres notes) se calculent sur toute la base. La disposition est une simulation de forces (`ForceSimulation`,
 * à la manière du graphe d'Obsidian) et les réglages (`GraphSettings`) reprennent les siens. Module pur.
 */
import { themeKey } from "./themes";

export type NodeKind = "note" | "decision" | "article";

/** Une décision, telle que le graphe la voit. */
export interface GraphDecision {
	id: string;
	label: string;
	/** Thèmes de plus haut niveau. */
	themes: string[];
	/** AAAA-MM-JJ, AAAA-MM ou AAAA : ordonne l'animation. */
	date?: string;
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
	/** Décision : tous ses thèmes de plus haut niveau (pour les groupes). */
	themes?: string[];
	/** Note : son chemin ; décision : les chemins des notes qui la citent (pour les groupes). */
	paths?: string[];
	/** Décision : sa date. */
	date?: string;
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
	/** Mots cherchés : les décisions dont l'intitulé, la date, les thèmes, les notes qui les citent ou les articles qu'elles appliquent les contiennent tous. */
	search?: string;
	/** Seulement les décisions qui ont une fiche (les autres ne sont que citées). */
	fichesOnly?: boolean;
	/** Garder les nœuds sans aucun lien dans l'extrait (oui par défaut). */
	orphans?: boolean;
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
	const { theme, note, maxDecisions = 40, maxArticles = 40, maxNotes = 120, showNotes = true, showArticles = true, mentions = false, search, fichesOnly = false, orphans = true } = options;
	const scores = decisionScores(input);

	// 1. Décisions.
	let decisions = input.decisions.filter((d) => d.notes.length > 0 || scores.get(d.id)! > 0);
	if (theme) decisions = decisions.filter((d) => d.themes.some((t) => themeKey(t) === themeKey(theme)));
	if (note) decisions = decisions.filter((d) => d.notes.includes(note));
	if (fichesOnly) decisions = decisions.filter((d) => d.fiche);
	const words = themeKey(search ?? "").split(" ").filter(Boolean);
	if (words.length > 0) {
		const articlesOf = new Map<string, string[]>();
		for (const a of input.decisionArticles) articlesOf.set(a.decisionId, [...(articlesOf.get(a.decisionId) ?? []), a.label]);
		decisions = decisions.filter((d) => {
			const text = themeKey([d.label, d.date ?? "", ...d.themes, ...d.notes.map(noteLabel), ...(articlesOf.get(d.id) ?? [])].join(" "));
			return words.every((word) => text.includes(word));
		});
	}
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
	const noteNode = (path: string) => node("note", path, noteLabel(path), { isolated: isolated.has(path), paths: [path] });
	for (const d of decisions) {
		const id = node("decision", d.id, d.label, { theme: d.themes[0], themes: d.themes, paths: d.notes, date: d.date, fiche: d.fiche, pivot: pivots.has(d.id) });
		for (const path of d.notes) if (keptNotes.has(path)) link(noteNode(path), id, "cite");
	}
	for (const key of keptArticles) {
		const id = node("article", key, articleLabels.get(key) ?? key);
		for (const [decisionId, count] of appliedBy.get(key) ?? []) link(idOf("decision", decisionId), id, "apply", count);
		if (mentions || note) for (const path of writtenBy.get(key) ?? []) if (keptNotes.has(path)) link(noteNode(path), id, "mention");
	}
	for (const path of keptNotes) noteNode(path);

	for (const edge of edges) {
		nodes.get(edge.source)!.degree++;
		nodes.get(edge.target)!.degree++;
	}
	const kept = [...nodes.values()].filter((n) => orphans || n.degree > 0);
	return { nodes: kept, edges, available: { decisions: availableDecisions, articles: availableArticles, notes: availableNotes } };
}

/** Nom d'une note d'après son chemin. */
const noteLabel = (path: string) => path.split("/").pop()!.replace(/\.md$/, "");

// --- Réglages -----------------------------------------------------------------

/**
 * Groupe de couleur : les nœuds qui répondent à la requête prennent sa couleur ; le premier groupe de la liste qui
 * convient l'emporte. La requête est faite de mots séparés par des espaces, tous requis : `type:note`,
 * `type:décision`, `type:article`, `theme:responsabilité`, `path:Atlas/Notes` (chemin de la note, ou d'une note qui
 * cite la décision) ou un mot de l'intitulé.
 */
export interface GraphGroup {
	query: string;
	/** #rrggbb */
	color: string;
}

/** Forces de la simulation ; mêmes curseurs que le graphe d'Obsidian. */
export interface ForceSettings {
	/** Attraction vers le centre. */
	centerForce: number;
	/** Répulsion entre les nœuds. */
	repelForce: number;
	/** Raideur des liens. */
	linkForce: number;
	/** Longueur des liens au repos. */
	linkDistance: number;
}

/** Réglages du graphe, conservés d'une ouverture à l'autre. */
export interface GraphSettings extends ForceSettings {
	// Filtres
	showNotes: boolean;
	showArticles: boolean;
	mentions: boolean;
	fichesOnly: boolean;
	orphans: boolean;
	maxDecisions: number;
	// Groupes
	groups: GraphGroup[];
	// Afficher
	arrows: boolean;
	/** Plus il est haut, plus les intitulés se montrent de loin. */
	textFade: number;
	nodeSize: number;
	linkSize: number;
}

/** Étendue des curseurs (celle d'Obsidian). */
export const GRAPH_RANGES = {
	textFade: { min: -3, max: 3, step: 0.1 },
	nodeSize: { min: 0.1, max: 5, step: 0.1 },
	linkSize: { min: 0.1, max: 5, step: 0.1 },
	centerForce: { min: 0, max: 1, step: 0.01 },
	repelForce: { min: 0, max: 20, step: 0.01 },
	linkForce: { min: 0, max: 1, step: 0.01 },
	linkDistance: { min: 30, max: 500, step: 1 },
} as const;

/** Nombres de décisions proposés : au-delà, le graphe devient illisible. */
export const GRAPH_LIMITS = [20, 40, 80, 150, 300, 600];

/** Couleurs proposées aux nouveaux groupes. */
export const GROUP_COLORS = ["#e5534b", "#d4a72c", "#3fb950", "#39c5cf", "#a371f7", "#db61a2"];

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
	showNotes: true,
	showArticles: true,
	mentions: false,
	fichesOnly: false,
	orphans: true,
	maxDecisions: 150,
	groups: [
		{ query: "type:note", color: "#4f9cf9" },
		{ query: "type:décision", color: "#f0953a" },
		{ query: "type:article", color: "#a07cf5" },
	],
	arrows: false,
	textFade: -0.3,
	nodeSize: 1,
	linkSize: 1,
	centerForce: 0.5,
	repelForce: 10,
	linkForce: 1,
	linkDistance: 250,
};

/** Réglages lus dans `data.json` : ce qui manque ou sort des bornes reprend sa valeur par défaut. */
export function mergeGraphSettings(saved: unknown): GraphSettings {
	const raw = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
	const defaults = DEFAULT_GRAPH_SETTINGS;
	const flag = (key: keyof GraphSettings) => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : (defaults[key] as boolean));
	const range = (key: keyof typeof GRAPH_RANGES) => {
		const value = raw[key];
		const { min, max } = GRAPH_RANGES[key];
		return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : (defaults[key] as number);
	};
	const limit = typeof raw.maxDecisions === "number" ? GRAPH_LIMITS.find((n) => n >= (raw.maxDecisions as number)) ?? GRAPH_LIMITS[GRAPH_LIMITS.length - 1] : defaults.maxDecisions;
	const groups = Array.isArray(raw.groups)
		? raw.groups
				.filter((g): g is GraphGroup => !!g && typeof g.query === "string" && typeof g.color === "string" && /^#[0-9a-f]{6}$/i.test(g.color))
				.slice(0, 12)
				.map((g) => ({ query: g.query, color: g.color.toLowerCase() }))
		: defaults.groups.map((g) => ({ ...g }));
	return {
		showNotes: flag("showNotes"),
		showArticles: flag("showArticles"),
		mentions: flag("mentions"),
		fichesOnly: flag("fichesOnly"),
		orphans: flag("orphans"),
		maxDecisions: limit,
		groups,
		arrows: flag("arrows"),
		textFade: range("textFade"),
		nodeSize: range("nodeSize"),
		linkSize: range("linkSize"),
		centerForce: range("centerForce"),
		repelForce: range("repelForce"),
		linkForce: range("linkForce"),
		linkDistance: range("linkDistance"),
	};
}

// --- Groupes ----------------------------------------------------------------------

const kindNamed = (name: string): NodeKind | undefined => {
	const key = themeKey(name);
	if (key.startsWith("note")) return "note";
	if (key.startsWith("decision")) return "decision";
	if (key.startsWith("article")) return "article";
	return undefined;
};

/** Le nœud répond-il à la requête d'un groupe ? Une requête vide ne retient rien. */
export function matchesQuery(node: GraphNode, query: string): boolean {
	const terms = query.trim().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return false;
	return terms.every((term) => {
		const colon = term.indexOf(":");
		const operator = colon > 0 ? term.slice(0, colon).toLowerCase() : "";
		const value = term.slice(colon + 1);
		if (operator === "type") return kindNamed(value) === node.kind;
		if (operator === "theme") {
			const key = themeKey(value);
			return key !== "" && !!node.themes?.some((t) => themeKey(t).includes(key));
		}
		if (operator === "path") return value !== "" && !!node.paths?.some((p) => p.toLowerCase().includes(value.toLowerCase()));
		const word = themeKey(term);
		return word !== "" && themeKey(node.label).includes(word);
	});
}

/** Rang du premier groupe auquel appartient le nœud, ou -1. */
export function nodeGroup(node: GraphNode, groups: GraphGroup[]) {
	return groups.findIndex((g) => matchesQuery(node, g.query));
}

// --- Animation --------------------------------------------------------------------

/**
 * Instant d'apparition de chaque nœud, de 0 à 1, pour rejouer la constitution du graphe : les décisions
 * paraissent par date croissante (celles sans date à la fin), et une note ou un article avec la première
 * décision qui lui est liée.
 */
export function appearanceOrder(nodes: GraphNode[], edges: GraphEdge[]) {
	const earlier = (a?: string, b?: string) => ((a ?? "9999") < (b ?? "9999") ? -1 : (a ?? "9999") > (b ?? "9999") ? 1 : 0);
	const decisions = nodes.filter((n) => n.kind === "decision").sort((a, b) => earlier(a.date, b.date) || (a.id < b.id ? -1 : 1));
	const at = new Map<string, number>();
	decisions.forEach((d, i) => at.set(d.id, (i + 1) / decisions.length));
	const isDecision = new Set(decisions.map((d) => d.id));
	const pull = (from: string, to: string) => {
		const time = at.get(from);
		if (time === undefined || isDecision.has(to)) return;
		const known = at.get(to);
		if (known === undefined || time < known) at.set(to, time);
	};
	// Deux passes : une note relie une décision à un article, un article à une note.
	for (let pass = 0; pass < 2; pass++) {
		for (const { source, target } of edges) {
			pull(source, target);
			pull(target, source);
		}
	}
	for (const node of nodes) if (!at.has(node.id)) at.set(node.id, 1);
	return at;
}

// --- Simulation de forces -------------------------------------------------------------

const ALPHA_MIN = 0.001;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);
const VELOCITY_DECAY = 0.4;
/** Échelles entre les curseurs d'Obsidian et les forces. */
const REPEL_SCALE = 15;
const CENTER_SCALE = 0.06;
const GOLDEN_ANGLE = 2.399963;

export interface Point {
	x: number;
	y: number;
}

/**
 * Simulation de forces à la manière de d3-force, que le graphe d'Obsidian utilise : les liens sont des ressorts, les
 * nœuds se repoussent (force en 1/distance), une faible attraction ramène le tout vers le centre. L'« énergie »
 * (`alpha`) décroît à chaque pas jusqu'à l'arrêt ; `reheat` la relance après un changement. Déterministe : le même
 * graphe donne le même dessin. Le coût d'un pas est quadratique (répulsion de chaque paire), ce qui convient pour
 * quelques centaines de nœuds. Les positions sont dans `x` et `y` (dans l'ordre de `nodes`) et recopiées dans les nœuds.
 */
export class ForceSimulation {
	readonly x: Float64Array;
	readonly y: Float64Array;
	private readonly vx: Float64Array;
	private readonly vy: Float64Array;
	/** 1 : le nœud participe à la simulation (l'animation garde les autres à l'écart jusqu'à leur apparition). */
	readonly active: Uint8Array;
	private readonly pinned: Uint8Array;
	private readonly links: { s: number; t: number; strength: number; bias: number }[] = [];
	/** Voisins de chaque nœud. */
	readonly adjacency: number[][];
	private participants = new Int32Array(0);
	private participantsStale = true;
	private seed = 1;
	alpha = 1;
	alphaTarget = 0;

	/**
	 * @param initial positions connues (celles d'un dessin précédent) : un nœud qui y figure y reste, les autres
	 *                se placent près de leurs voisins, ou en spirale.
	 */
	constructor(readonly nodes: GraphNode[], edges: GraphEdge[], public forces: ForceSettings, initial?: ReadonlyMap<string, Point>) {
		const n = nodes.length;
		this.x = new Float64Array(n);
		this.y = new Float64Array(n);
		this.vx = new Float64Array(n);
		this.vy = new Float64Array(n);
		this.active = new Uint8Array(n).fill(1);
		this.pinned = new Uint8Array(n);
		this.adjacency = nodes.map(() => []);

		const index = new Map(nodes.map((node, i) => [node.id, i]));
		const pairs: [number, number, number][] = [];
		const count = new Uint32Array(n);
		for (const e of edges) {
			const s = index.get(e.source);
			const t = index.get(e.target);
			if (s === undefined || t === undefined || s === t) continue;
			pairs.push([s, t, e.weight]);
			this.adjacency[s].push(t);
			this.adjacency[t].push(s);
			count[s]++;
			count[t]++;
		}
		for (const [s, t, weight] of pairs) {
			// Comme d3 : un lien est d'autant plus raide qu'il est rare pour ses deux bouts ; les liens répétés (un article
			// visé plusieurs fois) le sont un peu plus.
			const strength = Math.min(1, (1 + Math.log(Math.max(1, weight)) * 0.3) / Math.min(count[s], count[t]));
			this.links.push({ s, t, strength, bias: count[s] / (count[s] + count[t]) });
		}

		// Départ : positions connues, puis près des voisins déjà placés, sinon en spirale (déterministe, dans l'ordre des identifiants).
		const placed = new Uint8Array(n);
		nodes.forEach((node, i) => {
			const known = initial?.get(node.id);
			if (!known) return;
			this.x[i] = known.x;
			this.y[i] = known.y;
			placed[i] = 1;
		});
		const spacing = forces.linkDistance / 3;
		let rank = 0;
		for (const i of nodes.map((_, k) => k).filter((k) => !placed[k]).sort((a, b) => (nodes[a].id < nodes[b].id ? -1 : 1))) {
			const near = this.adjacency[i].filter((j) => placed[j]);
			if (near.length > 0) {
				const angle = i * GOLDEN_ANGLE;
				this.x[i] = near.reduce((sum, j) => sum + this.x[j], 0) / near.length + Math.cos(angle) * forces.linkDistance * 0.5;
				this.y[i] = near.reduce((sum, j) => sum + this.y[j], 0) / near.length + Math.sin(angle) * forces.linkDistance * 0.5;
			} else {
				const angle = rank * GOLDEN_ANGLE;
				const radius = spacing * Math.sqrt(rank + 0.5);
				this.x[i] = Math.cos(angle) * radius;
				this.y[i] = Math.sin(angle) * radius;
				rank++;
			}
			placed[i] = 1;
		}
		this.copyPositions();
	}

	/** La simulation est arrêtée : plus rien ne bouge tant qu'on ne la relance pas. */
	get settled() {
		return this.alpha < ALPHA_MIN && this.alphaTarget === 0;
	}

	reheat(alpha = 0.5) {
		this.alpha = Math.max(this.alpha, alpha);
	}

	/** Retient un nœud à une position (pendant qu'on le déplace). */
	pin(i: number, x: number, y: number) {
		this.pinned[i] = 1;
		this.x[i] = x;
		this.y[i] = y;
		this.vx[i] = 0;
		this.vy[i] = 0;
	}

	release(i: number) {
		this.pinned[i] = 0;
		this.vx[i] = 0;
		this.vy[i] = 0;
	}

	/** Écarte un nœud de la simulation (il n'agit plus et ne subit plus rien) ou l'y remet. */
	setActive(i: number, on: boolean) {
		this.active[i] = on ? 1 : 0;
		this.participantsStale = true;
	}

	/** Remet un nœud dans la simulation, près de ses voisins visibles (sinon près du centre de ce qui est visible). */
	reveal(i: number) {
		const near = this.adjacency[i].filter((j) => this.active[j]);
		const around = near.length > 0 ? near : [...this.nodes.keys()].filter((j) => this.active[j]);
		const angle = i * GOLDEN_ANGLE;
		const offset = this.forces.linkDistance * 0.4;
		this.x[i] = (around.length ? around.reduce((sum, j) => sum + this.x[j], 0) / around.length : 0) + Math.cos(angle) * offset;
		this.y[i] = (around.length ? around.reduce((sum, j) => sum + this.y[j], 0) / around.length : 0) + Math.sin(angle) * offset;
		this.vx[i] = 0;
		this.vy[i] = 0;
		this.setActive(i, true);
	}

	/** Positions courantes, par identifiant de nœud. */
	snapshot() {
		return new Map(this.nodes.map((node, i) => [node.id, { x: this.x[i], y: this.y[i] }]));
	}

	private jiggle() {
		this.seed = (this.seed * 16807) % 2147483647;
		return this.seed / 2147483647 - 0.5;
	}

	private copyPositions() {
		for (let i = 0; i < this.nodes.length; i++) {
			this.nodes[i].x = this.x[i];
			this.nodes[i].y = this.y[i];
		}
	}

	/** Un pas de la simulation. */
	tick() {
		const { x, y, vx, vy, pinned } = this;
		const { centerForce, repelForce, linkForce, linkDistance } = this.forces;
		if (this.participantsStale) {
			this.participants = Int32Array.from(this.nodes.keys()).filter((i) => this.active[i]);
			this.participantsStale = false;
		}
		const list = this.participants;
		const m = list.length;
		this.alpha += (this.alphaTarget - this.alpha) * ALPHA_DECAY;
		const alpha = this.alpha;

		// Liens : des ressorts de longueur `linkDistance`.
		for (const { s, t, strength, bias } of this.links) {
			if (!this.active[s] || !this.active[t]) continue;
			let dx = x[t] + vx[t] - x[s] - vx[s];
			let dy = y[t] + vy[t] - y[s] - vy[s];
			if (dx === 0 && dy === 0) {
				dx = this.jiggle();
				dy = this.jiggle();
			}
			const d = Math.hypot(dx, dy);
			const f = ((d - linkDistance) / d) * alpha * strength * linkForce;
			dx *= f;
			dy *= f;
			vx[t] -= dx * bias;
			vy[t] -= dy * bias;
			vx[s] += dx * (1 - bias);
			vy[s] += dy * (1 - bias);
		}

		// Répulsion : chaque paire de nœuds se repousse, d'autant plus qu'elle est proche (1/distance).
		const charge = -repelForce * REPEL_SCALE * alpha;
		if (charge !== 0) {
			for (let a = 0; a < m; a++) {
				const i = list[a];
				const xi = x[i];
				const yi = y[i];
				let ax = 0;
				let ay = 0;
				for (let b = a + 1; b < m; b++) {
					const j = list[b];
					let dx = x[j] - xi;
					let dy = y[j] - yi;
					let d2 = dx * dx + dy * dy;
					if (d2 < 1) {
						dx = this.jiggle();
						dy = this.jiggle();
						d2 = 1;
					}
					const w = charge / d2;
					dx *= w;
					dy *= w;
					ax += dx;
					ay += dy;
					vx[j] -= dx;
					vy[j] -= dy;
				}
				vx[i] += ax;
				vy[i] += ay;
			}
		}

		// Centre : sans lui, les groupes qui ne sont reliés à rien partent à l'infini.
		const pull = centerForce * CENTER_SCALE * alpha;
		const maxStep = linkDistance;
		for (let a = 0; a < m; a++) {
			const i = list[a];
			if (pinned[i]) continue;
			vx[i] = (vx[i] - x[i] * pull) * (1 - VELOCITY_DECAY);
			vy[i] = (vy[i] - y[i] * pull) * (1 - VELOCITY_DECAY);
			const speed = Math.hypot(vx[i], vy[i]);
			if (speed > maxStep) {
				vx[i] *= maxStep / speed;
				vy[i] *= maxStep / speed;
			}
			x[i] += vx[i];
			y[i] += vy[i];
		}
		this.copyPositions();
	}
}

/** Position d'un nœud dans un cadre de `width` × `height`. */
export interface LayoutOptions {
	width?: number;
	height?: number;
	/** Pas de simulation (300 suffisent à l'arrêter). */
	iterations?: number;
	/** Marge conservée autour du dessin. */
	padding?: number;
	forces?: ForceSettings;
}

/**
 * Dispose les nœuds d'un coup (la simulation menée à son terme, puis mise à l'échelle dans le cadre sans déformer).
 * Les positions de `nodes` sont remplacées. Sert quand on n'anime pas.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], { width = 1000, height = 700, iterations = 300, padding = 40, forces = DEFAULT_GRAPH_SETTINGS }: LayoutOptions = {}) {
	if (nodes.length === 0) return nodes;
	const sim = new ForceSimulation(nodes, edges, forces);
	for (let step = 0; step < iterations; step++) sim.tick();

	const { x, y } = sim;
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
