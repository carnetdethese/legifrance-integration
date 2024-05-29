import { App, Modal } from "obsidian";

export class PopUpModal extends Modal {
    message: string;

    constructor(app:App, message:string) {
        super(app);
        this.message = message;
    }

    onOpen(): void {
        const {contentEl} = this;
        contentEl.createEl("strong", { text: this.message});
    }
}