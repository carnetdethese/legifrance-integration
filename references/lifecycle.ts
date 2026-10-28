/**
 * Cycle de la donnée, en cinq étapes, et état de chaque source :
 *
 *   1. Notes        : les références (décisions, textes, articles) sont repérées dans les notes.
 *   2. Textes       : l'adresse, le texte et le statut des articles et textes sont retrouvés par l'API.
 *   3. Décisions    : chaque décision citée est retrouvée, lue (métadonnées, texte intégral), analysée.
 *   4. Généalogie   : les décisions citées dans le texte des décisions sont relevées.
 *   5. Fiches       : les notes qui décrivent une décision sont reliées à elle.
 *
 * Une source (décision) est dans l'un de ces états pour l'utilisateur : **fichée** (verte : elle a une
 * fiche), **citée** (jaune : une note la cite, pas de fiche), **fiche non citée** (grise). Ce qui a été
 * lu en ligne (« texte intégral ») s'ajoute comme précision, pas comme un autre état. Module pur : le
 * plugin passe le contenu du coffre et ce que sait résoudre l'API.
 */
import type { ReferenceIndex } from ".";
import type { LegalRef } from "./parser";

/** Tâche qui fait avancer une étape (voir `indexer.ts`). */
export type CycleTask = "index" | "articles" | "enrich" | "genealogy" | "fiches";

export interface CycleStep {
	id: "notes" | "textes" | "decisions" | "genealogie" | "fiches";
	/** Numéro et nom de l'étape. */
	title: string;
	/** Ce que l'étape produit, en une phrase. */
	what: string;
	done: number;
	total: number;
	/** Détail chiffré. */
	detail: string;
	/** Tâche qui fait avancer l'étape. */
	task: CycleTask;
}

/** Note du coffre, avec sa date de modification (pour savoir si son analyse est à jour). */
export interface VaultNote {
	path: string;
	mtime: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/**
 * État des cinq étapes du cycle. `canResolve` dit si l'API sait retrouver une référence (les autres ne
 * reçoivent qu'un lien de recherche).
 */
export function cycleProgress(index: ReferenceIndex, notes: VaultNote[], canResolve: (ref: LegalRef) => boolean): CycleStep[] {
	const count = (sql: string) => index.db.get<{ n: number }>(sql)?.n ?? 0;

	const analysed = notes.filter((note) => index.cached(note.path, note.mtime)).length;
	const last = index.lastIndexedAt();

	const articles = index.allReferences().filter((ref) => ref.kind === "article" || ref.kind === "texte");
	const linked = articles.filter((ref) => index.linkFor(ref)).length;
	const lost = articles.filter((ref) => !index.linkFor(ref) && canResolve(ref) && index.isRecentMiss(ref)).length;
	const outOfReach = articles.filter((ref) => !index.linkFor(ref) && !canResolve(ref)).length;
	const waiting = articles.length - linked - lost - outOfReach;

	const decisions = index.decisionProgress();
	const treated = decisions.complete + decisions.external;

	const analysable = count("SELECT COUNT(*) AS n FROM decisions WHERE status = 'complete' AND text_markdown IS NOT NULL AND legifrance_id IS NOT NULL");
	const related = analysable - index.decisionsWithoutRelations().length;

	const fiches = index.ficheStats();

	return [
		{
			id: "notes",
			title: "1. Notes analysées",
			what: "Les références juridiques sont repérées dans vos notes.",
			done: analysed,
			total: notes.length,
			detail: `${analysed} / ${notes.length}${analysed < notes.length ? ` — ${notes.length - analysed} à analyser` : " — à jour"}${last ? ` — dernière analyse le ${new Date(last).toLocaleString("fr-FR")}` : ""}`,
			task: "index",
		},
		{
			id: "textes",
			title: "2. Articles et textes retrouvés",
			what: "Adresse Légifrance, texte et statut de vigueur de chaque article et texte cité.",
			done: linked,
			total: articles.length,
			detail: `${linked} / ${articles.length} avec adresse — ${waiting} à retrouver — ${lost} introuvables (nouvel essai sous 24 h) — ${outOfReach} hors de portée de l'API (lien de recherche)`,
			task: "articles",
		},
		{
			id: "decisions",
			title: "3. Décisions complétées",
			what: "Chaque décision citée est retrouvée et lue : métadonnées, texte intégral, thèmes, articles visés.",
			done: treated,
			total: decisions.cited,
			detail: `${decisions.complete} complètes — ${decisions.external} hors Légifrance — ${decisions.pending} à compléter — ${decisions.unresolved} introuvables — ${decisions.errors} en erreur (sur ${plural(decisions.cited, "décision citée", "décisions citées")})`,
			task: "enrich",
		},
		{
			id: "genealogie",
			title: "4. Généalogie analysée",
			what: "Les décisions citées dans le texte des décisions (revirements, précisions, confirmations).",
			done: related,
			total: analysable,
			detail: `${related} / ${analysable} décisions complètes analysées`,
			task: "genealogy",
		},
		{
			id: "fiches",
			title: "5. Fiches reliées",
			what: "Les notes qui décrivent une décision sont reliées à elle par son identifiant Légifrance.",
			done: fiches.identified,
			total: fiches.fiches,
			detail: `${fiches.identified} / ${fiches.fiches} fiches liées à une décision`,
			task: "fiches",
		},
	];
}

/** État d'une source pour l'utilisateur. */
export interface SourceState {
	tone: "fiche" | "cite" | "orpheline";
	label: string;
	hint: string;
}

/** Une source est-elle fichée, citée seulement, ou une fiche que rien ne cite ? */
export function sourceState({ fiche, notes }: { fiche: boolean; notes: number }): SourceState {
	if (fiche && notes > 0) return { tone: "fiche", label: "Fichée", hint: "Une fiche décrit cette décision et vos notes la citent." };
	if (fiche) return { tone: "orpheline", label: "Fiche non citée", hint: "Une fiche existe, mais aucune de vos notes ne cite la décision." };
	return { tone: "cite", label: "Citée", hint: "Vos notes la citent, mais elle n'a pas de fiche." };
}
