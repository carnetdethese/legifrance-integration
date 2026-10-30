/**
 * Aperçu au survol, dans une note, d'un lien Légifrance ou d'une référence juridique repérée dans le texte : type, titre et
 * début du texte, lus dans la base (aucune requête). Le contenu est posé comme du texte, jamais comme du HTML.
 */
import { legifranceTarget, stripLinks } from "lib/links";
import { longDate } from "lib/display";
import { removeTags } from "lib/tools";
import type LegifrancePlugin from "main";
import { decisionKey, legifranceIdOf } from "references/ids";
import type { LegalRef } from "references/parser";
import { recallRef } from "references/refRegistry";
import { statusLabel } from "references/corpus";
import { storedLegalDocument } from "references/stored";
import { kindOf } from "./components/reader/InfoCard";

/** Où l'aperçu s'applique : le texte des notes (lecture, éditeur) et leurs propriétés, pas les panneaux du plugin. */
const NOTE_AREAS = ".markdown-preview-view, .cm-editor, .metadata-container";
const HOVERED = `a[href], .legifrance-cite`;
const DELAY_MS = 400;
const EXCERPT_LENGTH = 520;

/** Ce que la carte montre. */
interface Info {
	kind: string;
	title: string;
	meta?: string;
	excerpt?: string;
	hint: string;
}

const REF_KINDS: Record<LegalRef["kind"], string> = { decision: "Décision", texte: "Texte", article: "Article", eu: "Droit de l'Union", identifiant: "Document" };

export class LinkPreview {
	private card?: HTMLElement;
	private timer?: number;
	private anchor?: Element;

	constructor(private plugin: LegifrancePlugin) {}

	register() {
		const { plugin } = this;
		plugin.registerDomEvent(document, "mouseover", (event) => this.over(event));
		plugin.registerDomEvent(document, "mouseout", (event) => this.out(event));
		plugin.registerDomEvent(document, "mousedown", () => this.hide(), true);
		plugin.registerDomEvent(document, "keydown", () => this.hide(), true);
		plugin.registerDomEvent(document, "scroll", () => this.hide(), true);
		plugin.register(() => this.hide());
	}

	private hoveredIn(event: Event) {
		const element = (event.target as Element | null)?.closest?.(HOVERED);
		return element && element.closest(NOTE_AREAS) ? element : undefined;
	}

	/** Ce que la base sait de l'élément survolé : un lien Légifrance (le document), ou une référence repérée (sa fiche). */
	private infoFor(element: Element): Info | undefined {
		if (element.classList.contains("legifrance-cite")) {
			const ref = recallRef((element as HTMLElement).dataset.lfKey);
			return ref && this.refInfo(ref);
		}
		const target = legifranceTarget(element.getAttribute("href") ?? "");
		if (!target || target.sectionId) return undefined;
		const doc = storedLegalDocument(this.plugin, target.id);
		if (!doc) return undefined;
		return {
			kind: kindOf(doc),
			title: removeTags(doc.titre),
			meta: [doc.juridiction, longDate(doc.date), doc.numero && `n° ${doc.numero}`].filter(Boolean).join(" · "),
			excerpt: doc.texteIntegral,
			hint: "Cliquer pour ouvrir dans le lecteur",
		};
	}

	private refInfo(ref: LegalRef): Info {
		const link = this.plugin.references.linkFor(ref);
		const id = link && (decisionKey(link.url) ?? legifranceIdOf(link.url));
		const doc = id ? storedLegalDocument(this.plugin, id) : undefined;
		const status = link?.statut && !["VIGUEUR", "VIGUEUR_DIFF"].includes(link.statut) ? statusLabel(link.statut) : "";
		return {
			kind: REF_KINDS[ref.kind],
			title: doc ? removeTags(doc.titre) : link?.titre ? removeTags(link.titre) : ref.label,
			meta: doc
				? [doc.juridiction, longDate(doc.date), doc.numero && `n° ${doc.numero}`, status].filter(Boolean).join(" · ")
				: status,
			excerpt: doc?.texteIntegral ?? link?.texte,
			hint: link ? "Cmd/Ctrl + clic : ouvrir dans le lecteur" : "Pas encore retrouvée sur Légifrance (réglages : « Compléter »)",
		};
	}

	private over(event: MouseEvent) {
		const element = this.hoveredIn(event);
		if (!element || element === this.anchor) return;
		const isRef = element.classList.contains("legifrance-cite");
		if (!(isRef ? this.plugin.settings.markReferences : this.plugin.settings.linkPreview)) return;
		this.hide();
		this.anchor = element;
		this.timer = window.setTimeout(() => this.show(element), DELAY_MS);
	}

	private out(event: MouseEvent) {
		const element = this.hoveredIn(event);
		if (element && element === this.anchor && !element.contains(event.relatedTarget as Node | null)) this.hide();
	}

	private show(element: Element) {
		const info = this.infoFor(element);
		if (!info) return;
		const excerpt = stripLinks(info.excerpt ?? "").replace(/\s+/g, " ").trim();

		const card = document.body.createDiv({ cls: "legifrance-hover-card" });
		card.createDiv({ cls: "legifrance-hover-kind", text: info.kind });
		card.createDiv({ cls: "legifrance-hover-title", text: info.title });
		if (info.meta) card.createDiv({ cls: "legifrance-hover-meta", text: info.meta });
		if (excerpt) card.createDiv({ cls: "legifrance-hover-excerpt", text: excerpt.length > EXCERPT_LENGTH ? `${excerpt.slice(0, EXCERPT_LENGTH).trimEnd()}…` : excerpt });
		card.createDiv({ cls: "legifrance-hover-hint", text: info.hint });
		this.card = card;

		// Sous l'élément, ou au-dessus s'il n'y a pas la place ; jamais hors de la fenêtre.
		const rect = element.getBoundingClientRect();
		const { width, height } = card.getBoundingClientRect();
		const below = rect.bottom + 8 + height <= window.innerHeight;
		card.style.top = `${Math.max(8, below ? rect.bottom + 8 : rect.top - 8 - height)}px`;
		card.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
	}

	hide() {
		window.clearTimeout(this.timer);
		this.card?.remove();
		this.card = undefined;
		this.anchor = undefined;
	}
}
