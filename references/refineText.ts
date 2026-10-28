/**
 * Texte ou article non retrouvé, précisé par l'utilisateur : nouvelle recherche avec le numéro, la nature, la date
 * ou les mots du titre qu'il donne, ou lien direct vers la page Légifrance. Le lien trouvé est enregistré comme
 * s'il avait été retrouvé par l'API.
 */
import { Notice, htmlToMarkdown } from "obsidian";
import { legifranceUrl } from "api/urls";
import type LegifrancePlugin from "main";
import { OTHER_CHOICE_KEY, pickCandidate } from "views/CandidateModal";
import { RefinedText, refineText } from "views/RefineTextModal";
import { LegalRef } from "./parser";
import { legifranceIdOf, spokenDate } from "./ids";
import { enrichDecisions } from "./indexer";
import { isoOf, refineUnresolved } from "./refine";
import { field, findTextCandidates, resolveReference, searchQuery, SearchResponse } from "./resolver";
import type { DecisionCandidate } from "./sources";

/** Longueur maximale du texte d'un article conservé. */
const MAX_TEXT_LENGTH = 20000;

interface ArticleBody {
	etat?: string;
	texteHtml?: string;
	texte?: string;
}

/** Lien pour un identifiant donné par l'utilisateur ; pour un article, son texte et son statut sont relevés. */
async function linkFromId(plugin: LegifrancePlugin, ref: LegalRef, id: string) {
	const link = { url: legifranceUrl(id), titre: ref.label } as { url: string; titre: string; texte?: string; statut?: string };
	if (id.startsWith("LEGIARTI")) {
		try {
			const response = await plugin.api.consultArticle<{ article?: ArticleBody } & ArticleBody>(id);
			const article = response.article ?? response;
			const html = article.texteHtml ?? article.texte;
			if (html) link.texte = htmlToMarkdown(html).trim().slice(0, MAX_TEXT_LENGTH);
			link.statut = article.etat;
		} catch {
			// Le lien est enregistré sans texte : il pourra être complété plus tard.
		}
	}
	return link;
}

/** Textes dont le titre répond aux mots donnés (tous les fonds de textes, état actuel), à faire choisir. */
async function searchByKeywords(plugin: LegifrancePlugin, keywords: string): Promise<DecisionCandidate[]> {
	const query = searchQuery("LODA_ETAT", [field("ALL", keywords, "TOUS_LES_MOTS_DANS_UN_CHAMP")]);
	const response = await plugin.api.consult<SearchResponse>(query.path, query.body);
	const seen = new Set<string>();
	const candidates: DecisionCandidate[] = [];
	for (const result of response.results ?? []) {
		for (const title of result.titles ?? []) {
			const id = title.cid || title.id;
			if (!id || seen.has(id) || !title.title) continue;
			seen.add(id);
			candidates.push({ source: "legifrance", key: id, title: title.title, url: legifranceUrl(id) });
		}
	}
	return candidates;
}

/** Précisions déjà saisies, ou ce que la note dit du texte. */
function initialValues(plugin: LegifrancePlugin, ref: LegalRef): Partial<RefinedText> {
	const saved = plugin.references.precisionsFor(ref.key);
	return {
		nature: saved?.nature ?? ref.data.nature ?? "",
		number: saved?.number ?? ref.data.number ?? "",
		date: saved?.date ?? ref.data.date ?? "",
		keywords: saved?.keywords ?? "",
		link: saved?.link ?? "",
	};
}

/**
 * Demande à l'utilisateur ce qu'il sait du texte ou de l'article, le cherche, et enregistre le lien trouvé.
 * @returns `true` si un lien a été enregistré
 */
export async function refineLostText(plugin: LegifrancePlugin, ref: LegalRef, correcting = false): Promise<boolean> {
	const article = ref.kind === "article";
	const input = await refineText(plugin.app, ref.label, article, initialValues(plugin, ref));
	if (!input) return false;
	plugin.references.savePrecisions(ref.key, { ...input });

	// 1. Lien ou identifiant : aucune recherche.
	if (input.link.trim()) {
		const id = legifranceIdOf(input.link);
		if (!id) {
			new Notice("Lien non reconnu : attendu une page Légifrance ou un identifiant (LEGITEXT…, LEGIARTI…, JORFTEXT…).", 8000);
			return false;
		}
		plugin.references.setLink(ref, await linkFromId(plugin, ref, id), true);
		new Notice(`Lien enregistré : ${ref.label}`, 6000);
		return true;
	}

	if (!plugin.hasCredentials) {
		new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
		return false;
	}
	const notice = new Notice("Recherche…", 0);
	try {
		// 2. Numéro, nature, date : la recherche habituelle, avec ce que l'utilisateur corrige.
		const number = input.number.trim();
		const date = isoOf(input.date);
		if (number || date) {
			const data = article ? { ...ref.data, number: number || ref.data.number } : { ...ref.data, nature: input.nature || ref.data.nature || "loi", ...(number ? { number } : { date: spokenDate(date!) }) };
			const found = await resolveReference(plugin.api, { ...ref, data }, undefined, undefined, plugin.settings.ficheUseRgd);
			// Corriger un lien : retrouver le même document ne corrige rien, on ne l'enregistre pas.
			if (found && !(correcting && found.url === plugin.references.linkFor(ref)?.url)) {
				plugin.references.setLink(ref, found, true);
				new Notice(`Retrouvé : ${found.titre}`, 6000);
				return true;
			}
		}
		// 3. Mots du titre : plusieurs résultats possibles, l'utilisateur choisit.
		if (!article && input.keywords.trim()) {
			const candidates = await searchByKeywords(plugin, input.keywords.trim());
			if (candidates.length === 0) {
				new Notice("Aucun texte ne correspond à ces mots.", 8000);
				return false;
			}
			notice.hide();
			const chosen = candidates.length === 1 ? candidates[0] : await pickCandidate(plugin.app, candidates);
			if (!chosen) return false;
			plugin.references.setLink(ref, { url: chosen.url, titre: chosen.title }, true);
			new Notice(`Lien enregistré : ${chosen.title}`, 6000);
			return true;
		}
		new Notice(
			number || date
				? correcting
					? "La recherche redonne le même document : précisez autrement (autre numéro, mots du titre ou lien)."
					: "Toujours introuvable."
				: "Indiquez un numéro, une date, des mots du titre ou un lien.",
			8000
		);
		return false;
	} catch (error) {
		new Notice(`Recherche impossible : ${error instanceof Error ? error.message : String(error)}`, 8000);
		return false;
	} finally {
		notice.hide();
	}
}

