import { ForceSimulation, Graph, GraphSettings, NodeKind, appearanceOrder, neighbors, nodeGroup } from "references/graph";

/** Ce que le dessin rapporte à la vue qui l'abrite. */
export interface RendererEvents {
	/** Clic sur un nœud, ou sur le fond (`undefined`). */
	select(id: string | undefined): void;
	/** L'animation chronologique commence ou se termine. */
	animating(on: boolean): void;
}

/** Couleurs du thème d'Obsidian (les mêmes variables que son graphe). */
interface Palette {
	line: string;
	node: string;
	text: string;
	focus: string;
	background: string;
	font: string;
}

interface View {
	/** Pixels par unité du monde. */
	k: number;
	tx: number;
	ty: number;
}

type Gesture =
	| { kind: "pan"; id: number; x: number; y: number; moved: boolean }
	| { kind: "node"; id: number; index: number; x: number; y: number; moved: boolean }
	| { kind: "pinch"; distance: number; x: number; y: number };

interface Animation {
	/** Indices des nœuds dans l'ordre d'apparition. */
	order: number[];
	/** Instant d'apparition de chaque nœud (0 – 1). */
	times: number[];
	next: number;
	start: number;
	duration: number;
}

const TAU = Math.PI * 2;
/** Rayon d'un nœud (pixels, au zoom d'ajustement, taille 1) selon son espèce ; le degré et le statut de pivot s'y ajoutent. */
const BASE_RADIUS: Record<NodeKind, number> = { note: 2.6, decision: 3, article: 2.6 };
const LABEL_LENGTH = 30;
const CLICK_DISTANCE = 5;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Dessin du graphe sur un canvas, façon Obsidian : petits points, liens fins, intitulés qui apparaissent avec le
 * zoom, simulation de forces qui anime la disposition en continu. On déplace un nœud en le glissant, la vue en
 * glissant le fond, on zoome à la molette ou à deux doigts ; le survol (ou la sélection) met en avant un nœud et ses
 * voisins. Rien ne passe par React : la boucle de dessin ne tourne que tant que quelque chose bouge.
 */
export class GraphRenderer {
	private readonly ctx: CanvasRenderingContext2D;
	private readonly observer: ResizeObserver;
	private readonly win: Window;
	private palette: Palette;
	private settings: GraphSettings;

	private graph: Graph = { nodes: [], edges: [], available: { decisions: 0, articles: 0, notes: 0 } };
	private sim?: ForceSimulation;
	private index = new Map<string, number>();
	private edges: { s: number; t: number; kind: string }[] = [];
	private base: number[] = [];
	private colors: string[] = [];
	private labels: string[] = [];
	/** Nœuds par importance décroissante : leurs intitulés passent en premier. */
	private byWeight: number[] = [];

	private width = 0;
	private height = 0;
	private dpr = 1;
	private view: View = { k: 1, tx: 0, ty: 0 };
	private target?: View;
	/** Cadrage automatique : tant que l'utilisateur n'a pas touché à la vue, elle suit le dessin. */
	private autoFit = true;
	private fitK = 1;
	/** Nœud que la vue suit (sélectionné depuis une liste). */
	private follow = -1;

	private hovered = -1;
	private selected = -1;
	private selectedId?: string;
	private near = new Set<number>();
	private pointers = new Map<number, { x: number; y: number }>();
	private gesture?: Gesture;
	private animation?: Animation;
	private year = "";
	private frame = 0;
	private destroyed = false;

	constructor(private readonly canvas: HTMLCanvasElement, settings: GraphSettings, private readonly events: RendererEvents) {
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas indisponible");
		this.ctx = ctx;
		this.settings = settings;
		this.win = canvas.ownerDocument.defaultView ?? window;
		this.palette = this.readPalette();

		canvas.addEventListener("pointerdown", this.onPointerDown);
		canvas.addEventListener("pointermove", this.onPointerMove);
		canvas.addEventListener("pointerup", this.onPointerUp);
		canvas.addEventListener("pointercancel", this.onPointerUp);
		canvas.addEventListener("pointerleave", this.onPointerLeave);
		canvas.addEventListener("wheel", this.onWheel, { passive: false });
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(canvas);
		this.resize();
	}

