import { useEffect, useMemo, useRef, useState } from "react";
import { loadGraphInput } from "references/corpus";
import { Graph, GraphNode, buildGraph, isolatedNotes, layoutGraph, neighbors, pivotDecisions } from "references/graph";
import { themeKey } from "references/themes";
import { DecisionRecord } from "references/timeline";
import { usePlugin } from "views/hooks";
import { Card, DecisionRow, noteName, useOpenNote } from "./Shared";

const WIDTH = 1000;
const HEIGHT = 700;
/** Nombres de décisions proposés : le graphe devient vite illisible au-delà de quelques centaines de nœuds. */
const LIMITS = [20, 40, 80, 150, 300];

interface View {
	x: number;
	y: number;
	w: number;
	h: number;
}
const FULL: View = { x: 0, y: 0, w: WIDTH, h: HEIGHT };

/** Rayon d'un nœud : plus il est lié, plus il est gros. */
const radius = (node: GraphNode) => (node.kind === "decision" ? 7 : node.kind === "article" ? 5 : 4.5) + Math.min(node.degree, 12) * 0.7 + (node.pivot ? 3 : 0);

/**
 * Graphe des citations : notes, décisions et articles reliés. Un extrait seulement (les décisions les plus liées
 * par défaut), filtrable par thème ou par note. Une décision à contour vert a une fiche, à contour jaune elle n'est
 * que citée (mêmes couleurs que les pastilles) ; une note creuse ne partage rien avec les autres notes.
 */
