import { ChevronDown, ChevronRight } from "lucide-react";
import { ReactNode, useState } from "react";

const storageKey = (id: string) => `legifrance-section:${id}`;

/** État mémorisé d'une section (par navigateur) ; sans stockage disponible, la section est ouverte. */
function remembered(id: string, fallback: boolean) {
	try {
		const value = window.localStorage.getItem(storageKey(id));
		return value === null ? fallback : value === "1";
	} catch {
		return fallback;
	}
}

/** Rubrique repliable du panneau ; son état est conservé d'une note à l'autre. */
export const Section = ({ id, title, count, defaultOpen = true, children }: { id: string; title: string; count?: ReactNode; defaultOpen?: boolean; children?: ReactNode }) => {
	const [open, setOpen] = useState(() => remembered(id, defaultOpen));
	const toggle = () => {
		setOpen(!open);
		try {
			window.localStorage.setItem(storageKey(id), open ? "0" : "1");
		} catch {
			// Stockage indisponible : l'état n'est simplement pas conservé.
		}
	};

	return (
		<section className="legifrance-section">
			<div className="legifrance-section-head" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}>
				{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				<span className="legifrance-section-title">{title}</span>
				{count !== undefined && <span className="tree-item-flair">{count}</span>}
			</div>
			{open && <div className="legifrance-section-body">{children}</div>}
		</section>
	);
};
