import { BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import { Notice, htmlToMarkdown } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_READ_ARTICLES, articleDocument, loadSectionText, loadToc, todayIso } from "abstracts/legislation";
import { Toc, TocArticle, TocNode, TocSection, ancestorsOf, articleSpan, articlesOf, filterToc, follow, pathToSection } from "abstracts/toc";
import { legifranceUrl } from "api/urls";
import { statusLabel } from "references/corpus";
import { usePlugin } from "views/hooks";

/**
 * Table des matières d'un code (ou d'un texte consolidé), que l'on parcourt de haut en bas : un clic sur une section
 * l'ouvre et montre ce qu'elle contient (sous-sections et articles), un fil d'Ariane ramène en arrière ; un clic sur un
 * article l'ouvre dans le lecteur. Le filtre cherche un numéro d'article (« 226-17 », « L. 121-6 ») ou un mot des
 * titres dans tout le texte. La date choisit la version du code (celle en vigueur ce jour-là).
 */
export const CodeToc = ({ textId, title, focus, section }: { textId: string; title?: string; focus?: string; section?: string }) => {
	const plugin = usePlugin();
	const [day, setDay] = useState(todayIso);
	const [loaded, setLoaded] = useState<{ toc?: Toc; error?: string }>({});
	const [filter, setFilter] = useState("");
	/** Sections ouvertes, de la première à la dernière (identifiants). */
	const [path, setPath] = useState<string[]>([]);
	const [reading, setReading] = useState<string>();
	const [composing, setComposing] = useState(false);
	const container = useRef<HTMLDivElement>(null);
	const scrolledTo = useRef<string>();

	useEffect(() => {
		let current = true;
		setLoaded({});
		if (!plugin.hasCredentials) {
			setLoaded({ error: "Renseignez vos identifiants PISTE dans les réglages du plugin." });
			return;
		}
		loadToc(plugin.api, textId, day)
			.then((toc) => current && setLoaded({ toc }))
			.catch((error) => current && setLoaded({ error: error instanceof Error ? error.message : String(error) }));
		return () => {
			current = false;
		};
	}, [textId, day]);

	const { toc } = loaded;
	// Un article demandé (depuis le lecteur, un résultat) : on ouvre sa section et on le met en vue.
	useEffect(() => {
		if (toc && focus) {
			scrolledTo.current = undefined;
			setFilter("");
			setPath(ancestorsOf(toc.root, focus).slice(1));
		}
	}, [toc, focus]);
	// Une section demandée (titre cliqué dans le lecteur) : on l'ouvre.
	useEffect(() => {
		if (toc && section && !focus) {
			setFilter("");
			setPath(pathToSection(toc.root, section) ?? []);
		}
	}, [toc, section, focus]);
	useEffect(() => {
		if (!toc || !focus || scrolledTo.current === focus) return;
		const element = Array.from(container.current?.querySelectorAll<HTMLElement>("[data-cid]") ?? []).find((el) => el.dataset.cid === focus);
		if (element) {
			scrolledTo.current = focus;
			element.scrollIntoView({ block: "center" });
		}
	});

	const filtered = useMemo(() => (toc && filter.trim() ? filterToc(toc.root, filter) : undefined), [toc, filter]);
	// Un chemin qui n'existe plus (autre date) ramène à la racine.
	const trail = toc ? follow(toc.root, path) ?? [] : [];
	const here: TocSection | undefined = trail[trail.length - 1] ?? toc?.root;

	/** Ouvre la section `id` (depuis le filtre, ou un nœud du fil d'Ariane). */
	function openSection(id: string) {
		if (!toc) return;
		setFilter("");
		setPath(pathToSection(toc.root, id) ?? []);
		container.current?.scrollIntoView({ block: "start" });
	}

	/** Tous les articles de la section ouverte (ou du texte entier à la racine) sur une même page. */
	async function readSection() {
		if (!toc || !here) return;
		const whole = here === toc.root;
		setComposing(true);
		try {
			const text = await loadSectionText(plugin.api, textId, whole ? undefined : here.id, day);
			await plugin.openComposedDocument({
				id: `${textId}:${whole ? "texte" : here.id}:${day}`,
				fond: "LEGI",
				origin: "LEGI",
				type: "document",
				titre: whole ? toc.title : `${toc.title} — ${text.title}`,
				texte: "",
				lien: legifranceUrl(textId, toc.nature),
				date: day,
				texteIntegralHTML: text.html,
				texteIntegral: htmlToMarkdown(text.html).trim(),
				titreNote: "",
			});
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		} finally {
			setComposing(false);
		}
	}

	async function read(article: TocArticle) {
		if (!toc) return;
		setReading(article.id);
		try {
			await plugin.readLegalDocument(articleDocument(toc.title, article));
		} finally {
			setReading(undefined);
		}
	}

	const name = toc?.title ?? title ?? "Texte";
	return (
		<div className="legifrance-toc" ref={container}>
			<div className="legifrance-toc-head">
				<h2>{name}</h2>
				<a className="clickable-icon" data-site="" href={legifranceUrl(textId, toc?.nature)} aria-label="Ouvrir sur Légifrance">
					<ExternalLink size={16} />
				</a>
			</div>
			<div className="legifrance-toc-bar">
				<input type="search" placeholder="Numéro d'article ou mot d'un titre…" value={filter} onChange={(event) => setFilter(event.target.value)} />
				<label className="legifrance-toc-date">
					Version du
					<input type="date" value={day} max={todayIso()} onChange={(event) => event.target.value && setDay(event.target.value)} />
				</label>
			</div>
			{!toc && !loaded.error && <p className="legifrance-empty">Chargement de la table des matières…</p>}
			{loaded.error && <p className="legifrance-empty">{loaded.error}</p>}
			{toc && here && !filtered && (
				<>
					<nav className="legifrance-toc-crumbs" aria-label="Fil d'Ariane">
						<a onClick={() => setPath([])}>{toc.title}</a>
						{trail.map((section, index) => (
							<span key={section.id}>
								<ChevronRight size={14} />
								{index < trail.length - 1 ? <a onClick={() => setPath(path.slice(0, index + 1))}>{section.title}</a> : <strong>{section.title}</strong>}
							</span>
						))}
					</nav>
					{here.children.length > 0 && (
						<div className="legifrance-toc-actions">
							<button disabled={composing || articlesOf(here).length > MAX_READ_ARTICLES} onClick={() => void readSection()}>
								<BookOpen size={16} />
								{composing ? " Chargement…" : ` Lire les ${articlesOf(here).length} articles sur une page`}
							</button>
							{articlesOf(here).length > MAX_READ_ARTICLES && <span className="legifrance-row-meta">Trop vaste : ouvrez un titre ou un chapitre.</span>}
						</div>
					)}
					<div className="legifrance-toc-list" role="list">
						{here.children.length === 0 && <p className="legifrance-empty">Cette section est vide.</p>}
						{here.children.map((node) => (
							<Row key={node.id} node={node} reading={reading} focus={focus} onSection={(section) => setPath([...path, section.id])} onArticle={(article) => void read(article)} />
						))}
					</div>
				</>
			)}
			{toc && filtered && (
				<>
					<p className="legifrance-row-meta">
						{filtered.count} article{filtered.count > 1 ? "s" : ""}
						{filtered.truncated ? " (début de la liste : précisez le filtre)" : ""}
					</p>
					{filtered.count === 0 && <p className="legifrance-empty">Aucun article ni titre ne correspond.</p>}
					<div className="legifrance-toc-list" role="list">
						{filtered.root.children.map((node) => (
							<Found key={node.id} node={node} depth={0} reading={reading} onSection={(section) => openSection(section.id)} onArticle={(article) => void read(article)} />
						))}
					</div>
				</>
			)}
		</div>
	);
};