	destroy() {
		this.destroyed = true;
		this.win.cancelAnimationFrame(this.frame);
		this.observer.disconnect();
		const { canvas } = this;
		canvas.removeEventListener("pointerdown", this.onPointerDown);
		canvas.removeEventListener("pointermove", this.onPointerMove);
		canvas.removeEventListener("pointerup", this.onPointerUp);
		canvas.removeEventListener("pointercancel", this.onPointerUp);
		canvas.removeEventListener("pointerleave", this.onPointerLeave);
		canvas.removeEventListener("wheel", this.onWheel);
	}

	// --- Ce que la vue transmet -------------------------------------------------------------

	/** Nouvel extrait : les nœuds déjà là gardent leur place, les autres arrivent près de leurs voisins. */
	setGraph(graph: Graph) {
		this.stopAnimation();
		const previous = this.sim?.snapshot();
		const fresh = !previous || previous.size === 0;
		this.graph = graph;
		this.index = new Map(graph.nodes.map((node, i) => [node.id, i]));
		this.edges = graph.edges.flatMap((e) => {
			const s = this.index.get(e.source);
			const t = this.index.get(e.target);
			return s === undefined || t === undefined ? [] : [{ s, t, kind: e.kind }];
		});
		this.labels = graph.nodes.map((node) => (node.label.length > LABEL_LENGTH ? `${node.label.slice(0, LABEL_LENGTH - 1)}…` : node.label));
		this.base = graph.nodes.map((node) => BASE_RADIUS[node.kind] + Math.min(Math.sqrt(node.degree), 4) * 1.1 + (node.pivot ? 1.5 : 0));
		this.byWeight = graph.nodes.map((_, i) => i).sort((a, b) => graph.nodes[b].degree - graph.nodes[a].degree);
		this.sim = graph.nodes.length > 0 ? new ForceSimulation(graph.nodes, graph.edges, this.settings, previous) : undefined;
		if (this.sim) {
			if (this.reducedMotion) for (let step = 0; step < 300; step++) this.sim.tick();
			else if (fresh) for (let step = 0; step < 60; step++) this.sim.tick();
			else this.sim.reheat(0.5);
		}
		this.hovered = -1;
		this.selected = this.selectedId ? this.index.get(this.selectedId) ?? -1 : -1;
		this.computeNear();
		this.applyColors();
		if (fresh) {
			this.autoFit = true;
			this.follow = -1;
			this.view = this.fitView() ?? this.view;
			this.target = undefined;
		}
		this.invalidate();
	}

	/** Nouveaux réglages : couleurs des groupes, tailles, flèches et, si elles ont changé, forces (qui relancent la simulation). */
	setSettings(settings: GraphSettings) {
		const old = this.settings;
		this.settings = settings;
		this.applyColors();
		const sim = this.sim;
		if (sim) {
			const changed = (["centerForce", "repelForce", "linkForce", "linkDistance"] as const).some((key) => old[key] !== settings[key]);
			sim.forces = settings;
			if (changed) sim.reheat(0.6);
		}
		this.invalidate();
	}

	/** Sélection venue de la vue ; si elle ne vient pas d'un clic sur le dessin, la vue se centre sur le nœud. */
	setSelected(id: string | undefined) {
		this.selectedId = id;
		const index = id === undefined ? -1 : this.index.get(id) ?? -1;
		const external = index >= 0 && index !== this.selected;
		this.selected = index;
		this.computeNear();
		if (external) {
			this.follow = index;
			this.autoFit = false;
		}
		this.invalidate();
	}

	/** Le thème d'Obsidian a changé. */
	refreshColors() {
		this.palette = this.readPalette();
		this.applyColors();
		this.invalidate();
	}

