import { Maximize2, Settings, X, ZoomIn, ZoomOut } from "lucide-react";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadGraphInput } from "references/corpus";
import { DEFAULT_GRAPH_SETTINGS, Graph, GraphInput, GraphNode, GraphSettings, buildGraph, isolatedNotes, nodeGroup, pivotDecisions } from "references/graph";
import { themeKey } from "references/themes";
import { DecisionRecord } from "references/timeline";
import { usePlugin } from "views/hooks";
import { GraphCanvas } from "./GraphCanvas";
import { GraphControls } from "./GraphControls";
import { GraphRenderer } from "./graphRenderer";
import { Card, DecisionRow, noteName, useOpenNote } from "./Shared";

/** Graphe des citations : notes, décisions et articles reliés. */
export const GraphTab = ({ records }: { records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const input = useMemo(() => loadGraphInput(plugin.references, records), [plugin, records]);
	return <GraphExplorer input={input} records={records} />;
};

const KIND_TITLES = { note: "Note", article: "Article", decision: "Décision" };

/**
 * Le graphe et ses réglages. Un extrait seulement (les décisions les plus liées par défaut), filtrable par texte, par
 * thème ou par note ; dessiné comme le graphe d'Obsidian (voir `graphRenderer.ts`) et réglé de la même façon (voir
 * `GraphControls.tsx`). Une décision pâle n'est que citée, une pleine a une fiche ; une note creuse ne partage rien
 * avec les autres notes.
 */
export const GraphExplorer = ({ input, records }: { input: GraphInput; records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const openNote = useOpenNote();

	const [settings, setSettings] = useState<GraphSettings>(() => plugin.graphSettings);
	const [search, setSearch] = useState("");
	const [theme, setTheme] = useState("");
	const [note, setNote] = useState("");
	const [selected, setSelected] = useState<string>();
	const [controls, setControls] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	// Les réglages s'ouvrent d'eux-mêmes quand le graphe est assez large pour rester lisible à côté.
	useLayoutEffect(() => {
		if ((box.current?.clientWidth ?? 0) >= 720) setControls(true);
	}, []);
	const [animating, setAnimating] = useState(false);
	const renderer = useRef<GraphRenderer | null>(null);
	const deferredSearch = useDeferredValue(search);

	const change = (patch: Partial<GraphSettings>) => setSettings((previous) => ({ ...previous, ...patch }));
	useEffect(() => {
		if (settings !== plugin.graphSettings) plugin.setGraphSettings(settings);
	}, [plugin, settings]);
	const reset = () => {
		setSettings({ ...DEFAULT_GRAPH_SETTINGS, groups: DEFAULT_GRAPH_SETTINGS.groups.map((g) => ({ ...g })) });
		setSearch("");
		setTheme("");
		setNote("");
	};

	const themes = useMemo(() => {
		const counts = new Map<string, { label: string; n: number }>();
		for (const d of input.decisions) for (const t of d.themes) counts.set(themeKey(t), { label: t, n: (counts.get(themeKey(t))?.n ?? 0) + 1 });
		return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
	}, [input]);
	const notes = useMemo(() => [...new Set(input.decisions.flatMap((d) => d.notes))].sort((a, b) => noteName(a).localeCompare(noteName(b))), [input]);
	const pivots = useMemo(() => pivotDecisions(input), [input]);
	const isolated = useMemo(() => isolatedNotes(input), [input]);

	const { maxDecisions, showNotes, showArticles, mentions, fichesOnly, orphans } = settings;
	const graph: Graph = useMemo(
		() =>
			buildGraph(input, {
				theme: theme || undefined,
				note: note || undefined,
				search: deferredSearch,
				maxDecisions,
				maxArticles: Math.max(40, Math.round(maxDecisions / 2)),
				maxNotes: Math.max(120, maxDecisions),
				showNotes,
				showArticles,
				mentions,
				fichesOnly,
				orphans,
			}),
		[input, theme, note, deferredSearch, maxDecisions, showNotes, showArticles, mentions, fichesOnly, orphans]
	);
	const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

	/** Montre un nœud même s'il est hors de l'extrait : les filtres sont retirés et la limite relevée. */
	function focus(id: string) {
		if (!byId.has(id)) {
			setSearch("");
			setTheme("");
			setNote("");
			change({ maxDecisions: 600, fichesOnly: false, showNotes: true, showArticles: true });
		}
		setSelected(id);
	}

	const shown = graph.nodes.filter((n) => n.kind === "decision").length;
	const chosen = selected ? byId.get(selected) : undefined;
	const record = chosen?.kind === "decision" ? records.find((r) => r.id === chosen.ref) : undefined;

	const selection = chosen ? (
		<Card title={KIND_TITLES[chosen.kind]}>
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
	) : null;

	if (input.decisions.every((d) => d.notes.length === 0) && input.noteArticles.length === 0) {
		return (
			<Card title="Graphe des citations">
				<p className="legifrance-empty">Aucune citation à représenter : indexez le coffre (Base de données → Cycle de la donnée) puis complétez les décisions.</p>
			</Card>
		);
	}

	return (
		<div className="legifrance-graph">
			<p className="legifrance-count">
				{shown} décision{shown > 1 ? "s" : ""} sur {graph.available.decisions} · {graph.nodes.filter((n) => n.kind === "article").length} article(s) · {graph.nodes.filter((n) => n.kind === "note").length} note(s)
			</p>
			<div className="legifrance-graph-body">
				<div className="legifrance-graph-canvas" ref={box}>
					<GraphCanvas graph={graph} settings={settings} selected={selected} onSelect={setSelected} onAnimating={setAnimating} rendererRef={renderer} />
					{graph.nodes.length === 0 && <p className="legifrance-empty legifrance-graph-nothing">Rien à montrer avec ces filtres.</p>}
					<div className="legifrance-graph-buttons">
						<button className={`clickable-icon ${controls ? "is-active" : ""}`} aria-label="Réglages du graphe" aria-expanded={controls} onClick={() => setControls(!controls)}>
							<Settings size={18} />
						</button>
						<button className="clickable-icon" aria-label="Agrandir" onClick={() => renderer.current?.zoomBy(1.4)}>
							<ZoomIn size={18} />
						</button>
						<button className="clickable-icon" aria-label="Réduire" onClick={() => renderer.current?.zoomBy(1 / 1.4)}>
							<ZoomOut size={18} />
						</button>
						<button className="clickable-icon" aria-label="Recentrer" onClick={() => renderer.current?.fit()}>
							<Maximize2 size={18} />
						</button>
					</div>
					{selection && (
						<div className="legifrance-graph-selection">
							<button className="clickable-icon legifrance-graph-selection-close" aria-label="Fermer" onClick={() => setSelected(undefined)}>
								<X size={16} />
							</button>
							{selection}
						</div>
					)}
					{controls && (
						<GraphControls
							settings={settings}
							onChange={change}
							search={search}
							onSearch={setSearch}
							theme={theme}
							onTheme={setTheme}
							themes={themes}
							note={note}
							onNote={setNote}
							notes={notes}
							animating={animating}
							onAnimate={() => (animating ? renderer.current?.stopAnimation() : renderer.current?.animate())}
							onReset={reset}
							onClose={() => setControls(false)}
						/>
					)}
				</div>

				<div className="legifrance-graph-side">
					{selection ? <div className="legifrance-graph-selected">{selection}</div> : (
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
						<Legend settings={settings} />
					</Card>
				</div>
			</div>
		</div>
	);
};

/** Un exemplaire de chaque espèce de nœud, pour retrouver la couleur du groupe qui l'habille. */
const SAMPLES: GraphNode[] = (["note", "decision", "article"] as const).map((kind) => ({ id: kind, kind, label: kind, ref: kind, degree: 1, x: 0, y: 0, themes: [], paths: [] }));

const Legend = ({ settings }: { settings: GraphSettings }) => {
	const grey = SAMPLES.some((sample) => nodeGroup(sample, settings.groups) < 0);
	return (
		<>
			<ul className="legifrance-graph-legend">
				{settings.groups.filter((g) => g.query.trim()).map((g, i) => (
					<li key={i}><span className="legifrance-key" style={{ background: g.color }} /> {g.query}</li>
				))}
				{grey && <li><span className="legifrance-key legifrance-key-plain" /> autres nœuds</li>}
				<li><span className="legifrance-key legifrance-key-faded" /> décision citée seulement (sans fiche)</li>
				<li><span className="legifrance-key legifrance-key-hollow" /> note isolée</li>
			</ul>
			<p className="setting-item-description">Gros nœud : très lié. Molette ou deux doigts pour zoomer, glisser le fond pour se déplacer, glisser un nœud pour le déplacer.</p>
		</>
	);
};
