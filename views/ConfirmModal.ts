import { App, Modal, Setting } from "obsidian";
import { setDestructive } from "lib/compat";

/** Demande une confirmation avant une action qui modifie de nombreuses notes. */
export function confirmAction(app: App, title: string, message: string): Promise<boolean> {
	return new Promise((resolve) => {
		let answered = false;
		const answer = (value: boolean, modal: Modal) => {
			answered = true;
			resolve(value);
			modal.close();
		};
		const modal = new (class extends Modal {
			onOpen() {
				this.setTitle(title);
				this.contentEl.createEl("p", { text: message });
				new Setting(this.contentEl)
					.addButton((button) => button.setButtonText("Annuler").onClick(() => answer(false, this)))
					.addButton((button) => setDestructive(button.setButtonText("Continuer")).onClick(() => answer(true, this)));
			}
			onClose() {
				this.contentEl.empty();
				if (!answered) resolve(false);
			}
		})(app);
		modal.open();
	});
}