	zoomBy(factor: number) {
		this.zoomAt(this.width / 2, this.height / 2, factor);
	}

	/** Recadre l'ensemble du dessin, et le suit tant qu'on n'y touche pas. */
	fit() {
		this.autoFit = true;
		this.follow = -1;
		this.invalidate();
	}

	get animating() {
		return !!this.animation;
	}

	/** Rejoue la constitution du graphe : les décisions paraissent par date, avec ce qui leur est lié. */
	animate() {
		const sim = this.sim;
		if (!sim) return;
		const { nodes, edges } = this.graph;
		const at = appearanceOrder(nodes, edges);
		const times = nodes.map((node) => at.get(node.id) ?? 1);
		const order = nodes
			.map((_, i) => i)
			.sort((a, b) => times[a] - times[b] || (nodes[a].kind === "decision" ? 0 : 1) - (nodes[b].kind === "decision" ? 0 : 1) || a - b);
		for (let i = 0; i < nodes.length; i++) sim.setActive(i, false);
		this.animation = { order, times, next: 0, start: performance.now(), duration: clamp(nodes.length * 30, 3000, 10000) };
		this.year = "";
		sim.alphaTarget = 0.1;
		sim.reheat(0.5);
		this.autoFit = true;
		this.follow = -1;
		this.events.animating(true);
		this.invalidate();
	}

	/** Interrompt l'animation : tout le graphe est montré. */
	stopAnimation() {
		const sim = this.sim;
		if (!this.animation) return;
		this.animation = undefined;
		this.year = "";
		if (sim) {
			for (let i = 0; i < sim.nodes.length; i++) if (!sim.active[i]) sim.reveal(i);
			sim.alphaTarget = 0;
			sim.reheat(0.4);
		}
		this.events.animating(false);
		this.invalidate();
	}

	// --- Couleurs -------------------------------------------------------------------------------------

	private get reducedMotion() {
		return !!this.win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
	}

	/** Couleurs lues dans les variables du graphe d'Obsidian (celles que les thèmes règlent), à défaut dans le thème. */
	private readPalette(): Palette {
		const probe = this.canvas.ownerDocument.createElement("span");
		probe.style.display = "none";
		(this.canvas.parentElement ?? this.canvas.ownerDocument.body).appendChild(probe);
		const color = (expression: string) => {
			probe.style.color = "";
			probe.style.color = expression;
			return this.win.getComputedStyle(probe).color;
		};
		const palette = {
			line: color("var(--graph-line, var(--background-modifier-border-focus, #8884))"),
			node: color("var(--graph-node, var(--text-muted, #999))"),
			text: color("var(--graph-text, var(--text-normal, #ddd))"),
			focus: color("var(--graph-node-focused, var(--text-accent, #7b6cd9))"),
			background: color("var(--background-primary, #1e1e1e)"),
			font: this.win.getComputedStyle(this.canvas).fontFamily || "sans-serif",
		};
		probe.remove();
		return palette;
	}

	/** Couleur de chaque nœud : celle de son premier groupe, sinon la couleur des nœuds du thème. */
	private applyColors() {
		const { groups } = this.settings;
		this.colors = this.graph.nodes.map((node) => {
			const group = nodeGroup(node, groups);
			return group >= 0 ? groups[group].color : this.palette.node;
		});
	}

	// --- Dimensions et vue ----------------------------------------------------------------------------

	private resize() {
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		if (width === 0 || height === 0) return;
		this.dpr = this.win.devicePixelRatio || 1;
		this.width = width;
		this.height = height;
		this.canvas.width = Math.round(width * this.dpr);
		this.canvas.height = Math.round(height * this.dpr);
		if (!this.userView) this.view = this.fitView() ?? this.view;
		this.invalidate();
	}

	private get userView() {
		return !this.autoFit && this.follow < 0;
	}

