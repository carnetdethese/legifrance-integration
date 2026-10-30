/**
 * Travaux de fond sur la base : indexation de toutes les notes du coffre, puis complément des
 * fiches de décisions via l'API. Chaque tâche rend la main à l'interface régulièrement et signale
 * sa progression.
 */
import { ApiError } from "api/client";
import type LegifrancePlugin from "main";
import { readDecision } from "./caselaw";
import { COURT_NAMES } from "./fiches";
import { decisionRelations } from "./genealogy";
import { RGD_SITE, decisionKey, decisionTextId } from "./ids";
import { readRgdDecision } from "./rgd";
import { LegalRef, parseCitations } from "./parser";
import { canResolve } from "./resolver";
import { termCounts } from "./similarity";

/** Décision lue, prête à être analysée et enregistrée (Légifrance ou Revue générale du droit). */
type AnalyzedDecision = NonNullable<ReturnType<typeof readDecision>>;

/** Reçoit (traités, total, libellé) au fil de la tâche. */
export type Progress = (done: number, total: number, label: string) => void;

/** Notes traitées avant de rendre la main à l'interface. */
const NOTES_PER_BATCH = 25;
/** Notes analysées entre deux enregistrements de la base. */
const CHECKPOINT_EVERY = 500;
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Résultat de l'indexation du coffre. */
export interface IndexReport {
	notes: number;
	analyzed: number;
	removed: number;
	references: number;
	/** Interrompu à la demande de l'utilisateur. */
	stopped?: string;
}

/**
 * Analyse toutes les notes du coffre (celles qui n'ont pas changé depuis leur dernière analyse sont
 * ignorées), retire de la base les notes disparues et les références devenues orphelines.
 */
export async function indexVault(plugin: LegifrancePlugin, progress: Progress): Promise<IndexReport> {
	const files = plugin.app.vault.getMarkdownFiles();
	const index = plugin.references;
	let analyzed = 0;

	for (const [i, file] of files.entries()) {
		if (plugin.tasks.cancelled) return { notes: files.length, analyzed, removed: 0, references: index.stats().references, stopped: "arrêtée" };
		if (!index.cached(file.path, file.stat.mtime)) {
			await plugin.getReferences(file);
			analyzed++;
			// Point de reprise : l'enregistrement différé attend un répit, qui ne vient qu'à la fin ; une application fermée
			// (ou suspendue, sur mobile) en cours de route perdrait tout le travail.
			if (analyzed % CHECKPOINT_EVERY === 0) await plugin.saveDatabase();
		}
		if (i % NOTES_PER_BATCH === 0) {
			progress(i, files.length, file.path);
			await pause(0);
		}
	}

	// Notes supprimées ou déplacées hors de l'application pendant qu'elle était fermée.
	const present = new Set(files.map((f) => f.path));
	const missing = index.db.all<{ path: string }>("SELECT path FROM notes").filter((n) => !present.has(n.path));
	missing.forEach((n) => index.remove(n.path));

	index.prune();
	plugin.fiches.sync();
	return { notes: files.length, analyzed, removed: missing.length, references: index.stats().references };
}

/** Résultat du complément des fiches. */
export interface EnrichReport {
	complete: number;
	external: number;
	unresolved: number;
	errors: number;
	/** Interrompu (quota dépassé, identifiants refusés). */
	stopped?: string;
}

/**
 * Complète la fiche de chaque décision citée : retrouve son adresse Légifrance si besoin, puis lit
 * ses métadonnées et son texte (`/consult/juri`). Les décisions hors Légifrance (ArianeWeb) sont
 * notées « external », sans texte. Reprenable : seules les fiches à compléter ou à retenter sont
 * traitées. `only` limite la tâche à ces références (une décision précisée à la main).
 */