interface RowProps {
	node: TocNode;
	reading?: string;
	focus?: string;
	onSection: (section: TocSection) => void;
	onArticle: (article: TocArticle) => void;
}

/** Ligne d'une section (titre, nombre d'articles) ou d'un article (numéro, statut s'il n'est pas en vigueur). */
const Row = ({ node, reading, focus, onSection, onArticle }: RowProps) => {
	if (node.kind === "section") {
		const { count, range } = articleSpan(node);
		return (
			<button className="legifrance-toc-row is-section" onClick={() => onSection(node)}>
				<span className="legifrance-toc-label">
					{node.title}
					{range && <span className="legifrance-toc-range">{range}</span>}
				</span>
				<span className="legifrance-toc-count">{count} article{count > 1 ? "s" : ""}</span>
				<ChevronRight size={16} />
			</button>
		);
	}
	const inForce = !node.status || ["VIGUEUR", "VIGUEUR_DIFF"].includes(node.status);
	return (
		<button className={`legifrance-toc-row ${node.cid === focus ? "is-focus" : ""}`} data-cid={node.cid} disabled={reading === node.id} onClick={() => onArticle(node)}>
			<span className="legifrance-toc-label">Article {node.num || "—"}</span>
			{!inForce && <span className="legifrance-chip">{statusLabel(node.status)}</span>}
		</button>
	);
};

/** Résultat du filtre : les sections traversées (un clic les ouvre) et les articles trouvés, indentés. */
const Found = ({ node, depth, reading, onSection, onArticle }: Omit<RowProps, "focus"> & { depth: number }) => {
	if (node.kind === "article") return <Row node={node} reading={reading} onSection={onSection} onArticle={onArticle} />;
	return (
		<div className="legifrance-toc-found">
			<button className="legifrance-toc-heading" onClick={() => onSection(node)}>
				{node.title}
				{articleSpan(node).range && <span className="legifrance-toc-range">{articleSpan(node).range}</span>}
			</button>
			<div className="legifrance-toc-nested">
				{node.children.map((child) => (
					<Found key={child.id} node={child} depth={depth + 1} reading={reading} onSection={onSection} onArticle={onArticle} />
				))}
			</div>
		</div>
	);
};
