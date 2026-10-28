import { App, Modal, Setting } from "obsidian";
import { DecisionRecord, displayDate, RESOLVED_ID } from "references/timeline";

/** Rend la décision à conserver parmi `records` (celle qui absorbe les autres), ou `null` si l'utilisateur annule. */
export function chooseMain(app: App, records: DecisionRecord[]): Promise<DecisionRecord | null> {
	return new Promise((resolve) => {
		let answer: DecisionRecord | null = null;
		// Par défaut : la décision retrouvée sur Légifrance, sinon celle qui a une fiche, sinon la plus citée.
		const score = (r: DecisionRecord) => (RESOLVED_ID.test(r.id) ? 4 : 0) + (r.fichePath ? 2 : 0) + (r.complete ? 1 : 0);
		let main = [...records].sort((a, b) => score(b) - score(a) || b.notes.length - a.notes.length)[0];

		const modal = new (class extends Modal {
			onOpen() {
				this.setTitle("Rapprocher ces décisions");
				this.contentEl.createEl("p", {
					text: "Ces entrées sont la même décision. Choisissez celle qui est conservée : les notes qui citent les autres lui sont rattachées, ainsi que leur fiche si elle existe.",
					cls: "setting-item-description",
				});
				const list = this.contentEl.createDiv({ cls: "legifrance-merge-list" });
				for (const record of records) {
					const details = [displayDate(record.date), record.court, record.number && `n° ${record.number}`, `${record.notes.length} note${record.notes.length > 1 ? "s" : ""}`, record.fichePath && "fiche", record.complete && "texte intégral"]
						.filter(Boolean)
						.join(" · ");
					const label = list.createEl("label", { cls: "legifrance-merge-choice" });
					const radio = label.createEl("input", { type: "radio", attr: { name: "legifrance-merge-main" } });
					radio.checked = record === main;
					radio.addEventListener("change", () => (main = record));
					const text = label.createDiv();
					text.createDiv({ text: record.name ?? record.title ?? record.label, cls: "legifrance-row-title" });
					if (record.name) text.createDiv({ text: record.title ?? record.label, cls: "legifrance-row-meta" });
					text.createDiv({ text: details, cls: "legifrance-row-meta" });
					const more = [
						record.formation && `Formation : ${record.formation}`,
						record.solution && `Solution : ${record.solution}`,
						record.cited?.length && `Cité comme : ${record.cited.slice(0, 5).join(" · ")}`,
						record.fichePath && `Fiche : ${record.fichePath.replace(/\.md$/, "")}`,
						record.notes.length && `Notes : ${record.notes.slice(0, 5).map((p) => p.replace(/\.md$/, "").split("/").pop()).join(", ")}${record.notes.length > 5 ? ` (+${record.notes.length - 5})` : ""}`,
						record.summary && (record.summary.length > 220 ? `${record.summary.slice(0, 220)}…` : record.summary),
					];
					for (const line of more) if (line) text.createDiv({ text: line, cls: "legifrance-row-meta" });
				}
				new Setting(this.contentEl)
					.addButton((button) => button.setButtonText("Annuler").onClick(() => this.close()))
					.addButton((button) =>
						button
							.setButtonText("Rapprocher")
							.setCta()
							.onClick(() => {
								answer = main;
								this.close();
							})
					);
			}
			onClose() {
				this.contentEl.empty();
				resolve(answer);
			}
		})(app);
		modal.open();
	});
}
