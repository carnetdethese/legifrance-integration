import { ChevronDown, ChevronRight, RotateCcw, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { GRAPH_LIMITS, GRAPH_RANGES, GROUP_COLORS, GraphSettings } from "references/graph";
import { noteName } from "./Shared";

/** Interrupteur au rendu natif d'Obsidian (`checkbox-container`). */
const Toggle = ({ label, hint, value, disabled, onChange }: { label: string; hint?: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) => (
	<div className={`legifrance-graph-toggle ${disabled ? "is-disabled" : ""}`} title={hint}>
		<span className="legifrance-graph-control-name">{label}</span>
		<div className={`checkbox-container ${value ? "is-enabled" : ""}`} onClick={() => !disabled && onChange(!value)}>
			<input type="checkbox" tabIndex={0} checked={value} disabled={disabled} aria-label={label} readOnly />
		</div>
	</div>
);

/** Curseur : le nom, puis la valeur à gauche de la glissière (comme dans le graphe d'Obsidian). */
const Slider = ({ label, name, value, onChange }: { label: string; name: keyof typeof GRAPH_RANGES; value: number; onChange: (value: number) => void }) => {
	const { min, max, step } = GRAPH_RANGES[name];
	return (
		<div className="legifrance-graph-slider">
			<div className="legifrance-graph-control-name">{label}</div>
			<div className="legifrance-graph-slider-row">
				<span className="legifrance-graph-slider-value">{value.toFixed(step >= 1 ? 0 : 2)}</span>
				<input type="range" className="slider" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
			</div>
		</div>
	);
};

/** Rubrique repliable du panneau. */
const Section = ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => {
	const [open, setOpen] = useState(true);
	return (
		<section className="legifrance-graph-section">
			<div className="legifrance-graph-section-head">
				<button className="legifrance-graph-section-title" aria-expanded={open} onClick={() => setOpen(!open)}>
					{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
					{title}
				</button>
				{actions}
			</div>
			{open && <div className="legifrance-graph-section-body">{children}</div>}
		</section>
	);
};

export interface GraphControlsProps {
	settings: GraphSettings;
	onChange: (patch: Partial<GraphSettings>) => void;
	search: string;
	onSearch: (value: string) => void;
	theme: string;
	onTheme: (value: string) => void;
	themes: { label: string; n: number }[];
	note: string;
	onNote: (value: string) => void;
	notes: string[];
	animating: boolean;
	onAnimate: () => void;
	onReset: () => void;
	onClose: () => void;
}

/**
 * Panneau de réglages du graphe, avec les rubriques de celui d'Obsidian : Filtres, Groupes, Afficher, Forces. Les
 * filtres par thème et par note, et le nombre de décisions, sont ceux de la version précédente ; « Fiches
 * uniquement » tient la place de « Fichiers existants uniquement » (une décision sans fiche n'est que citée).
 */
export const GraphControls = ({ settings, onChange, search, onSearch, theme, onTheme, themes, note, onNote, notes, animating, onAnimate, onReset, onClose }: GraphControlsProps) => {
	const setGroup = (index: number, patch: Partial<GraphSettings["groups"][number]>) =>
		onChange({ groups: settings.groups.map((group, i) => (i === index ? { ...group, ...patch } : group)) });
	const addGroup = () => onChange({ groups: [...settings.groups, { query: "", color: GROUP_COLORS[settings.groups.length % GROUP_COLORS.length] }] });

	return (
		<div className="legifrance-graph-controls" role="group" aria-label="Réglages du graphe">
			<Section
				title="Filtres"
				actions={
					<span className="legifrance-graph-section-actions">
						<button className="clickable-icon" aria-label="Rétablir les réglages par défaut" title="Rétablir les réglages par défaut" onClick={onReset}>
							<RotateCcw size={16} />
						</button>
						<button className="clickable-icon" aria-label="Fermer les réglages" title="Fermer" onClick={onClose}>
							<X size={16} />
						</button>
					</span>
				}
			>
				<input type="search" className="legifrance-graph-search" placeholder="Rechercher dans le graphe…" value={search} spellCheck={false} onChange={(e) => onSearch(e.target.value)} />
				<select value={theme} onChange={(e) => onTheme(e.target.value)} className="dropdown" aria-label="Thème">
					<option value="">Tous les thèmes</option>
					{themes.map((t) => <option key={t.label} value={t.label}>{t.label} ({t.n})</option>)}
				</select>
				<select value={note} onChange={(e) => onNote(e.target.value)} className="dropdown" aria-label="Note">
					<option value="">Toutes les notes</option>
					{notes.map((path) => <option key={path} value={path}>{noteName(path)}</option>)}
				</select>
				<select value={settings.maxDecisions} onChange={(e) => onChange({ maxDecisions: Number(e.target.value) })} className="dropdown" aria-label="Décisions affichées" disabled={!!note}>
					{GRAPH_LIMITS.map((n) => <option key={n} value={n}>{n} décisions au plus</option>)}
				</select>
				<Toggle label="Notes" value={settings.showNotes} onChange={(showNotes) => onChange({ showNotes })} />
				<Toggle label="Articles" value={settings.showArticles} onChange={(showArticles) => onChange({ showArticles })} />
				<Toggle
					label="Articles écrits dans les notes"
					hint="Relie aussi chaque note aux articles qu'elle écrit, en plus de ceux que les décisions appliquent"
					value={settings.mentions}
					disabled={!settings.showArticles || !settings.showNotes}
					onChange={(mentions) => onChange({ mentions })}
				/>
				<Toggle label="Fiches uniquement" hint="Écarte les décisions qui ne sont que citées, sans fiche" value={settings.fichesOnly} onChange={(fichesOnly) => onChange({ fichesOnly })} />
				<Toggle label="Orphelins" hint="Montre les nœuds qui n'ont aucun lien dans ce graphe" value={settings.orphans} onChange={(orphans) => onChange({ orphans })} />
			</Section>

			<Section title="Groupes">
				{settings.groups.map((group, i) => (
					<div key={i} className="legifrance-graph-group">
						<input type="text" className="legifrance-graph-group-query" value={group.query} placeholder="type:note, theme:…, path:…" spellCheck={false} aria-label="Requête du groupe" onChange={(e) => setGroup(i, { query: e.target.value })} />
						<input type="color" className="legifrance-graph-group-color" value={group.color} aria-label="Couleur du groupe" onChange={(e) => setGroup(i, { color: e.target.value })} />
						<button className="clickable-icon" aria-label="Supprimer le groupe" onClick={() => onChange({ groups: settings.groups.filter((_, k) => k !== i) })}>
							<X size={16} />
						</button>
					</div>
				))}
				<button className="legifrance-graph-wide-button" onClick={addGroup}>Nouveau groupe</button>
				<p className="setting-item-description">
					Mots séparés par des espaces : <code>type:note</code>, <code>type:décision</code>, <code>type:article</code>, <code>theme:…</code>, <code>path:…</code> (chemin d'une note, ou d'une note qui cite la décision), ou un mot de l'intitulé. Le premier groupe qui convient donne sa couleur.
				</p>
			</Section>

			<Section title="Afficher">
				<Toggle label="Flèches" hint="Note → décision → article" value={settings.arrows} onChange={(arrows) => onChange({ arrows })} />
				<Slider label="Seuil de fondu du texte" name="textFade" value={settings.textFade} onChange={(textFade) => onChange({ textFade })} />
				<Slider label="Taille des nœuds" name="nodeSize" value={settings.nodeSize} onChange={(nodeSize) => onChange({ nodeSize })} />
				<Slider label="Épaisseur des liens" name="linkSize" value={settings.linkSize} onChange={(linkSize) => onChange({ linkSize })} />
				<div className="legifrance-graph-animate">
					<button onClick={onAnimate} title="Rejoue la constitution du graphe : les décisions paraissent par date, avec les notes et les articles qui leur sont liés">
						{animating ? "Arrêter" : "Animer"}
					</button>
				</div>
			</Section>

			<Section title="Forces">
				<Slider label="Force centrale" name="centerForce" value={settings.centerForce} onChange={(centerForce) => onChange({ centerForce })} />
				<Slider label="Force de répulsion" name="repelForce" value={settings.repelForce} onChange={(repelForce) => onChange({ repelForce })} />
				<Slider label="Force de liaison" name="linkForce" value={settings.linkForce} onChange={(linkForce) => onChange({ linkForce })} />
				<Slider label="Distance des liens" name="linkDistance" value={settings.linkDistance} onChange={(linkDistance) => onChange({ linkDistance })} />
			</Section>
		</div>
	);
};
