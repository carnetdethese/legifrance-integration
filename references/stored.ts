/**
 * Documents (décisions, articles, textes) que la base contient déjà, sous la forme que lit le lecteur
 * de l'ancienne partie du plugin (`LegalDocument`) : la recherche et la base se rejoignent ici.
 */
import type { LegalDocument } from "abstracts/document";
import { legifranceUrl } from "api/urls";
import type LegifrancePlugin from "main";
import { COURT_NAMES } from "./fiches";
import { CC_SITE, RGD_SITE } from "./ids";
import type { StoredDocument } from "./index";

/** Fond d'origine d'après l'identifiant ou l'adresse du document. */
function originOf(id: string) {
	if (id.startsWith("CETATEXT")) return "CETAT";
	if (id.startsWith("JURITEXT")) return "JURI";
	if (id.startsWith("CONSTEXT")) return "CONSTIT";
	if (id.startsWith(RGD_SITE)) return "RGD";
	if (id.startsWith(CC_SITE)) return "CONSTIT";
	if (id.startsWith("http")) return "ARIANE";
	return id.replace(/\d+$/, "").slice(0, 8);
}

/** Adresse d'un document : sa page Légifrance, ou l'adresse elle-même pour les autres sources. */
const urlOf = (id: string) => (id.startsWith("http") ? id : legifranceUrl(id));

/** Fiche d'un document consulté, au format de la table `documents`. */
export function documentRow(doc: LegalDocument): Omit<StoredDocument, "fetched_at"> {
	return {
		id: doc.id,
		origin: doc.origin ?? null,
		title: doc.titre,
		date: doc.date ?? null,
		number: doc.numero ?? null,
		court: doc.juridiction ?? null,
		formation: doc.formation ?? null,
		solution: doc.abstract ?? null,
		url: doc.lien || null,
		text_html: doc.texteIntegralHTML ?? null,
		text_markdown: doc.texteIntegral ?? null,
	};
}

function fromRow(id: string, row: StoredDocument): LegalDocument {
	return {
		fond: row.origin ?? originOf(id),
		origin: row.origin ?? originOf(id),
		id,
		titre: row.title,
		titreNote: row.title,
		texte: "",
		lien: row.url ?? urlOf(id),
		date: row.date ?? undefined,
		annee: row.date ? Number(row.date.slice(0, 4)) : undefined,
		numero: row.number ?? undefined,
		juridiction: row.court ?? undefined,
		formation: row.formation ?? undefined,
		abstract: row.solution ?? undefined,
		solution: row.solution ?? undefined,
		texteIntegralHTML: row.text_html ?? (row.text_markdown ? markdownToHtml(row.text_markdown) : undefined),
		texteIntegral: row.text_markdown ?? undefined,
	};
}

/** Paragraphes HTML d'un texte Markdown (articles des citations, conservés sans HTML). */
const markdownToHtml = (markdown: string) =>
	markdown
		.split(/\n{2,}/)
		.map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
		.join("");

/**
 * Document `id` tel que la base le connaît, ou `undefined` : décision dont le texte a été complété
 * (identifiant Légifrance, ou adresse pour ArianeWeb et la Revue générale du droit), document déjà
 * consulté par la recherche, article ou texte retrouvé pour une citation.
 */
export function storedLegalDocument(plugin: LegifrancePlugin, id: string): LegalDocument | undefined {
	const index = plugin.references;

	const decision = index.completeDecision(id);
	if (decision?.text_html || decision?.text_markdown) {
		const court = decision.court ? (COURT_NAMES as Record<string, string>)[decision.court] ?? decision.court : undefined;
		return fromRow(id, {
			id,
			origin: originOf(id),
			title: decision.title ?? id,
			date: decision.date,
			number: decision.number,
			court: court ?? null,
			formation: decision.formation,
			solution: decision.solution,
			url: urlOf(id),
			text_html: decision.text_html,
			text_markdown: decision.text_markdown,
			fetched_at: 0,
		});
	}

	const consulted = index.documentFor(id);
	if (consulted?.text_html || consulted?.text_markdown) return fromRow(id, consulted);

	// Article ou texte retrouvé pour une citation : seul son texte (Markdown) est conservé.
	const link = index.linkByDocumentId(id);
	if (link?.text) {
		return fromRow(id, {
			id,
			origin: originOf(id),
			title: link.title,
			date: null,
			number: null,
			court: null,
			formation: null,
			solution: null,
			url: link.url,
			text_html: null,
			text_markdown: link.text,
			fetched_at: 0,
		});
	}
	return undefined;
}