	/** Vue qui montre tout le dessin (sans les nœuds les plus éloignés : 1 % de chaque côté). */
	private fitView(): View | undefined {
		const sim = this.sim;
		if (!sim || this.width === 0) return undefined;
		const xs: number[] = [];
		const ys: number[] = [];
		for (let i = 0; i < sim.x.length; i++) {
			if (!sim.active[i]) continue;
			xs.push(sim.x[i]);
			ys.push(sim.y[i]);
		}
		if (xs.length === 0) return undefined;
		xs.sort((a, b) => a - b);
		ys.sort((a, b) => a - b);
		const trim = xs.length >= 50 ? Math.floor(xs.length * 0.01) : 0;
		const minX = xs[trim], maxX = xs[xs.length - 1 - trim], minY = ys[trim], maxY = ys[ys.length - 1 - trim];
		const padding = Math.min(48, this.width / 8);
		const k = clamp(Math.min((this.width - 2 * padding) / Math.max(maxX - minX, 60), (this.height - 2 * padding) / Math.max(maxY - minY, 60)), 0.005, 2.5);
		this.fitK = k;
		return { k, tx: this.width / 2 - ((minX + maxX) / 2) * k, ty: this.height / 2 - ((minY + maxY) / 2) * k };
	}

	/** Rapproche la vue de sa cible ; vrai tant qu'elle bouge. */
	private moveView() {
		const sim = this.sim;
		const fit = this.fitView();
		if (this.follow >= 0 && sim) {
			const k = Math.max(this.view.k, this.fitK * 1.6);
			this.target = { k, tx: this.width / 2 - sim.x[this.follow] * k, ty: this.height / 2 - sim.y[this.follow] * k };
		} else if (this.autoFit && fit) this.target = fit;
		const { target, view } = this;
		if (!target) return false;
		const ease = 0.2;
		view.k *= Math.pow(target.k / view.k, ease);
		view.tx += (target.tx - view.tx) * ease;
		view.ty += (target.ty - view.ty) * ease;
		const near = Math.abs(target.k / view.k - 1) < 0.002 && Math.abs(target.tx - view.tx) < 0.3 && Math.abs(target.ty - view.ty) < 0.3;
		if (near) {
			Object.assign(view, target);
			if (!this.autoFit && this.follow < 0) this.target = undefined;
		}
		return !near;
	}

	private userMoved() {
		this.autoFit = false;
		this.follow = -1;
		this.target = undefined;
		this.invalidate();
	}

	private zoomAt(x: number, y: number, factor: number) {
		const { view } = this;
		const k = clamp(view.k * factor, this.fitK * 0.2, this.fitK * 40);
		const ratio = k / view.k;
		view.tx = x - (x - view.tx) * ratio;
		view.ty = y - (y - view.ty) * ratio;
		view.k = k;
		this.userMoved();
	}

	// --- Boucle de dessin -----------------------------------------------------------------------------------

	private invalidate() {
		if (this.frame || this.destroyed) return;
		this.frame = this.win.requestAnimationFrame(this.step);
	}

	private step = (now: number) => {
		this.frame = 0;
		const { sim } = this;
		let busy = false;
		if (sim) {
			if (this.animation) this.advance(now);
			if (!sim.settled) {
				sim.tick();
				busy = true;
			}
		}
		if (this.moveView()) busy = true;
		this.draw();
		if (busy || this.animation || this.gesture) this.invalidate();
	};

	/** Fait paraître les nœuds dont l'heure est venue ; à la fin, relâche la simulation. */
	private advance(now: number) {
		const { animation, sim } = this;
		if (!animation || !sim) return;
		const progress = (now - animation.start) / animation.duration;
		while (animation.next < animation.order.length && animation.times[animation.order[animation.next]] <= progress) {
			const i = animation.order[animation.next++];
			sim.reveal(i);
			const node = this.graph.nodes[i];
			if (node.kind === "decision" && node.date) this.year = node.date.slice(0, 4);
		}
		if (animation.next >= animation.order.length) this.stopAnimation();
	}

