import * as Handlebars from "handlebars";
import { App, Notice, normalizePath } from "obsidian";
import { LegalDocument } from "abstracts/document";
import { removeTags } from "lib/tools";
import { solutionFromTitle } from "references/themes";
import { LegifranceSettings } from "settings/settings";

/**
 * Dossier de destination : `dossierBase`, suivi de la juridiction pour la
 * jurisprudence.
 */
function targetFolder(data: LegalDocument, dossierBase: string) {
	return normalizePath(
		data.type == "jurisprudence" && data.juridiction
			? `${dossierBase}/${data.juridiction}`
			: dossierBase
	);
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

/** Compile un gabarit Handlebars (sans échappement HTML) et l'applique à `data`. */
function render(template: string, data: LegalDocument) {
	return Handlebars.compile(template, { noEscape: true })(templateContext(data));
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
	data: LegalDocument
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
