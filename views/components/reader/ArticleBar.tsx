import { ArrowLeft, ArrowRight, ChevronRight, Library } from "lucide-react";
import { Notice, WorkspaceLeaf } from "obsidian";
import { useEffect, useState } from "react";
import { articleDocument, isArticleId, loadArticleContext, loadToc } from "abstracts/legislation";
import { ArticleContext } from "abstracts/toc";
import { statusLabel } from "references/corpus";
import { usePlugin } from "views/hooks";
import { period } from "../jurisprudence/ArticlesTab";

/**
 * Barre d'un article de code ou de texte consolidé : où il se trouve (code, chapitre), sa version (liste des
 * versions), l'article précédent et suivant du code, et l'accès à la table des matières. Elle se charge d'après le
 * contexte de l'article (`getArticle`, gardé en mémoire) ; sans identifiants, ou si l'article n'en a pas, elle
 * n'apparaît pas. Naviguer remplace l'article de l'onglet, sans rien ajouter à l'historique.
 */
export const ArticleBar = ({ id, leaf }: { id: string; leaf?: WorkspaceLeaf }) => {
	const plugin = usePlugin();
	const [context, setContext] = useState<ArticleContext | null>();
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let current = true;
		setContext(null);
		if (!isArticleId(id) || !plugin.hasCredentials) return;
		loadArticleContext(plugin.api, id)
			.then((loaded) => current && setContext(loaded))
			.catch(() => undefined);
		return () => {
			current = false;
		};
	}, [id]);

	if (!context) return null;
	const { textId, textTitle = "Texte", sections, versions } = context;

	const open = (article: { id: string; num: string }) => plugin.readLegalDocument(articleDocument(textTitle, article), { history: false, leaf });

	/** Article voisin dans le code (version en vigueur aujourd'hui), `-1` pour le précédent. */
	async function step(direction: 1 | -1) {
		if (!textId) return;
		setBusy(true);
		try {
			const { articles } = await loadToc(plugin.api, textId);
			const at = articles.findIndex((article) => article.cid === context?.cid || article.id === id);
			if (at < 0) new Notice("Cet article ne figure plus dans la version actuelle du texte.");
			else if (!articles[at + direction]) new Notice(direction > 0 ? "C'est le dernier article." : "C'est le premier article.");
			else await open(articles[at + direction]);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="legifrance-article-bar">
			<div className="legifrance-article-bar-path legifrance-toc-crumbs">
				{textId ? <a onClick={() => void plugin.openCode(textId, textTitle)}>{textTitle}</a> : <strong>{textTitle}</strong>}
				{/* Chaque titre ouvre la section correspondante dans la table des matières du code. */}
				{textId && sections.map((section) => (
					<span key={section.id}>
						<ChevronRight size={14} />
						<a onClick={() => void plugin.openCode(textId, textTitle, undefined, section.id)}>{section.title}</a>
					</span>
				))}
			</div>
			<div className="legifrance-article-bar-actions">
				{context.status && <span className="legifrance-chip">{statusLabel(context.status)}</span>}
				{versions.length > 1 && (
					<select className="dropdown" aria-label="Version de l'article" value={id} onChange={(event) => void open({ id: event.target.value, num: context.num ?? "" })}>
						{versions.map((version) => (
							<option key={version.id} value={version.id}>{period(version)} — {statusLabel(version.status)}</option>
						))}
					</select>
				)}
				{textId && (
					<>
						<button disabled={busy} aria-label="Article précédent" onClick={() => void step(-1)}><ArrowLeft size={16} /></button>
						<button disabled={busy} aria-label="Article suivant" onClick={() => void step(1)}><ArrowRight size={16} /></button>
						<button disabled={busy} onClick={() => void plugin.openCode(textId, textTitle, context.cid)}><Library size={16} /> Dans le code</button>
					</>
				)}
			</div>
		</div>
	);
};