/**
 * Texte cité par sa date (« le décret du 18 juillet 2025 ») : propose tous les textes qui conviennent. Un seul : il
 * est retenu ; plusieurs : l'utilisateur choisit (ou précise autrement) ; aucun : formulaire de précision.
 * @returns `true` si un lien a été enregistré
 */
export async function chooseText(plugin: LegifrancePlugin, ref: LegalRef, correcting = false): Promise<boolean> {
	if (!plugin.hasCredentials) {
		new Notice("Renseignez vos identifiants PISTE dans les réglages du plugin.");
		return false;
	}
	const noun = ref.kind === "decision" ? "décisions" : "textes";
	const current = plugin.references.linkFor(ref)?.url;
	const notice = new Notice(`Recherche des ${noun}…`, 0);
	let found: { url: string; titre: string }[];
	try {
		found = await findTextCandidates(plugin.api, ref);
	} catch (error) {
		new Notice(`Recherche impossible : ${error instanceof Error ? error.message : String(error)}`, 8000);
		return false;
	} finally {
		notice.hide();
	}
	if (found.length === 0) return ref.kind === "decision" ? refineUnresolved(plugin, ref, correcting) : refineLostText(plugin, ref, correcting);
	// Un seul résultat : retenu d'office, sauf pour corriger un lien (c'est peut-être justement le mauvais).
	if (found.length === 1 && !correcting) {
		await saveChoice(plugin, ref, found[0]);
		new Notice(`Retrouvé : ${found[0].titre}`, 6000);
		return true;
	}
	const candidates = found.map((f): DecisionCandidate => ({ source: "legifrance", key: f.url, title: f.url === current ? `${f.titre} (lien actuel)` : f.titre, url: f.url }));
	const chosen = await pickCandidate(plugin.app, candidates, {
		placeholder: correcting ? `Corriger « ${ref.label} » : choisissez la bonne réponse (${found.length})` : `${found.length} ${noun} correspondent à « ${ref.label} » : choisissez`,
		otherLabel: "Aucun de ceux-là : préciser autrement…",
	});
	if (!chosen) return false;
	if (chosen.key === OTHER_CHOICE_KEY) return ref.kind === "decision" ? refineUnresolved(plugin, ref, correcting) : refineLostText(plugin, ref, correcting);
	const title = found.find((f) => f.url === chosen.url)?.titre ?? chosen.title;
	await saveChoice(plugin, ref, { url: chosen.url, titre: title });
	new Notice(chosen.url === current ? "Lien conservé : la recherche automatique ne le remplacera plus." : `Lien enregistré : ${title}`, 6000);
	return true;
}

/** Enregistre le lien choisi ; pour une décision, sa fiche (métadonnées, texte) est complétée aussitôt. */
async function saveChoice(plugin: LegifrancePlugin, ref: LegalRef, link: { url: string; titre: string }) {
	plugin.references.setLink(ref, link, true);
	if (ref.kind !== "decision") return;
	plugin.references.saveDecision(ref.key, { status: "pending" });
	await enrichDecisions(plugin, () => undefined, { retryUnresolved: true, only: [ref] });
}

/**
 * Précise ou fait choisir une référence qu'aucun lien ne désigne, selon sa nature : décision (formulaire, puis
 * choix parmi les résultats), texte (choix parmi les textes de la date), article (formulaire).
 * @returns `true` si un lien a été enregistré
 */
export function preciseReference(plugin: LegifrancePlugin, ref: LegalRef): Promise<boolean> {
	// Avec un lien déjà enregistré, on corrige : rien n'est retenu d'office, l'utilisateur choisit toujours.
	const correcting = !!plugin.references.linkFor(ref);
	switch (ref.kind) {
		case "decision":
			// Le Conseil constitutionnel cité par sa seule date : toutes les décisions de ce jour sont proposées.
			return ref.data.court === "cc" && !ref.data.number && !ref.data.name ? chooseText(plugin, ref, correcting) : refineUnresolved(plugin, ref, correcting);
		case "texte":
			// Sans lien, un texte cité par son numéro n'a pas de choix à proposer : le formulaire suffit.
			return ref.data.number && !correcting ? refineLostText(plugin, ref) : chooseText(plugin, ref, correcting);
		case "article":
			return refineLostText(plugin, ref, correcting);
		default:
			return Promise.resolve(false);
	}
}
