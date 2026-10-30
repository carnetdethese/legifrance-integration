import { ChevronDown, ChevronUp, X } from "lucide-react";
import { RefObject, useEffect, useRef, useState } from "react";
import { findInText } from "lib/display";

/** Surlignage du texte (CSS Custom Highlight API) : le texte, rendu par React, n'est jamais modifié. */
type HighlightRegistry = { set: (name: string, value: unknown) => void; delete: (name: string) => void };
const registry = (): HighlightRegistry | undefined => (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
const makeHighlight = (ranges: Range[]) => {
	const Highlight = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
	return Highlight ? new Highlight(...ranges) : undefined;
};

/** Passages de `root` qui contiennent `query` (un par occurrence, dans un même nœud de texte), dans l'ordre de lecture. */
function rangesOf(root: HTMLElement, query: string) {
	const ranges: Range[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		for (const { start, end } of findInText(node.textContent ?? "", query)) {
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, end);
			ranges.push(range);
		}
	}
	return ranges;
}

/**
 * Barre de recherche dans le texte du lecteur (Cmd/Ctrl + F) : surligne les occurrences, indique « 3 / 12 », passe de l'une à
 * l'autre (Entrée, Maj + Entrée, ou les flèches) et se ferme avec Échap. `focusTick` change à chaque demande : le champ reprend la main.
 */
export const FindBar = ({ root, focusTick, onClose }: { root: RefObject<HTMLElement>; focusTick: number; onClose: () => void }) => {
	const input = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [ranges, setRanges] = useState<Range[]>([]);
	const [current, setCurrent] = useState(0);

	useEffect(() => {
		input.current?.focus();
		input.current?.select();
	}, [focusTick]);

	useEffect(() => {
		const found = root.current && query.trim() ? rangesOf(root.current, query) : [];
		setRanges(found);
		setCurrent(0);
	}, [query, root]);

	useEffect(() => {
		const highlights = registry();
		if (!highlights) return;
		const all = makeHighlight(ranges);
		const active = ranges[current] && makeHighlight([ranges[current]]);
		if (all) highlights.set("legifrance-find", all);
		if (active) highlights.set("legifrance-find-current", active);
		ranges[current]?.startContainer.parentElement?.scrollIntoView({ block: "center" });
		return () => {
			highlights.delete("legifrance-find");
			highlights.delete("legifrance-find-current");
		};
	}, [ranges, current]);

	const step = (direction: 1 | -1) => ranges.length && setCurrent((current + direction + ranges.length) % ranges.length);

	return (
		<div className="legifrance-find" role="search">
			<input
				ref={input}
				type="search"
				placeholder="Rechercher dans le texte…"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") step(event.shiftKey ? -1 : 1);
					else if (event.key === "Escape") onClose();
				}}
			/>
			<span className="legifrance-find-count">{query.trim() ? (ranges.length ? `${current + 1} / ${ranges.length}` : "Aucun résultat") : ""}</span>
			<button className="clickable-icon" aria-label="Occurrence précédente" disabled={ranges.length === 0} onClick={() => step(-1)}>
				<ChevronUp size={16} />
			</button>
			<button className="clickable-icon" aria-label="Occurrence suivante" disabled={ranges.length === 0} onClick={() => step(1)}>
				<ChevronDown size={16} />
			</button>
			<button className="clickable-icon" aria-label="Fermer la recherche" onClick={onClose}>
				<X size={16} />
			</button>
		</div>
	);
};
