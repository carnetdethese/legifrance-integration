/**
 * Avancement affiché dans les réglages : tâche en cours, usage de l'API, état de l'indexation des
 * notes, des liens et des fiches de décisions.
 */
import type LegifrancePlugin from "main";
import { cycleProgress } from "references/lifecycle";
import { canResolve } from "references/resolver";

const clock = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR");
const duration = (ms: number) => {
	const seconds = Math.max(0, Math.round(ms / 1000));
	return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
};

/** Ligne « titre — barre de progression — détail ». */
function progressRow(parent: HTMLElement, title: string, done: number, total: number, detail: string) {
	const row = parent.createDiv({ cls: "legifrance-status-row" });
	row.createDiv({ cls: "legifrance-status-title", text: title });
	row.createEl("progress", { attr: { max: String(Math.max(total, 1)), value: String(Math.min(done, Math.max(total, 1))) } });
	row.createDiv({ cls: "setting-item-description", text: detail });
}

/** Partie vivante (tâche en cours et usage de l'API) : construite une fois, mise à jour en place. */
export class LiveStatus {
	private task: HTMLElement;
	private bar: HTMLProgressElement;
	private taskDetail: HTMLElement;
	private stop: HTMLButtonElement;
	private api: HTMLElement;

	constructor(parent: HTMLElement, private plugin: LegifrancePlugin) {
		const root = parent.createDiv({ cls: "legifrance-status-row" });
		root.createDiv({ cls: "legifrance-status-title", text: "Tâche en cours" });
		this.task = root.createDiv({ cls: "setting-item-description" });
		this.bar = root.createEl("progress");
		this.taskDetail = root.createDiv({ cls: "setting-item-description" });
		this.stop = root.createEl("button", { text: "Arrêter" });
		this.stop.onclick = () => plugin.tasks.cancel();

		const apiRow = parent.createDiv({ cls: "legifrance-status-row" });
		apiRow.createDiv({ cls: "legifrance-status-title", text: "Requêtes vers l'API" });
		this.api = apiRow.createDiv({ cls: "setting-item-description" });
		this.update();
	}

	update() {
		const { plugin } = this;
		const state = plugin.tasks.state;
		if (state) {
			const percent = state.total ? Math.round((state.done / state.total) * 100) : 0;
			const elapsed = Date.now() - state.startedAt;
			const remaining = state.done > 0 && state.total > state.done ? ` · reste environ ${duration((elapsed / state.done) * (state.total - state.done))}` : "";
			this.task.setText(`${state.name} : ${state.done} / ${state.total} (${percent} %)${remaining}`);
			this.bar.max = Math.max(state.total, 1);
			this.bar.value = state.done;
			this.taskDetail.setText(plugin.tasks.cancelled ? "Arrêt demandé : la tâche s'interrompt après la requête en cours." : state.label);
		} else {
			this.task.setText("Aucune tâche en cours.");
			this.bar.value = 0;
			this.taskDetail.setText("");
		}
		this.bar.toggle(!!state);
		this.stop.toggle(!!state);
		this.stop.disabled = plugin.tasks.cancelled;

		const limiter = plugin.api.limiter;
		const limit = limiter.maxPerWindow;
		const lines = [`${limiter.used}${limit > 0 ? ` / ${limit}` : ""} requête${limiter.used > 1 ? "s" : ""} dans la dernière minute · ${limiter.total} depuis le démarrage d'Obsidian`];
		if (limiter.suspendedUntil) lines.push(`Quota dépassé : envois suspendus jusqu'à ${clock(limiter.suspendedUntil)}.`);
		else if (limiter.waiting > 0) lines.push(`${limiter.waiting} requête${limiter.waiting > 1 ? "s" : ""} en attente d'un créneau${limiter.nextSlot ? ` (prochain envoi à ${clock(limiter.nextSlot)})` : ""}.`);
		if (plugin.links.pending.size > 0) lines.push(`${plugin.links.pending.size} recherche${plugin.links.pending.size > 1 ? "s" : ""} de lien en cours.`);
		this.api.setText(lines.join("\n"));
		this.api.addClass("legifrance-status-lines");
	}
}

/** Partie « données » : ce que la base contient et ce qui reste à faire. */
export function renderDataStatus(parent: HTMLElement, plugin: LegifrancePlugin) {
	parent.empty();
	const index = plugin.references;
	const db = index.db;
	const count = (sql: string) => db.get<{ n: number }>(sql)?.n ?? 0;

	// Les cinq étapes du cycle de la donnée (voir `references/lifecycle.ts`).
	const notes = plugin.app.vault.getMarkdownFiles().map((file) => ({ path: file.path, mtime: file.stat.mtime }));
	for (const step of cycleProgress(index, notes, canResolve)) progressRow(parent, step.title, step.done, step.total, step.detail);

	parent.createDiv({
		cls: "setting-item-description",
		text: `${count("SELECT COUNT(*) AS n FROM refs")} références · ${count("SELECT COUNT(*) AS n FROM citations")} citations · fichier : ${plugin.manifest.dir}/legifrance.sqlite`,
	});
}
