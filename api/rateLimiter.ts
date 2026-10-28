/**
 * Limiteur de débit : au plus `limit` requêtes sur toute fenêtre glissante d'une minute. Les requêtes
 * en trop attendent leur tour, dans l'ordre. Après un refus de l'API pour quota dépassé, `backoff`
 * suspend tout envoi pendant un délai. Module pur (sans Obsidian).
 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Voie d'une requête : une action de l'utilisateur passe avant les tâches de fond (indexation, lots). */
export type Lane = "interactive" | "background";

export class RateLimiter {
	private sent: number[] = [];
	private queues: Record<Lane, (() => void)[]> = { interactive: [], background: [] };
	private pumping = false;
	private blockedUntil = 0;
	/** Requêtes en attente d'un créneau. */
	waiting = 0;
	/** Requêtes envoyées depuis la création du limiteur. */
	total = 0;
	/** Instant (ms) où la requête en attente pourra partir ; 0 si rien n'attend. */
	nextSlot = 0;

	/**
	 * @param limit requêtes par fenêtre (0 ou moins : illimité).
	 * @param windowMs durée de la fenêtre (une minute ; réduite dans les tests).
	 */
	constructor(private limit: number, private windowMs = 60_000) {}

	setLimit(limit: number) {
		this.limit = limit;
	}

	get maxPerWindow() {
		return this.limit;
	}

	/** Requêtes envoyées pendant la dernière fenêtre. */
	get used() {
		this.purge(Date.now());
		return this.sent.length;
	}

	/** Suspend tout envoi pendant `ms` (quota dépassé). */
	backoff(ms: number) {
		this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
	}

	/** Instant (ms) jusqu'auquel les envois sont suspendus après un refus de l'API, ou 0. */
	get suspendedUntil() {
		return this.blockedUntil > Date.now() ? this.blockedUntil : 0;
	}

	/**
	 * Attend un créneau, puis le réserve : à appeler juste avant chaque requête. Les créneaux vont
	 * d'abord aux requêtes interactives, dans l'ordre d'arrivée, puis à celles de fond.
	 */
	acquire(lane: Lane = "interactive"): Promise<void> {
		this.waiting++;
		return new Promise<void>((resolve) => {
			this.queues[lane].push(resolve);
			void this.pump();
		}).finally(() => {
			this.waiting--;
		});
	}

	private purge(now: number) {
		this.sent = this.sent.filter((time) => now - time < this.windowMs);
	}

	/** Distribue les créneaux tant que des requêtes attendent. */
	private async pump() {
		if (this.pumping) return;
		this.pumping = true;
		try {
			while (this.queues.interactive.length || this.queues.background.length) {
				await this.slot();
				// Une requête interactive arrivée pendant l'attente passe devant.
				const queue = this.queues.interactive.length ? this.queues.interactive : this.queues.background;
				this.sent.push(Date.now());
				this.total++;
				this.nextSlot = 0;
				queue.shift()?.();
			}
		} finally {
			this.pumping = false;
		}
	}

	/** Attend qu'un créneau soit libre (fenêtre non pleine, pas de suspension). */
	private async slot() {
		for (;;) {
			const now = Date.now();
			this.purge(now);
			const full = this.limit > 0 && this.sent.length >= this.limit;
			const wait = Math.max(this.blockedUntil - now, full ? this.sent[0] + this.windowMs - now : 0);
			if (wait <= 0) return;
			this.nextSlot = now + wait;
			await sleep(wait);
		}
	}
}
