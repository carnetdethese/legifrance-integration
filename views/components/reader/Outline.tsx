import { useMemo, useState } from "react";
import { OutlineItem } from "lib/outline";
import { plain } from "references/dates";

/** Nombre de réponses du filtre affichées. */
const MAX_FOUND = 80;

/**
 * Plan du document : ses titres de section, un clic y mène. Les articles, trop nombreux pour figurer dans le plan, se
 * retrouvent avec le filtre (« 226-17 », « article 4 », un mot d'un titre).
 */
export const Outline = ({ items, onJump }: { items: OutlineItem[]; onJump: (id: string) => void }) => {
	const [filter, setFilter] = useState("");
	const shown = useMemo(() => {
		const words = plain(filter).split(/\s+/).filter(Boolean);
		if (words.length === 0) return items.filter((item) => !item.article);
		return items.filter((item) => words.every((word) => plain(item.text).includes(word))).slice(0, MAX_FOUND);
	}, [items, filter]);
	const base = Math.min(...items.filter((item) => !item.article).map((item) => item.level), 6);

	return (
		<nav className="legifrance-outline" aria-label="Plan du document">
			<input type="search" placeholder="Aller à… (article, titre)" value={filter} onChange={(event) => setFilter(event.target.value)} />
			{shown.length === 0 && <p className="legifrance-row-meta">Aucun titre ne correspond.</p>}
			{shown.map((item) => (
				<button key={item.id} className="legifrance-outline-item" style={{ paddingLeft: `calc(var(--size-4-2) + ${filter ? 0 : Math.max(0, item.level - base)} * var(--size-4-3))` }} onClick={() => onJump(item.id)}>
					{item.text}
				</button>
			))}
		</nav>
	);
};