export const GraphTab = ({ records }: { records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const openNote = useOpenNote();
	const input = useMemo(() => loadGraphInput(plugin.references, records), [plugin, records]);

	const [theme, setTheme] = useState("");
	const [note, setNote] = useState("");
	const [maxDecisions, setMaxDecisions] = useState(40);
	const [showNotes, setShowNotes] = useState(true);
	const [showArticles, setShowArticles] = useState(true);
	const [mentions, setMentions] = useState(false);
	const [selected, setSelected] = useState<string>();
	const [hovered, setHovered] = useState<string>();
	const [view, setView] = useState<View>(FULL);

	const themes = useMemo(() => {
		const counts = new Map<string, { label: string; n: number }>();
		for (const d of input.decisions) for (const t of d.themes) counts.set(themeKey(t), { label: t, n: (counts.get(themeKey(t))?.n ?? 0) + 1 });
		return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
	}, [input]);
	const notes = useMemo(() => [...new Set(input.decisions.flatMap((d) => d.notes))].sort((a, b) => noteName(a).localeCompare(noteName(b))), [input]);
	const pivots = useMemo(() => pivotDecisions(input), [input]);
	const isolated = useMemo(() => isolatedNotes(input), [input]);

	const graph: Graph = useMemo(() => {
		const built = buildGraph(input, { theme: theme || undefined, note: note || undefined, maxDecisions, showNotes, showArticles, mentions });
		layoutGraph(built.nodes, built.edges, { width: WIDTH, height: HEIGHT });
		return built;
	}, [input, theme, note, maxDecisions, showNotes, showArticles, mentions]);
	useEffect(() => setView(FULL), [graph]);

	const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
	const active = hovered ?? selected;
	const near = useMemo(() => (active ? neighbors(graph.edges, active) : undefined), [graph, active]);
	const zoom = WIDTH / view.w;

	// Molette : zoom autour du pointeur. Écouteur non passif, pour retenir le défilement de la page.
	const svg = useRef<SVGSVGElement>(null);
	useEffect(() => {
		const el = svg.current;
		if (!el) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const rect = el.getBoundingClientRect();
			const factor = event.deltaY < 0 ? 0.85 : 1 / 0.85;
			setView((v) => {
				const w = Math.min(WIDTH, Math.max(WIDTH / 8, v.w * factor));
				const h = (w * HEIGHT) / WIDTH;
				const px = (event.clientX - rect.left) / rect.width;
				const py = (event.clientY - rect.top) / rect.height;
				return { x: Math.min(Math.max(v.x + (v.w - w) * px, -200), WIDTH + 200 - w), y: Math.min(Math.max(v.y + (v.h - h) * py, -200), HEIGHT + 200 - h), w, h };
			});
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	// Glisser le fond pour déplacer la vue.
	const drag = useRef<{ x: number; y: number; moved: boolean }>();
	const onPointerDown = (event: React.PointerEvent) => {
		drag.current = { x: event.clientX, y: event.clientY, moved: false };
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event: React.PointerEvent) => {
		const start = drag.current;
		if (!start) return;
		const rect = (event.currentTarget as Element).getBoundingClientRect();
		const dx = ((event.clientX - start.x) * view.w) / rect.width;
		const dy = ((event.clientY - start.y) * view.h) / rect.height;
		if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 3) start.moved = true;
		if (!start.moved) return;
		drag.current = { x: event.clientX, y: event.clientY, moved: true };
		setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
	};
	const onPointerUp = () => {
		const moved = drag.current?.moved;
		drag.current = undefined;
		if (!moved) setSelected(undefined); // un clic sur le fond désélectionne
	};
	const zoomBy = (factor: number) => setView((v) => {
		const w = Math.min(WIDTH, Math.max(WIDTH / 8, v.w * factor));
		const h = (w * HEIGHT) / WIDTH;
		return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
	});

	/** Montre un nœud même s'il est hors de l'extrait : les filtres sont retirés et la limite relevée. */
	function focus(id: string) {
		if (!byId.has(id)) {
			setTheme("");
			setNote("");
			setMaxDecisions(300);
		}
		setSelected(id);
	}

	const shown = graph.nodes.filter((n) => n.kind === "decision").length;
	const labelled = (n: GraphNode) => n.id === active || near?.has(n.id) || n.pivot || n.degree >= 4 || zoom > 2.2;
	const chosen = selected ? byId.get(selected) : undefined;
	const record = chosen?.kind === "decision" ? records.find((r) => r.id === chosen.ref) : undefined;

	if (input.decisions.every((d) => d.notes.length === 0) && input.noteArticles.length === 0) {
		return (
			<Card title="Graphe des citations">
				<p className="legifrance-empty">Aucune citation à représenter : indexez le coffre (Base de données → Cycle de la donnée) puis complétez les décisions.</p>
			</Card>
		);
	}

	return (
		<div className="legifrance-graph">
			<div className="legifrance-filters">
				<select value={theme} onChange={(e) => setTheme(e.target.value)} className="dropdown" aria-label="Thème">
					<option value="">Tous les thèmes</option>
					{themes.map((t) => <option key={t.label} value={t.label}>{t.label} ({t.n})</option>)}
				</select>
				<select value={note} onChange={(e) => setNote(e.target.value)} className="dropdown" aria-label="Note">
					<option value="">Toutes les notes</option>
					{notes.map((path) => <option key={path} value={path}>{noteName(path)}</option>)}
				</select>
				<select value={maxDecisions} onChange={(e) => setMaxDecisions(Number(e.target.value))} className="dropdown" aria-label="Décisions affichées" disabled={!!note}>
					{LIMITS.map((n) => <option key={n} value={n}>{n} décisions au plus</option>)}
				</select>
			</div>
			<div className="legifrance-graph-options">
				<label><input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} /> Notes</label>
				<label><input type="checkbox" checked={showArticles} onChange={(e) => setShowArticles(e.target.checked)} /> Articles</label>
				<label title="Relie aussi chaque note aux articles qu'elle écrit, en plus de ceux que les décisions appliquent"><input type="checkbox" checked={mentions} onChange={(e) => setMentions(e.target.checked)} disabled={!showArticles || !showNotes} /> Articles écrits dans les notes</label>
				<span className="legifrance-count">
					{shown} décision{shown > 1 ? "s" : ""} sur {graph.available.decisions} · {graph.nodes.filter((n) => n.kind === "article").length} article(s) · {graph.nodes.filter((n) => n.kind === "note").length} note(s)
				</span>
			</div>

			<div className="legifrance-graph-body">
				<div className="legifrance-graph-canvas">
					{graph.nodes.length === 0 ? (
						<p className="legifrance-empty">Rien à montrer avec ces filtres.</p>
					) : (
						<svg
							ref={svg}
							role="img"
							aria-label="Graphe des citations entre notes, décisions et articles"
							viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
							onPointerDown={onPointerDown}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
						>
							<g>
								{graph.edges.map((edge, i) => {
									const s = byId.get(edge.source)!, t = byId.get(edge.target)!;
									const lit = active && (edge.source === active || edge.target === active);
									return <line key={i} className={`legifrance-edge legifrance-edge-${edge.kind} ${lit ? "is-lit" : active ? "is-dim" : ""}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} />;
								})}
							</g>
							<g>
								{graph.nodes.map((node) => {
									const dim = active && node.id !== active && !near?.has(node.id);
									const r = radius(node);
									return (
										<g
											key={node.id}
											className={`legifrance-node legifrance-node-${node.kind} ${node.fiche ? "has-fiche" : ""} ${node.isolated ? "is-isolated" : ""} ${dim ? "is-dim" : ""} ${node.id === selected ? "is-selected" : ""}`}
											transform={`translate(${node.x} ${node.y})`}
											onPointerDown={(e) => e.stopPropagation()}
											onClick={() => setSelected(node.id === selected ? undefined : node.id)}
											onPointerEnter={() => setHovered(node.id)}
											onPointerLeave={() => setHovered(undefined)}
										>
											<title>{node.label}</title>
											<circle r={r} />
											{labelled(node) && <text y={-r - 3} textAnchor="middle">{node.label.length > 32 ? `${node.label.slice(0, 31)}…` : node.label}</text>}
										</g>
									);
								})}
							</g>
						</svg>
					)}
					<div className="legifrance-graph-zoom">
						<button className="clickable-icon" aria-label="Agrandir" onClick={() => zoomBy(0.7)}>+</button>
						<button className="clickable-icon" aria-label="Réduire" onClick={() => zoomBy(1 / 0.7)}>−</button>
						<button className="clickable-icon" aria-label="Recentrer" onClick={() => setView(FULL)}>⌂</button>
					</div>
				</div>

				<div className="legifrance-graph-side">
					{chosen ? (
						<Card title={chosen.kind === "note" ? "Note" : chosen.kind === "article" ? "Article" : "Décision"}>
							{chosen.kind === "decision" && record && <DecisionRow record={record} records={records} withDate={false} />}
							{chosen.kind === "note" && (
								<div>
									<p><a onClick={() => openNote(chosen.ref)}>{noteName(chosen.ref)}</a></p>
									<p className="setting-item-description">{chosen.isolated ? "Isolée : ne partage aucune décision ni aucun article avec une autre note." : `${chosen.degree} lien${chosen.degree > 1 ? "s" : ""} dans ce graphe.`}</p>
								</div>
							)}
							{chosen.kind === "article" && (
								<div>
									<p>{chosen.label}</p>
									<p><a onClick={() => void plugin.activateJurisprudenceView({ tab: "articles", articleKey: chosen.ref })}>Voir les décisions qui l'appliquent</a></p>
								</div>
							)}
							{chosen.kind === "note" && <p><a onClick={() => { setNote(chosen.ref); setSelected(undefined); }}>Centrer le graphe sur cette note</a></p>}
						</Card>
					) : (
						<>
							<Card title="Décisions pivots" count={pivots.length} hint="Citées par plusieurs notes, les plus liées d'abord.">
								{pivots.length === 0 && <p className="legifrance-empty">Aucune décision n'est citée par plusieurs notes.</p>}
								{pivots.map((d) => <div key={d.id}><a onClick={() => focus(`decision:${d.id}`)}>{d.label}</a> <span className="legifrance-row-meta">{d.notes.length} notes</span></div>)}
							</Card>
							<Card title="Notes isolées" count={isolated.length} hint="Ce qu'elles citent n'est cité par aucune autre note.">
								{isolated.length === 0 && <p className="legifrance-empty">Aucune.</p>}
								{isolated.slice(0, 12).map((path) => <div key={path}><a onClick={() => openNote(path)}>{noteName(path)}</a></div>)}
								{isolated.length > 12 && <p className="legifrance-row-meta">… et {isolated.length - 12} autres.</p>}
							</Card>
						</>
					)}
					<Card title="Légende">
						<ul className="legifrance-graph-legend">
							<li><span className="legifrance-key legifrance-key-note" /> note (creuse : isolée)</li>
							<li><span className="legifrance-key legifrance-key-decision has-fiche" /> décision fichée</li>
							<li><span className="legifrance-key legifrance-key-decision" /> décision citée seulement</li>
							<li><span className="legifrance-key legifrance-key-article" /> article</li>
						</ul>
						<p className="setting-item-description">Gros nœud : très lié. Molette pour zoomer, glisser le fond pour se déplacer.</p>
					</Card>
				</div>
			</div>
		</div>
	);
};
