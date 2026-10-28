import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { SearchScope, SearchHit, searchTexts } from "references/textSearch";
import { statusLabel } from "references/corpus";
import { usePlugin } from "views/hooks";
import { Card, Row } from "./Shared";

/** Nombre de résultats ajoutés par « Afficher la suite ». */
const PAGE_SIZE = 30;

const SCOPES: [SearchScope, string][] = [
	["all", "Tous les textes"],
	["decisions", "Décisions"],
	["articles", "Articles et textes"],
	["documents", "Documents consultés"],
];

const KINDS: Record<SearchHit["kind"], string> = { decision: "Décision", article: "Article ou texte", document: "Document consulté" };

/**
 * Recherche dans le texte des décisions, des articles et des documents que la base contient (rien n'est
 * demandé à l'API). Sans casse ni accents ; tous les mots doivent figurer, une expression se met entre guillemets.
 */
export const SearchTab = () => {
	const plugin = usePlugin();
	const [input, setInput] = useState("");
	const [query, setQuery] = useState("");
	const [scope, setScope] = useState<SearchScope>("all");
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<ReturnType<typeof searchTexts>>();

	useEffect(() => {
		if (!query.trim()) {
			setResult(undefined);
			return;
		}
		// La recherche parcourt tous les textes : on laisse d'abord s'afficher « Recherche… ».
		setBusy(true);
		const timer = window.setTimeout(() => {
			setResult(searchTexts(plugin.references, query, { scope, limit }));
			setBusy(false);
		}, 20);
		return () => window.clearTimeout(timer);
	}, [plugin, query, scope, limit]);

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		setLimit(PAGE_SIZE);
		setQuery(input);
	};

	return (
		<div>
			<form className="legifrance-search-bar" onSubmit={submit}>
				<input type="search" placeholder="Rechercher dans les textes… (« force publique » pour une expression)" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
				<select value={scope} onChange={(e) => { setScope(e.target.value as SearchScope); setLimit(PAGE_SIZE); }} className="dropdown" aria-label="Portée">
					{SCOPES.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
				</select>
				<button type="submit" className="mod-cta" disabled={busy}>{busy ? "Recherche…" : "Rechercher"}</button>
			</form>
			{!result && !busy && <p className="legifrance-empty">Cherche dans le texte intégral des décisions complétées, des articles retrouvés et des documents consultés. Aucune requête n'est envoyée à l'API.</p>}
			{result && (
				<Card title="Résultats" count={result.total} hint={result.total === 0 ? undefined : `Décisions les plus récentes d'abord, puis articles, puis documents.`}>
					{result.total === 0 && <p className="legifrance-empty">Aucun texte ne contient {result.terms.length > 1 ? "tous ces mots" : "ce mot"}.</p>}
					{result.hits.map((hit) => (
						<Row
							key={`${hit.kind}-${hit.id}`}
							title={<a onClick={() => void plugin.openStoredDocument(hit.id)}>{hit.title}</a>}
							meta={[KINDS[hit.kind], hit.date && hit.date.slice(0, 10), hit.kind === "article" && hit.detail ? statusLabel(hit.detail) : hit.detail].filter(Boolean).join(" · ")}
							actions={hit.url && <a className="clickable-icon" aria-label="Ouvrir sur Légifrance" href={hit.url}><ExternalLink size={16} /></a>}
						>
							{hit.snippets.map((parts, i) => (
								<div key={i} className="legifrance-snippet">
									{parts.map((part, j) => (part.hit ? <mark key={j}>{part.text}</mark> : <span key={j}>{part.text}</span>))}
								</div>
							))}
						</Row>
					))}
					{result.total > result.hits.length && <button onClick={() => setLimit(limit + PAGE_SIZE)}>Afficher la suite ({result.total - result.hits.length})</button>}
				</Card>
			)}
		</div>
	);
};
