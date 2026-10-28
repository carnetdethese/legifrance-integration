/**
 * Recherche des liens des références juridiques d'une note (article, décision, texte) : pour chaque référence
 * sans lien connu, l'API Légifrance est interrogée (`resolveReference`) et le résultat — lien, ou échec — est
 * mémorisé dans la base pour ne pas redemander à chaque ouverture de la note.
 *
 * Cette classe tient l'état de ces recherches (en cours, journal de débogage, identifiants refusés) que les
 * vues affichent ; la logique de requête est dans `resolver.ts`.
 */
import { Notice } from "obsidian";
import { ApiError } from "api/client";
import type { Lane } from "api/rateLimiter";
import { REFERENCES_EVENT } from "lib/events";
import type LegifrancePlugin from "main";
import { ERROR_RETRY_MS } from "./index";
import { LegalRef, searchUrl } from "./parser";
import { canResolve, resolveReference } from "./resolver";

/** Codes HTTP qui disent « requête refusée ou sans objet » : la référence est traitée comme introuvable. */
const REFUSED = [400, 404];
/** Codes HTTP qui disent « identifiants refusés ou quota dépassé » : on prévient et on cesse d'interroger. */
const BLOCKED = [401, 403, 429];

export class LinkResolver {
	/** Références en cours de recherche ; évite les requêtes en double entre deux analyses. */
	readonly pending = new Set<string>();
	/** Journal de la dernière recherche de chaque référence (mode débogage), par clef. Non persisté. */
	readonly traces = new Map<string, string[]>();
	/** Les identifiants ont été refusés : on n'insiste pas tant qu'ils n'ont pas changé. */
	authFailed = false;
	private lastCredentials = "";

	constructor(private readonly plugin: LegifrancePlugin) {}

	/** À appeler quand les réglages sont enregistrés : de nouveaux identifiants permettent de réessayer après un refus. */
	settingsSaved() {
		const { clientId, clientSecret } = this.plugin.settings;
		const credentials = `${clientId}:${clientSecret}`;
		if (credentials !== this.lastCredentials) this.authFailed = false;
		this.lastCredentials = credentials;
	}

	/** Lien à ouvrir pour une référence : celui retrouvé, sinon une recherche Légifrance. */
	urlFor(ref: LegalRef) {
		return this.plugin.references.linkFor(ref)?.url ?? ref.fallbackUrl ?? searchUrl(ref.query);
	}

	/**
	 * Retrouve le lien de chaque référence qui n'en a pas (les références sont traitées l'une après l'autre ; les
	 * vues sont prévenues à chaque changement). Un échec est mémorisé pour ne pas réessayer avant 24 h ; une erreur
	 * de réseau ou de service, pour une durée plus courte (`ERROR_RETRY_MS`).
	 *
	 * @param force cherche aussi les références déjà introuvables (action manuelle).
	 * @param lane `background` pour une tâche de fond : ses requêtes passent après celles de l'utilisateur.
	 */
	async resolve(refs: LegalRef[], force = false, lane?: Lane) {
		const { plugin } = this;
		if (!plugin.hasCredentials) return;
		const todo = refs.filter(
			(ref) =>
				canResolve(ref) &&
				(force || !plugin.references.linkFor(ref)) &&
				!this.pending.has(ref.key) &&
				(force || plugin.settings.debugRefs || !plugin.references.isRecentMiss(ref))
		);
		if (todo.length === 0) return; // rien à faire : surtout pas d'événement (les vues relanceraient l'appel)
		todo.forEach((ref) => this.pending.add(ref.key));
		plugin.events.trigger(REFERENCES_EVENT);

		for (const ref of todo) {
			await this.resolveOne(ref, lane);
			this.pending.delete(ref.key);
			plugin.events.trigger(REFERENCES_EVENT);
		}
	}

	/** Une référence : interroge l'API et range le résultat (lien, échec, ou rien si les identifiants sont refusés). */
	private async resolveOne(ref: LegalRef, lane?: Lane) {
		const { plugin } = this;
		const trace: string[] = [];
		const log = (line: string) => {
			trace.push(line);
			if (plugin.settings.debugRefs) console.debug(`[Légifrance] ${ref.label} ${line}`);
		};
		try {
			const link = this.authFailed ? null : await resolveReference(plugin.api, ref, log, lane, plugin.settings.ficheUseRgd);
			if (link) plugin.references.setLink(ref, link);
			else if (!this.authFailed) plugin.references.setMiss(ref);
		} catch (error) {
			log(`✘ ${error instanceof Error ? error.message : String(error)}`);
			const status = error instanceof ApiError ? error.status ?? 0 : 0;
			if (!(error instanceof ApiError && [...REFUSED, ...BLOCKED].includes(status))) {
				// Autre erreur (réseau, service) : on réessaiera, mais pas à chaque ouverture de la note.
				plugin.references.setMiss(ref, ERROR_RETRY_MS);
			}
			// Requête refusée partout : traitée comme introuvable, sans réessayer à chaque ouverture.
			if (REFUSED.includes(status)) plugin.references.setMiss(ref);
			if (BLOCKED.includes(status)) {
				// Une seule notification par série ; un quota dépassé (429) est passager, des identifiants refusés ne le sont pas.
				if (!this.authFailed) new Notice((error as ApiError).message);
				this.authFailed = status !== 429;
			}
			console.error(error);
		}
		if (plugin.settings.debugRefs) this.traces.set(ref.key, trace);
	}
}
