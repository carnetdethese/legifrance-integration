import { MutableRefObject, useEffect, useRef } from "react";
import { Graph, GraphSettings } from "references/graph";
import { usePlugin } from "views/hooks";
import { GraphRenderer } from "./graphRenderer";

interface GraphCanvasProps {
	graph: Graph;
	settings: GraphSettings;
	selected?: string;
	onSelect: (id: string | undefined) => void;
	onAnimating: (on: boolean) => void;
	/** Reçoit le dessin, pour les boutons de zoom et l'animation. */
	rendererRef: MutableRefObject<GraphRenderer | null>;
}

/** Le canvas du graphe : crée le dessin (`GraphRenderer`), lui transmet l'extrait, les réglages et la sélection. */
export const GraphCanvas = ({ graph, settings, selected, onSelect, onAnimating, rendererRef }: GraphCanvasProps) => {
	const plugin = usePlugin();
	const canvas = useRef<HTMLCanvasElement>(null);
	// Les rappels changent à chaque rendu : le dessin n'est pas recréé pour autant.
	const events = useRef({ onSelect, onAnimating });
	events.current = { onSelect, onAnimating };
	const initial = useRef(settings);

	useEffect(() => {
		const renderer = new GraphRenderer(canvas.current!, initial.current, {
			select: (id) => events.current.onSelect(id),
			animating: (on) => events.current.onAnimating(on),
		});
		rendererRef.current = renderer;
		const theme = plugin.app.workspace.on("css-change", () => renderer.refreshColors());
		return () => {
			plugin.app.workspace.offref(theme);
			renderer.destroy();
			rendererRef.current = null;
		};
	}, [plugin, rendererRef]);

	// Dans cet ordre : l'extrait d'abord (il garde les positions des nœuds déjà là), puis les réglages, puis la sélection.
	useEffect(() => rendererRef.current?.setGraph(graph), [graph, rendererRef]);
	useEffect(() => rendererRef.current?.setSettings(settings), [settings, rendererRef]);
	useEffect(() => rendererRef.current?.setSelected(selected), [selected, rendererRef]);

	return <canvas ref={canvas} className="legifrance-graph-surface" role="img" aria-label="Graphe des citations entre notes, décisions et articles" />;
};
