import { Modal, ProgressBarComponent, Setting } from "obsidian";

export class WaitModal extends Modal {
    onOpen() {
        const {contentEl} = this;
		contentEl.createEl("h1", { text: "Recherche..." });

        contentEl.createEl('div', { cls: 'loading-spinner' });

        // Add custom CSS for the loading spinner (optional)
        const style = document.createElement('style');
        style.textContent = `
            .loading-spinner {
                width: 30px;
                height: 30px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}