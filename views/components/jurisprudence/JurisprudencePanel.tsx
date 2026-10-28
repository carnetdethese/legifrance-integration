import { useEffect, useMemo, useState } from "react";
import { decisionsOf } from "references/insights";
import { useDatabaseVersion, usePlugin } from "views/hooks";
import { ArticlesTab } from "./ArticlesTab";
import { GraphTab } from "./GraphTab";
import { SearchTab } from "./SearchTab";
import { TimelineTab } from "./TimelineTab";

type Tab = "timeline" | "articles" | "graph" | "search";

/**
 * Analyse de la jurisprudence du coffre : articles, chronologie, graphe des citations, recherche dans les textes. Ce qui reste à faire est dans la vue
 * Base de données (bouton « À faire »), pour laisser la place aux analyses.
 * L'onglet des articles s'ouvre le premier : il lit la base par pages. Les décisions ne sont recensées
 * (toute la base est alors parcourue) que lorsqu'un onglet en a besoin.
 */
export const JurisprudencePanel = () => {
	const plugin = usePlugin();
	const version = useDatabaseVersion();
	const [tab, setTab] = useState<Tab>(plugin.jurisprudenceFocus?.tab ?? "articles");
	const [articleKey, setArticleKey] = useState(plugin.jurisprudenceFocus?.articleKey);

	// Un lien depuis une autre vue (article du panneau des références) peut demander un onglet précis.
	useEffect(() => {
		const focus = plugin.jurisprudenceFocus;
		if (!focus) return;
		setTab(focus.tab);
		setArticleKey(focus.articleKey);
		plugin.jurisprudenceFocus = undefined;
	}, [version]);

	// `decisionsOf` garde son dernier recensement : le rappeler ne coûte rien tant que rien n'a changé.
	const getRecords = () => decisionsOf(plugin);
	const records = useMemo(() => (tab === "timeline" || tab === "graph" ? decisionsOf(plugin) : undefined), [plugin, version, tab]);
	const stats: [number, string][] = records
		? [
				[records.length, "décisions"],
				[records.filter((r) => r.complete).length, "avec texte intégral"],
				[records.filter((r) => r.fichePath).length, "avec fiche"],
			]
		: [];
	const tabs: [Tab, string][] = [
		["articles", "Articles"],
		["timeline", "Chronologie"],
		["graph", "Graphe"],
		["search", "Recherche"],
	];

	return (
		<div className="legifrance-juris">
			{stats.length > 0 && (
				<div className="legifrance-stats">
					{stats.map(([value, label]) => (
						<div key={label} className="legifrance-stat">
							<div className="legifrance-stat-value">{value.toLocaleString("fr-FR")}</div>
							<div className="legifrance-stat-label">{label}</div>
						</div>
					))}
				</div>
			)}
			<div className="legifrance-tabs" role="tablist">
				{tabs.map(([id, title]) => (
					<button key={id} role="tab" aria-selected={id === tab} className={`legifrance-tab ${id === tab ? "is-active" : ""}`} onClick={() => setTab(id)}>
						{title}
					</button>
				))}
				<button className="legifrance-tabs-aside" onClick={() => void plugin.activateDatabaseView("todo")}>À faire →</button>
			</div>
			<div className="legifrance-juris-body">
				{tab === "timeline" && records && <TimelineTab records={records} />}
				{tab === "graph" && records && <GraphTab records={records} />}
				{tab === "search" && <SearchTab />}
				{tab === "articles" && <ArticlesTab getRecords={getRecords} version={version} focus={articleKey} />}
			</div>
		</div>
	);
};