	private get activeIndex() {
		return this.hovered >= 0 ? this.hovered : this.selected;
	}

	private computeNear() {
		const active = this.activeIndex;
		this.near = new Set();
		if (active < 0) return;
		for (const id of neighbors(this.graph.edges, this.graph.nodes[active].id)) {
			const index = this.index.get(id);
			if (index !== undefined) this.near.add(index);
		}
	}

	private draw() {
		const { ctx, sim, palette, settings, width, height } = this;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		if (!sim) return;
		const { nodes } = this.graph;
		const { k, tx, ty } = this.view;
		const zoom = k / this.fitK;
		const scale = settings.nodeSize * clamp(Math.sqrt(zoom), 0.6, 3);
		const thickness = settings.linkSize * clamp(Math.sqrt(zoom), 0.7, 2.2);
		const active = this.activeIndex;
		const dim = active >= 0;
		const sx = (i: number) => sim.x[i] * k + tx;
		const sy = (i: number) => sim.y[i] * k + ty;
		const lit = (e: { s: number; t: number }) => e.s === active || e.t === active;
		const shown = (e: { s: number; t: number }) => sim.active[e.s] === 1 && sim.active[e.t] === 1;

		// Liens : ordinaires, puis ceux qui mentionnent (en pointillés), puis ceux du nœud mis en avant.
		ctx.lineCap = "round";
		ctx.strokeStyle = palette.line;
		ctx.lineWidth = thickness;
		for (const dashed of [false, true]) {
			ctx.globalAlpha = dim ? 0.12 : 0.9;
			ctx.setLineDash(dashed ? [3 * thickness, 3 * thickness] : []);
			ctx.beginPath();
			for (const e of this.edges) {
				if ((e.kind === "mention") !== dashed || !shown(e) || lit(e)) continue;
				ctx.moveTo(sx(e.s), sy(e.s));
				ctx.lineTo(sx(e.t), sy(e.t));
			}
			ctx.stroke();
		}
		ctx.setLineDash([]);
		if (dim) {
			ctx.globalAlpha = 1;
			ctx.strokeStyle = palette.focus;
			ctx.lineWidth = thickness * 1.5;
			ctx.beginPath();
			for (const e of this.edges) {
				if (!shown(e) || !lit(e)) continue;
				ctx.moveTo(sx(e.s), sy(e.s));
				ctx.lineTo(sx(e.t), sy(e.t));
			}
			ctx.stroke();
		}

		// Flèches : au bord du nœud visé.
		if (settings.arrows) {
			const size = 3.5 + thickness * 2;
			for (const lighted of dim ? [false, true] : [false]) {
				ctx.globalAlpha = lighted ? 1 : dim ? 0.12 : 0.9;
				ctx.fillStyle = lighted ? palette.focus : palette.line;
				ctx.beginPath();
				for (const e of this.edges) {
					if (!shown(e) || lit(e) !== lighted) continue;
					const dx = sx(e.t) - sx(e.s);
					const dy = sy(e.t) - sy(e.s);
					const length = Math.hypot(dx, dy);
					if (length < 1) continue;
					const ux = dx / length, uy = dy / length;
					const tip = this.base[e.t] * scale + 1;
					const px = sx(e.t) - ux * tip, py = sy(e.t) - uy * tip;
					ctx.moveTo(px, py);
					ctx.lineTo(px - ux * size - uy * size * 0.5, py - uy * size + ux * size * 0.5);
					ctx.lineTo(px - ux * size + uy * size * 0.5, py - uy * size - ux * size * 0.5);
					ctx.closePath();
				}
				ctx.fill();
			}
		}

		// Nœuds.
		for (let i = 0; i < nodes.length; i++) {
			if (!sim.active[i]) continue;
			const x = sx(i), y = sy(i);
			if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
			const node = nodes[i];
			const r = this.base[i] * scale;
			const faded = dim && i !== active && !this.near.has(i);
			ctx.globalAlpha = faded ? 0.2 : node.kind === "decision" && !node.fiche ? 0.6 : 1;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, TAU);
			if (node.isolated) {
				ctx.strokeStyle = this.colors[i];
				ctx.lineWidth = Math.max(1.2, r * 0.35);
				ctx.stroke();
			} else {
				ctx.fillStyle = this.colors[i];
				ctx.fill();
			}
		}
		for (const i of new Set([this.selected, this.hovered])) {
			if (i < 0 || !sim.active[i]) continue;
			ctx.globalAlpha = 1;
			ctx.strokeStyle = palette.focus;
			ctx.lineWidth = i === this.selected ? 2 : 1.5;
			ctx.beginPath();
			ctx.arc(sx(i), sy(i), this.base[i] * scale + 3, 0, TAU);
			ctx.stroke();
		}

