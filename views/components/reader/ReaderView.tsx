import parse from "html-react-parser";
import { ListTree, Search } from "lucide-react";
import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { LegalDocument } from "abstracts/document";
import { articleDocument, isArticleId, isTextId } from "abstracts/legislation";
import { absoluteLink } from "lib/links";
import { withOutline, worthAnOutline } from "lib/outline";
import { WorkspaceLeaf, sanitizeHTMLToDom } from "obsidian";
import { usePlugin } from "views/hooks";
import { ArticleBar } from "./ArticleBar";
import { FindBar } from "./FindBar";
import { InfoCard } from "./InfoCard";
import { Outline } from "./Outline";

interface ReaderViewProps {
	data: LegalDocument;
	/** Change à chaque Cmd/Ctrl + F dans l'onglet : ouvre la recherche dans le texte. */
	findRequest?: number;
	/** Onglet qui affiche le document : la navigation d'article en article le remplace. */
	leaf?: WorkspaceLeaf;
}

/**
 * HTML d'un document sans script, gestionnaire d'événement ni lien `javascript:` : le texte vient de sites tiers
 * (Revue générale du droit, ArianeWeb) et s'affiche dans l'application, qui n'est pas un navigateur cloisonné.
 */
const sanitized = (html: string) => {
	const holder = createDiv();
	holder.appendChild(sanitizeHTMLToDom(html));
	// Les renvois de Légifrance sont des liens relatifs (`/affichCodeArticle.do?…`) qui ne mènent nulle part ici.
	holder.querySelectorAll("a[href]").forEach((anchor) => anchor.setAttribute("href", absoluteLink(anchor.getAttribute("href") ?? "")));
	return holder.innerHTML;
};

/** Identifiant (`LEGIARTI…`, `LEGITEXT…`) que désigne un lien de Légifrance : ces renvois s'ouvrent dans le plugin. */
const targetOf = (href: string) => /\b(LEGIARTI|LEGITEXT)\d{12}\b/.exec(new URL(href, "https://www.legifrance.gouv.fr").pathname)?.[0];

/** Fiche d'information puis texte intégral d'un document, avec son plan s'il en a un. */
export const ReaderView = ({ data, leaf, findRequest = 0 }: ReaderViewProps) => {
	const plugin = usePlugin();
	const body = useRef<HTMLDivElement>(null);
	const outlined = useMemo(() => (data.texteIntegralHTML ? withOutline(sanitized(data.texteIntegralHTML)) : undefined), [data.texteIntegralHTML]);
	const hasOutline = !!outlined && worthAnOutline(outlined.items);
	const [showOutline, setShowOutline] = useState(() => window.innerWidth >= 900);
	const [finding, setFinding] = useState(false);
	const [focusTick, setFocusTick] = useState(0);

	useEffect(() => {
		if (!findRequest) return;
		setFinding(true);
		setFocusTick((tick) => tick + 1);
	}, [findRequest]);

	/** Un renvoi vers un article ou un texte consolidé s'ouvre ici ; les autres liens suivent leur chemin (navigateur). */
	function follow(event: MouseEvent<HTMLElement>) {
		const anchor = (event.target as HTMLElement).closest("a");
		const href = anchor?.getAttribute("href");
		if (!anchor || !href || href.startsWith("#")) return;
		let id: string | undefined;
		try {
			id = targetOf(href);
		} catch {
			return;
		}
		if (!id) return;
		event.preventDefault();
		if (isArticleId(id)) void plugin.readLegalDocument(articleDocument("", { id, num: "" }), { history: false, leaf });
		else if (isTextId(id)) void plugin.openCode(id);
	}

	function jump(id: string) {
		Array.from(body.current?.querySelectorAll<HTMLElement>("[id^='lf-h-']") ?? []).find((el) => el.id === id)?.scrollIntoView({ block: "start" });
	}

	return (
		<div className={`legifrance-reader ${hasOutline ? "has-outline" : ""}`} onClick={follow}>
			<InfoCard data={data} />
			{isArticleId(data.id) && <ArticleBar id={data.id} leaf={leaf} />}

			<h1>Texte intégral</h1>
			<div className="legifrance-reader-tools">
				<button aria-pressed={finding} onClick={() => (finding ? setFinding(false) : (setFinding(true), setFocusTick((tick) => tick + 1)))}>
					<Search size={16} /> Rechercher
				</button>
				{hasOutline && (
					<button aria-expanded={showOutline} onClick={() => setShowOutline(!showOutline)}>
						<ListTree size={16} /> Plan
					</button>
				)}
			</div>
			{finding && <FindBar root={body} focusTick={focusTick} onClose={() => setFinding(false)} />}
			<div className="legifrance-reader-body">
				{hasOutline && showOutline && <Outline items={outlined.items} onJump={jump} />}
				{/* Bloc à part : les paragraphes et liens du texte ne sont pas des éléments de la colonne flex du lecteur. */}
				<div className="legifrance-text" ref={body}>
					{outlined ? parse(outlined.html) : <p className="legifrance-empty">Aucun texte disponible.</p>}
				</div>
			</div>
		</div>
	);
};
