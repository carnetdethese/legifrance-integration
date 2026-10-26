import * as Handlebars from "handlebars";
import { App, Notice, normalizePath } from "obsidian";
import { legalDocument } from "abstracts/document";
import { LegifranceSettings } from "settings/settings";

/**
 * Dossier de destination : `dossierBase`, suivi de la juridiction pour la
 * jurisprudence.
 */
function targetFolder(data: legalDocument, dossierBase: string) {
	return normalizePath(
		data.type == "jurisprudence" && data.juridiction
			? `${dossierBase}/${data.juridiction}`
			: dossierBase
	);
}

/** Compile un gabarit Handlebars (sans échappement HTML) et l'applique à `data`. */
function render(template: string, data: legalDocument) {
	return Handlebars.compile(template, { noEscape: true })(data);
}

/**
 * Crée dans le coffre la note d'un document à partir du modèle des réglages,
 * puis l'ouvre dans un nouvel onglet.
 *
 * Le titre saisi par l'utilisateur (`titreNote`) prime sur le modèle de nom de
 * fichier ; un fichier existant n'est jamais écrasé.
 */
export async function createNote(
	app: App,
	settings: LegifranceSettings,
	data: legalDocument
) {
	const folder = targetFolder(data, settings.dossierBase);
	const title =
		data.titreNote?.trim() || render(settings.fileTitle, data);

	if (!app.vault.getFolderByPath(folder)) {
		await app.vault.createFolder(folder);
	}

	let path = normalizePath(`${folder}/${title}.md`);
	if (app.vault.getFileByPath(path)) {
		path = normalizePath(`${folder}/${title}-${Date.now()}.md`);
	}

	const file = await app.vault.create(path, render(settings.templateAll, data));
	await app.workspace.getLeaf("tab").openFile(file);
	new Notice(`Note créée : ${file.path}`);
}