		// Intitulés : d'autant plus tôt que le nœud est lié, et d'autant plus que le seuil est haut.
		ctx.font = `${Math.round(11 * clamp(Math.sqrt(zoom), 0.85, 1.5))}px ${palette.font}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.lineJoin = "round";
		ctx.lineWidth = 3;
		ctx.strokeStyle = palette.background;
		ctx.fillStyle = palette.text;
		for (const i of this.byWeight) {
			if (!sim.active[i]) continue;
			const node = nodes[i];
			const emphasised = i === active || i === this.selected || this.near.has(i);
			const alpha = emphasised ? 1 : clamp(Math.log2(zoom) + settings.textFade + Math.min(node.degree, 20) / 10 - 0.5 + (node.pivot ? 0.5 : 0), 0, 1) * (dim ? 0.2 : 1);
			if (alpha < 0.03) continue;
			const x = sx(i), y = sy(i);
			if (x < -80 || y < -40 || x > width + 80 || y > height + 40) continue;
			ctx.globalAlpha = alpha;
			const textY = y + this.base[i] * scale + 3;
			ctx.strokeText(this.labels[i], x, textY);
			ctx.fillText(this.labels[i], x, textY);
		}

		if (this.animation && this.year) {
			ctx.globalAlpha = 0.45;
			ctx.font = `600 32px ${palette.font}`;
			ctx.textAlign = "left";
			ctx.textBaseline = "bottom";
			ctx.fillText(this.year, 16, height - 12);
		}
		ctx.globalAlpha = 1;
	}

	// --- Pointeur ------------------------------------------------------------------------------------------------

	private point(event: PointerEvent | WheelEvent) {
		const rect = this.canvas.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	/** Nœud sous le pointeur (le plus proche de son centre), ou -1. */
	private hit(x: number, y: number, tolerance: number) {
		const { sim } = this;
		if (!sim) return -1;
		const { k, tx, ty } = this.view;
		const scale = this.settings.nodeSize * clamp(Math.sqrt(k / this.fitK), 0.6, 3);
		let best = -1;
		let bestGap = Infinity;
		for (let i = 0; i < sim.x.length; i++) {
			if (!sim.active[i]) continue;
			const gap = Math.hypot(sim.x[i] * k + tx - x, sim.y[i] * k + ty - y) - this.base[i] * scale;
			if (gap <= tolerance && gap < bestGap) {
				best = i;
				bestGap = gap;
			}
		}
		return best;
	}

	private world(x: number, y: number) {
		return { x: (x - this.view.tx) / this.view.k, y: (y - this.view.ty) / this.view.k };
	}

	private setHovered(index: number) {
		if (index === this.hovered) return;
		this.hovered = index;
		this.canvas.style.cursor = index >= 0 ? "pointer" : "grab";
		this.computeNear();
		this.invalidate();
	}

	private onPointerDown = (event: PointerEvent) => {
		const { x, y } = this.point(event);
		try {
			this.canvas.setPointerCapture(event.pointerId);
		} catch {
			// pointeur déjà relâché : le geste se poursuit sans capture
		}
		this.pointers.set(event.pointerId, { x, y });
		if (this.pointers.size === 2) {
			if (this.gesture?.kind === "node") this.sim?.release(this.gesture.index);
			const [a, b] = [...this.pointers.values()];
			this.gesture = { kind: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			return;
		}
		const index = this.hit(x, y, event.pointerType === "touch" ? 12 : 3);
		this.gesture = index >= 0 ? { kind: "node", id: event.pointerId, index, x, y, moved: false } : { kind: "pan", id: event.pointerId, x, y, moved: false };
		if (index >= 0) this.setHovered(index);
		this.canvas.style.cursor = index >= 0 ? "pointer" : "grabbing";
		this.invalidate();
	};

	private onPointerMove = (event: PointerEvent) => {
		const { x, y } = this.point(event);
		const previous = this.pointers.get(event.pointerId);
		const { gesture, sim } = this;
		if (!gesture) {
			if (event.pointerType === "mouse") this.setHovered(this.hit(x, y, 3));
			return;
		}
		if (previous) this.pointers.set(event.pointerId, { x, y });
		if (gesture.kind === "pinch") {
			if (this.pointers.size < 2) return;
			const [a, b] = [...this.pointers.values()];
			const distance = Math.hypot(a.x - b.x, a.y - b.y);
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			this.view.tx += mid.x - gesture.x;
			this.view.ty += mid.y - gesture.y;
			if (distance > 0 && gesture.distance > 0) this.zoomAt(mid.x, mid.y, distance / gesture.distance);
			this.gesture = { kind: "pinch", distance, x: mid.x, y: mid.y };
			return;
		}
		if (event.pointerId !== gesture.id) return;
		if (!gesture.moved && Math.hypot(x - gesture.x, y - gesture.y) < CLICK_DISTANCE) return;
		if (gesture.kind === "pan") {
			this.view.tx += x - gesture.x;
			this.view.ty += y - gesture.y;
			gesture.x = x;
			gesture.y = y;
			gesture.moved = true;
			this.userMoved();
		} else if (sim) {
			if (!gesture.moved) {
				gesture.moved = true;
				sim.alphaTarget = 0.3;
				sim.reheat(0.3);
				this.userMoved();
			}
			const at = this.world(x, y);
			sim.pin(gesture.index, at.x, at.y);
			this.invalidate();
		}
	};

	private onPointerUp = (event: PointerEvent) => {
		const { gesture } = this;
		this.pointers.delete(event.pointerId);
		if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
		if (!gesture) return;
		if (gesture.kind === "pinch") {
			if (this.pointers.size < 2) this.gesture = undefined;
			return;
		}
		if (event.pointerId !== gesture.id) return;
		this.gesture = undefined;
		if (gesture.kind === "node") {
			if (gesture.moved) {
				this.sim?.release(gesture.index);
				if (this.sim) this.sim.alphaTarget = this.animation ? 0.1 : 0;
			} else if (event.type === "pointerup") {
				const id = this.graph.nodes[gesture.index].id;
				this.choose(id === this.selectedId ? undefined : id, gesture.index);
			}
			if (event.pointerType !== "mouse") this.setHovered(-1);
		} else if (!gesture.moved && event.type === "pointerup") {
			this.choose(undefined, -1);
		}
		this.canvas.style.cursor = this.hovered >= 0 ? "pointer" : "grab";
		this.invalidate();
	};

	private choose(id: string | undefined, index: number) {
		this.selectedId = id;
		this.selected = id === undefined ? -1 : index;
		this.computeNear();
		this.events.select(id);
	}

	private onPointerLeave = (event: PointerEvent) => {
		if (!this.gesture && event.pointerType === "mouse") this.setHovered(-1);
	};

	private onWheel = (event: WheelEvent) => {
		event.preventDefault();
		const { x, y } = this.point(event);
		const lines = event.deltaMode === 1 ? 16 : 1;
		this.zoomAt(x, y, Math.exp(-event.deltaY * lines * (event.ctrlKey ? 0.01 : 0.0015)));
	};
}
