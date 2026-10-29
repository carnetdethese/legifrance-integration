import * as Handlebars from "handlebars";
import { App, Notice, normalizePath } from "obsidian";
import { LegalDocument } from "abstracts/document";
import { safeName, safePath, withoutSeparators } from "lib/paths";
import { removeTags } from "lib/tools";
import { solutionFromTitle } from "references/themes";
import { LegifranceSettings } from "settings/settings";

/**
 * Dossier de destination : `dossierBase`, suivi de la juridiction pour la jurisprudence. Chaque segment est
 * nettoyé (jamais de `..`) : la note reste dans le coffre, quoi que contiennent les réglages ou l'API.
 */
function targetFolder(data: LegalDocument, dossierBase: string) {
	const court = data.type == "jurisprudence" && data.juridiction ? safeName(data.juridiction) : "";
	return normalizePath([safePath(dossierBase), court].filter(Boolean).join("/") || "/");
}

/**
 * Variables du modèle : les champs du document, plus des alias lisibles. `{{solution}}` reprend la
 * solution (champ `abstract` des décisions issues d'une recherche, ou fin du titre d'une décision du
 * Conseil constitutionnel) ; `{{court}}` et `{{number}}` sont ceux de `juridiction` et `numero`.
 */
export function templateContext(data: LegalDocument) {
	return {
		...data,
		solution: data.solution ?? data.abstract ?? solutionFromTitle(removeTags(data.titre)),
		court: data.juridiction,
		number: data.numero,
		title: removeTags(data.titre),
	};
}

/**
 * Compile un gabarit Handlebars (sans échappement HTML) et l'applique à `data`.
 * @param forFileName les `/` des valeurs deviennent des tirets : un titre « 3/4/2020 » ne crée pas de dossiers
 */
function render(template: string, data: LegalDocument, forFileName = false) {
	const context: Record<string, unknown> = templateContext(data);
	if (forFileName) for (const [key, value] of Object.entries(context)) if (typeof value === "string") context[key] = withoutSeparators(value);
	return Handlebars.compile(template, { noEscape: true })(context);
}

/**
 * Crée dans le coffre la note d'un document à partir du modèle des réglages,
 * puis l'ouvre dans un nouvel onglet.
 *
 * Le titre saisi par l'utilisateur (`titreNote`) prime sur le modèle de nom de
 * fichier ; un fichier existant n'est jamais écrasé, et le chemin est nettoyé (voir `lib/paths.ts`).
 */
export async function createNote(
	app: App,
	settings: LegifranceSettings,
	data: LegalDocument
) {
	const folder = targetFolder(data, settings.dossierBase);
	// Un titre saisi est un nom ; le modèle peut, lui, prévoir des sous-dossiers (« {{juridiction}}/{{id}} »).
	const title = (data.titreNote?.trim() && safeName(data.titreNote)) || safePath(render(settings.fileTitle, data, true)) || safeName(data.id) || "Note";

	let path = normalizePath(`${folder}/${title}.md`);
	if (app.vault.getFileByPath(path)) {
		path = normalizePath(`${folder}/${title}-${Date.now()}.md`);
	}
	const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
	if (parent && !app.vault.getFolderByPath(parent)) {
		await app.vault.createFolder(parent);
	}

	const file = await app.vault.create(path, render(settings.templateAll, data));
	await app.workspace.getLeaf("tab").openFile(file);
	new Notice(`Note créée : ${file.path}`);
}