export async function enrichDecisions(plugin: LegifrancePlugin, progress: Progress, { retryUnresolved = false, only }: { retryUnresolved?: boolean; only?: LegalRef[] } = {}): Promise<EnrichReport> {
	const index = plugin.references;
	const report: EnrichReport = { complete: 0, external: 0, unresolved: 0, errors: 0 };
	if (!plugin.hasCredentials) return { ...report, stopped: "Identifiants PISTE absents." };

	index.ensureDecisionRows();
	const todo = only ?? index.pendingDecisions(retryUnresolved);

	for (const [i, ref] of todo.entries()) {
		if (plugin.tasks.cancelled) return { ...report, stopped: "arrêtée" };
		progress(i, todo.length, ref.label);
		try {
			// 1. Adresse de la décision (recherche si elle n'est pas encore connue). Une décision déjà
			// marquée introuvable n'est pas recherchée à nouveau, sauf demande expresse.
			if (!index.linkFor(ref) && canResolve(ref) && (retryUnresolved || !index.hasMiss(ref.key))) {
				await plugin.links.resolve([ref], retryUnresolved, "background");
			}
			const link = index.linkFor(ref);
			if (!link) {
				index.saveDecision(ref.key, { status: "unresolved" });
				report.unresolved++;
				continue;
			}

			// 2. Fiche : métadonnées et texte, lus sur Légifrance ou sur la Revue générale du droit (pas pour une page ArianeWeb).
			const rgdKey = link.url.startsWith(RGD_SITE) ? decisionKey(link.url) : undefined;
			const textId = decisionTextId(link.url) ?? rgdKey;
			if (!textId) {
				index.saveDecision(ref.key, { status: "external", title: link.titre });
				report.external++;
				continue;
			}
			// Déjà complétée pour une autre façon de la citer : on la recopie, sans requête.
			const known = index.completeDecision(textId, true);
			if (known && known.ref_key !== ref.key) {
				index.copyDecision(known, ref.key);
				report.complete++;
				continue;
			}
			let decision: AnalyzedDecision | undefined;
			if (rgdKey) {
				const read = await readRgdDecision(rgdKey);
				decision = {
					themes: [],
					court: read.courtCode && COURT_NAMES[read.courtCode],
					number: read.number,
					title: read.title,
					date: read.date,
					html: read.html,
					markdown: read.markdown,
				};
			} else {
				decision = readDecision(await plugin.api.consultDecision(textId, { lane: "background" })) ?? undefined;
			}
			if (!decision) {
				index.saveDecision(ref.key, { status: "error", legifranceId: textId, error: "Réponse sans texte." });
				report.errors++;
			} else {
				// Analyse locale du texte : vocabulaire (décisions proches) et articles visés.
				const terms = termCounts(`${decision.markdown} ${decision.summary ?? ""} ${decision.themes.join(" ")}`);
				const articles = parseCitations(decision.markdown)
					.filter(({ ref: cited }) => cited.kind === "article" || cited.kind === "eu")
					.map(({ ref: cited, count }) => ({ key: cited.key, label: cited.label, count }));
				index.saveDecisionArticles(textId, articles);
				index.saveRelations(textId, decisionRelations(decision.markdown));
				index.saveDecision(ref.key, {
					status: "complete",
					themes: decision.themes,
					summary: decision.summary,
					terms: JSON.stringify(terms),
					legifranceId: textId,
					court: decision.court ?? ref.data.court,
					number: decision.number ?? ref.data.number,
					title: decision.title,
					date: decision.date,
					formation: decision.formation,
					ecli: decision.ecli,
					solution: decision.solution,
					html: decision.html,
					markdown: decision.markdown,
				});
				report.complete++;
			}
		} catch (error) {
			// Identifiants refusés ou quota dépassé : inutile d'insister.
			if (error instanceof ApiError && [401, 403, 429].includes(error.status ?? 0)) {
				return { ...report, stopped: error.message };
			}
			index.saveDecision(ref.key, { status: "error", error: error instanceof Error ? error.message : String(error) });
			report.errors++;
		}
	}
	return report;
}

/** Résultat de la recherche des articles et textes cités. */
export interface ArticlesReport {
	resolved: number;
	missing: number;
	/** Interrompu (identifiants refusés, arrêt demandé). */
	stopped?: string;
}

/**
 * Retrouve via l'API l'adresse (et pour un article, le texte et le statut de vigueur) de chaque article
 * ou texte cité, les plus cités d'abord. Une recherche infructueuse n'est pas relancée avant un jour.
 * Reprenable : seules les références sans adresse sont traitées.
 */
export async function resolveArticles(plugin: LegifrancePlugin, progress: Progress): Promise<ArticlesReport> {
	const report: ArticlesReport = { resolved: 0, missing: 0 };
	if (!plugin.hasCredentials) return { ...report, stopped: "Identifiants PISTE absents." };
	const todo = plugin.references.unresolvedArticles().filter(canResolve);

	for (const [i, ref] of todo.entries()) {
		if (plugin.tasks.cancelled) return { ...report, stopped: "arrêtée" };
		if (plugin.links.authFailed) return { ...report, stopped: "identifiants refusés" };
		progress(i, todo.length, ref.label);
		await plugin.links.resolve([ref], false, "background");
		if (plugin.references.linkFor(ref)) report.resolved++;
		else report.missing++;
	}
	return report;
}

/** Résultat de l'analyse de la généalogie. */
export interface GenealogyReport {
	analyzed: number;
	relations: number;
	stopped?: string;
}

/**
 * Lit le texte des décisions complètes déjà en base pour y relever les décisions qu'elles citent et la
 * façon dont elles les citent (revirements, précisions, confirmations). Local : aucune requête.
 * Reprenable : une décision analysée n'est plus relue.
 */
export async function analyzeGenealogy(plugin: LegifrancePlugin, progress: Progress): Promise<GenealogyReport> {
	const index = plugin.references;
	const todo = index.decisionsWithoutRelations();
	const report: GenealogyReport = { analyzed: 0, relations: 0 };
	for (const [i, row] of todo.entries()) {
		if (plugin.tasks.cancelled) return { ...report, stopped: "arrêtée" };
		if (i % 10 === 0) {
			progress(i, todo.length, row.legifrance_id);
			await pause(0);
		}
		const relations = decisionRelations(row.text_markdown);
		index.saveRelations(row.legifrance_id, relations);
		report.analyzed++;
		report.relations += relations.length;
	}
	return report;
}

