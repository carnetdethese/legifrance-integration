import { sanitizeHTMLToDom } from "obsidian";

/**
 * HTML venu de l'API (extraits de recherche, titres) sans script, gestionnaire d'événement ni lien `javascript:` : il
 * s'affiche dans l'application, qui n'est pas un navigateur cloisonné. Garde les balises de mise en forme (`<mark>`…).
 */
export function sanitizeHtml(html: string) {
	const holder = createDiv();
	holder.appendChild(sanitizeHTMLToDom(html));
	return holder.innerHTML;
}
