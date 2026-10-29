import type { ButtonComponent } from "obsidian";

/**
 * Marque un bouton comme destructeur : `setDestructive` depuis Obsidian 1.13 ; avant, l'ancien `setWarning` ne
 * faisait qu'ajouter cette classe (appelé ici directement, il serait signalé comme déprécié).
 */
export function setDestructive(button: ButtonComponent) {
	if (typeof button.setDestructive === "function") return button.setDestructive();
	button.buttonEl.addClass("mod-warning");
	return button;
}