/** Âge au-delà duquel le lien d'un article ou d'un texte est revérifié (6 mois). */
export const REFRESH_AFTER_MS = 182 * 24 * 60 * 60 * 1000;

/** Résultat de la veille des articles. */
export interface RefreshReport {
	checked: number;
	/** Statut ou texte modifié depuis la dernière vérification. */
	changed: number;
	stopped?: string;
}

/**
 * Revérifie sur l'API les articles et textes dont le lien date de plus de six mois (les plus cités
 * d'abord) : un statut de vigueur ou un texte qui a changé est signalé dans « À faire ». Reprenable :
 * un lien revérifié n'est plus à refaire avant six mois.
 */
export async function refreshArticles(plugin: LegifrancePlugin, progress: Progress): Promise<RefreshReport> {
	const report: RefreshReport = { checked: 0, changed: 0 };
	if (!plugin.hasCredentials) return { ...report, stopped: "Identifiants PISTE absents." };
	const index = plugin.references;
	const before = index.changedArticles().length;
	const todo = index.articlesToRefresh(Date.now() - REFRESH_AFTER_MS);

	for (const [i, ref] of todo.entries()) {
		if (plugin.tasks.cancelled) return { ...report, changed: index.changedArticles().length - before, stopped: "arrêtée" };
		if (plugin.links.authFailed) return { ...report, changed: index.changedArticles().length - before, stopped: "identifiants refusés" };
		progress(i, todo.length, ref.label);
		await plugin.links.resolve([ref], true, "background");
		index.touchLink(ref.key);
		report.checked++;
	}
	return { ...report, changed: Math.max(0, index.changedArticles().length - before) };
}

/** Tâche longue lançable depuis une commande ou les réglages (`LegifrancePlugin.runTask`). */
export interface Task<R> {
	name: string;
	run: (plugin: LegifrancePlugin, progress: Progress) => Promise<R>;
	/** Phrase de bilan affichée à la fin. */
	summarize: (report: R) => string;
}

export const INDEX_TASK: Task<IndexReport> = {
	name: "Indexation du coffre",
	run: indexVault,
	summarize: (r) => `${r.stopped ? "arrêtée, " : ""}${r.notes} notes (${r.analyzed} analysées), ${r.references} références.`,
};

/** Reprend les décisions marquées introuvables (nouvelle recherche : coûte des requêtes). */
export const RETRY_UNRESOLVED_TASK: Task<EnrichReport> = {
	name: "Décisions introuvables",
	run: (plugin, progress) => enrichDecisions(plugin, progress, { retryUnresolved: true }),
	summarize: (r) =>
		r.stopped
			? `interrompu (${r.stopped}) après ${r.complete} complètes, ${r.unresolved} toujours introuvables`
			: `${r.complete} retrouvées et complétées, ${r.external} hors Légifrance, ${r.unresolved} toujours introuvables, ${r.errors} erreurs.`,
};

export const GENEALOGY_TASK: Task<GenealogyReport> = {
	name: "Généalogie de la jurisprudence",
	run: analyzeGenealogy,
	summarize: (r) => `${r.stopped ? "arrêtée, " : ""}${r.analyzed} décisions analysées, ${r.relations} décisions citées relevées.`,
};

export const REFRESH_TASK: Task<RefreshReport> = {
	name: "Actualisation des articles",
	run: refreshArticles,
	summarize: (r) => `${r.stopped ? `interrompue (${r.stopped}) : ` : ""}${r.checked} vérifiés, ${r.changed} modifié${r.changed > 1 ? "s" : ""}.`,
};

export const ARTICLES_TASK: Task<ArticlesReport> = {
	name: "Articles et textes cités",
	run: resolveArticles,
	summarize: (r) => `${r.stopped ? `interrompu (${r.stopped}) : ` : ""}${r.resolved} retrouvés, ${r.missing} introuvables.`,
};

/** « Compléter » : les décisions, puis les articles et textes cités (sauf si la première étape a été interrompue). */
export const ENRICH_TASK: Task<EnrichReport & { articles?: ArticlesReport }> = {
	name: "Décisions, articles et textes",
	run: async (plugin, progress) => {
		const report: EnrichReport & { articles?: ArticlesReport } = await enrichDecisions(plugin, progress);
		if (!report.stopped) report.articles = await resolveArticles(plugin, progress);
		if (!plugin.tasks.cancelled) await analyzeGenealogy(plugin, progress);
		return report;
	},
	summarize: (r) => {
		const decisions = r.stopped
			? `interrompu (${r.stopped}) après ${r.complete} complètes, ${r.external} hors Légifrance, ${r.unresolved} introuvables, ${r.errors} erreurs`
			: `${r.complete} complètes, ${r.external} hors Légifrance, ${r.unresolved} introuvables, ${r.errors} erreurs`;
		return r.articles ? `${decisions} — articles et textes : ${r.articles.resolved} retrouvés, ${r.articles.missing} introuvables${r.articles.stopped ? ` (interrompu : ${r.articles.stopped})` : ""}.` : `${decisions}.`;
	},
};
