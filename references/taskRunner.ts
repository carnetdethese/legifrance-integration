/**
 * Exécution des tâches longues sur la base (indexation, complément des fiches…) : une seule à la fois, avec une
 * notification de progression, un arrêt demandé par l'utilisateur et un bilan à la fin. Les tâches elles-mêmes
 * (`INDEX_TASK`, `COMPLETE_FICHES_TASK`…) sont définies avec leur code ; elles consultent `cancelled` entre deux pas.
 */
import { Notice } from "obsidian";
import type LegifrancePlugin from "main";
import { REFERENCES_EVENT, TASK_EVENT } from "lib/events";
import type { Task } from "./indexer";

/** Tâche longue en cours, pour l'affichage de l'avancement (réglages, vue Base de données). */
export interface TaskState {
	name: string;
	done: number;
	total: number;
	label: string;
	startedAt: number;
}

export class TaskRunner {
	/** Une tâche est en cours. */
	running = false;
	/** L'utilisateur a demandé l'arrêt de la tâche en cours : elle s'interrompt au prochain pas. */
	cancelled = false;
	/** Avancement de la tâche en cours (`undefined` : aucune). */
	state?: TaskState;

	constructor(private readonly plugin: LegifrancePlugin) {}

	/**
	 * Lance une tâche avec une notification de progression et annonce son résultat. Refusée si une autre tâche
	 * tourne. Une erreur est annoncée, jamais propagée.
	 * `silent` : ni notification de progression ni bilan (tâche lancée d'elle-même au démarrage) ; l'avancement reste
	 * visible dans la vue Base de données et une erreur est toujours annoncée.
	 * @returns le bilan de la tâche, ou `undefined` si elle n'a pas pu s'exécuter.
	 */
	async run<R>({ name, run, summarize }: Task<R>, { silent = false }: { silent?: boolean } = {}) {
		const { plugin } = this;
		if (this.running) {
			new Notice("Une tâche est déjà en cours.");
			return;
		}
		this.running = true;
		this.cancelled = false;
		this.state = { name, done: 0, total: 0, label: "", startedAt: Date.now() };
		plugin.events.trigger(TASK_EVENT);
		const notice = silent ? undefined : new Notice(`${name}…`, 0);
		try {
			const report = await run(plugin, (done, total, label) => {
				this.state = { name, done, total, label, startedAt: this.state?.startedAt ?? Date.now() };
				plugin.events.trigger(TASK_EVENT);
				const pause = plugin.api.limiter.nextSlot;
				const wait = pause > Date.now() ? `\n(pause pour respecter la limite de requêtes : ${Math.ceil((pause - Date.now()) / 1000)} s)` : "";
				notice?.setMessage(`${name} : ${done}/${total}\n${label}${wait}`);
			});
			notice?.hide();
			if (!silent) new Notice(`${name} : ${summarize(report)}`, 10000);
			plugin.events.trigger(REFERENCES_EVENT);
			return report;
		} catch (error) {
			console.error(error);
			notice?.hide();
			new Notice(`${name} : échec (${error instanceof Error ? error.message : String(error)})`, 10000);
		} finally {
			this.running = false;
			this.cancelled = false;
			this.state = undefined;
			plugin.events.trigger(TASK_EVENT);
		}
	}

	/** Demande l'arrêt de la tâche en cours (au prochain pas : la requête en cours n'est pas annulée). */
	cancel() {
		if (this.running) this.cancelled = true;
		this.plugin.events.trigger(TASK_EVENT);
	}
}
