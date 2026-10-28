/**
 * Analyse de la jurisprudence, onglet « Chronologie » : les décisions par année, filtrables par thème, étiquette, note
 * et juridiction ; fusion de décisions en double (manuelle ou suggérée), création d'une fiche depuis une décision.
 */
import { Notice, getAllTags } from "obsidian";
import { FilePlus, Link2, Unlink } from "lucide-react";
import { CSSProperties, useLayoutEffect, useMemo, useRef, useState } from "react";
import { REFERENCES_EVENT } from "lib/events";
import { DecisionRecord, filterRecords, groupByYear, themeCounts } from "references/timeline";
import { manualMerges, suggestMerges, RESOLVED_ID } from "references/merge";
import { createFiche } from "references/insights";
import { chooseMain } from "views/MergeModal";
import { usePlugin } from "views/hooks";
import { DecisionInfo, DecisionRow, noteName } from "./Shared";

/** Frise chronologique des décisions, filtrable par thème, étiquette, note et juridiction. */
export const TimelineTab = ({ records }: { records: DecisionRecord[] }) => {
	const plugin = usePlugin();
	const [theme, setTheme] = useState("");
	const [note, setNote] = useState("");
	const [tag, setTag] = useState("");
	const [court, setCourt] = useState("");
	const [search, setSearch] = useState("");
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	/** Hauteur du bandeau collant : les années collent juste en dessous. */
	const barRef = useRef<HTMLDivElement>(null);
	const [barHeight, setBarHeight] = useState(0);
	useLayoutEffect(() => {
		const bar = barRef.current;
		if (!bar) return;
		const measure = () => setBarHeight(bar.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(bar);
		return () => observer.disconnect();
	}, []);

	/** Identifiants concernés par un rapprochement manuel (pour proposer de le défaire). */
	const manual = useMemo(() => new Set(plugin.references.manualMerges().flat()), [plugin, records]);

	/** Étiquette → notes qui la portent (parmi celles qui citent des décisions). */
	const tags = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const path of new Set(records.flatMap((r) => r.notes))) {
			const file = plugin.app.vault.getFileByPath(path);
			const cache = file && plugin.app.metadataCache.getFileCache(file);
			for (const t of (cache && getAllTags(cache)) ?? []) map.set(t, (map.get(t) ?? new Set()).add(path));
		}
		return map;
	}, [plugin, records]);

	const themes = useMemo(() => themeCounts(records), [records]);
	const notes = useMemo(() => [...new Set(records.flatMap((r) => r.notes))].sort(), [records]);
	const courts = useMemo(() => [...new Set(records.map((r) => r.court).filter((c): c is string => !!c))].sort(), [records]);
	const shown = useMemo(
		() => {
			const words = search.toLowerCase().split(/\s+/).filter(Boolean);
			return filterRecords(records, { theme: theme || undefined, note: note || undefined, notes: tag ? tags.get(tag) : undefined, court: court || undefined }).filter((r) => {
				const text = `${r.title ?? ""} ${r.label} ${r.number ?? ""}`.toLowerCase();
				return words.every((w) => text.includes(w));
			});
		},
		[records, theme, note, tag, court, tags, search]
	);
	const { years, undated } = useMemo(() => groupByYear(shown), [shown]);
	const noThemes = records.length > 0 && themes.length === 0;

	const toggle = (id: string) => setSelected((current) => {
		const next = new Set(current);
		if (!next.delete(id)) next.add(id);
		return next;
	});
	const stopSelecting = () => {
		setSelecting(false);
		setSelected(new Set());
	};

	/** Rapproche les décisions cochées en celle que l'utilisateur choisit de conserver. */
	const mergeRecords = async (chosen: DecisionRecord[]) => {
		if (chosen.length < 2) return false;
		const main = await chooseMain(plugin.app, chosen);
		if (!main) return false;
		const merges = chosen.filter((r) => r !== main).flatMap((r) => manualMerges(r.members ?? [r.id], main.id));
		plugin.references.mergeDecisions(merges);
		plugin.events.trigger(REFERENCES_EVENT);
		new Notice(`${chosen.length} entrées rapprochées en une décision.`);
		return true;
	};
	const merge = async () => {
		if (await mergeRecords(records.filter((r) => selected.has(r.id)))) stopSelecting();
	};

	/** Cas litigieux que les règles automatiques ne tranchent pas. */
	const suggestions = useMemo(() => suggestMerges(records, plugin.references.dismissedMerges()), [plugin, records]);
	const dismiss = ({ a, b }: { a: DecisionRecord; b: DecisionRecord }) => {
		plugin.references.dismissMerge(a.members ?? [a.id], b.members ?? [b.id]);
		plugin.events.trigger(REFERENCES_EVENT);
	};

	const unmerge = (record: DecisionRecord) => {
		plugin.references.unmergeDecisions(record.members ?? [record.id]);
		plugin.events.trigger(REFERENCES_EVENT);
		new Notice("Rapprochement défait (les rapprochements automatiques restent).");
	};

	const create = async (record: DecisionRecord) => {
		const file = await createFiche(plugin, record);
		if (file) new Notice(`Fiche créée : ${file.path}`);
	};

	/** Case de sélection, ou bouton pour défaire un rapprochement manuel. */
	const rowExtra = (record: DecisionRecord) => (
		<>
			{!selecting && (record.members ?? []).some((id) => manual.has(id)) && (
				<button className="clickable-icon" aria-label="Défaire le rapprochement manuel" onClick={() => unmerge(record)}>
					<Unlink size={16} />
				</button>
			)}
			{!selecting && !record.fichePath && RESOLVED_ID.test(record.id) && (
				<button className="clickable-icon" aria-label="Créer la fiche" onClick={() => void create(record)}>
					<FilePlus size={16} />
				</button>
			)}
			{selecting && <input type="checkbox" aria-label="Sélectionner" checked={selected.has(record.id)} onChange={() => toggle(record.id)} />}
		</>
	);

	return (
		<div style={{ "--legifrance-bar-height": `${barHeight}px` } as CSSProperties}>
			<div className="legifrance-filters">
				<select value={theme} onChange={(e) => setTheme(e.target.value)} className="dropdown" aria-label="Thème">
					<option value="">Tous les thèmes</option>
					{themes.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
				</select>
				<select value={tag} onChange={(e) => setTag(e.target.value)} className="dropdown" aria-label="Étiquette">
					<option value="">Toutes les étiquettes</option>
					{[...tags.keys()].sort().map((t) => <option key={t} value={t}>{t}</option>)}
				</select>
				<select value={note} onChange={(e) => setNote(e.target.value)} className="dropdown" aria-label="Note">
					<option value="">Toutes les notes</option>
					{notes.map((path) => <option key={path} value={path}>{noteName(path)}</option>)}
				</select>
				<select value={court} onChange={(e) => setCourt(e.target.value)} className="dropdown" aria-label="Juridiction">
					<option value="">Toutes les juridictions</option>
					{courts.map((c) => <option key={c} value={c}>{c}</option>)}
				</select>
				<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un nom ou un numéro" aria-label="Recherche" />
			</div>
			<div className="legifrance-timeline-bar" ref={barRef}>
				<p className="legifrance-count">
					{shown.length} décision{shown.length > 1 ? "s" : ""}
					{noThemes && " · les thèmes arrivent avec « Compléter les fiches de décisions » (Réglages → Général)."}
				</p>
				{selecting ? (
					<div className="legifrance-row-actions">
						<span className="legifrance-count">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
						<button className="mod-cta" disabled={selected.size < 2} onClick={() => void merge()}>Rapprocher</button>
						<button onClick={stopSelecting}>Annuler</button>
					</div>
				) : (
					<button onClick={() => setSelecting(true)}><Link2 size={14} /> Rapprocher des doublons</button>
				)}
			</div>

			{suggestions.length > 0 && (
				<details className="legifrance-suggestions">
					<summary>{suggestions.length} rapprochement{suggestions.length > 1 ? "s" : ""} suggéré{suggestions.length > 1 ? "s" : ""} (cas à trancher)</summary>
					{suggestions.map((suggestion) => (
						<div key={`${suggestion.a.id}|${suggestion.b.id}`} className="legifrance-suggestion">
							<div className="legifrance-suggestion-head">
								<span>{suggestion.reason}</span>
								<div className="legifrance-row-actions">
									<button className="mod-cta" onClick={() => void mergeRecords([suggestion.a, suggestion.b])}>Rapprocher</button>
									<button onClick={() => dismiss(suggestion)}>Ce sont deux décisions</button>
								</div>
							</div>
							<div className="legifrance-suggestion-pair">
								{[suggestion.a, suggestion.b].map((record) => (
									<div key={record.id}>
										<div className="legifrance-row-title">{record.name ?? record.title ?? record.label}</div>
										<DecisionInfo record={record} />
									</div>
								))}
							</div>
						</div>
					))}
				</details>
			)}

			{years.map(({ year, items }) => (
				<section key={year} className="legifrance-year">
					<h5 className="legifrance-year-label">{year}</h5>
					<div className="legifrance-year-items">
						{items.map((record) => <DecisionRow key={record.id} record={record} records={records} withRelated extra={rowExtra(record)} />)}
					</div>
				</section>
			))}
			{undated.length > 0 && (
				<section className="legifrance-year">
					<h5 className="legifrance-year-label">Sans date</h5>
					<div className="legifrance-year-items">
						{undated.map((record) => <DecisionRow key={record.id} record={record} records={records} withRelated extra={rowExtra(record)} />)}
					</div>
				</section>
			)}
		</div>
	);
};
