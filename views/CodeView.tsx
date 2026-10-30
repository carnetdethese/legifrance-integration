/**
 * Onglet de lecture d'un code ou d'un texte consolidé par sa table des matières. L'état de l'onglet (texte, article
 * à montrer) est restauré par Obsidian au redémarrage ; il n'est lu qu'après vérification de l'identifiant.
 */
import { ViewStateResult } from "obsidian";
import { ReactNode } from "react";
import { isTextId } from "abstracts/legislation";
import { CodeToc } from "./components/code/CodeToc";
import { ReactItemView } from "./ReactItemView";

export const CODE_VIEW = "code-view";

interface CodeState extends Record<string, unknown> {
	textId?: string;
	title?: string;
	/** Identifiant chronologique (`cid`) de l'article à montrer. */
	focus?: string;
	/** Identifiant (`LEGISCTA…`) de la section à ouvrir. */
	section?: string;
}

export class CodeView extends ReactItemView {
	textId?: string;
	private title?: string;
	private focus?: string;
	private section?: string;

	getViewType() {
		return CODE_VIEW;
	}

	getDisplayText() {
		return this.title ?? "Code";
	}

	getIcon() {
		return "library";
	}

	getState(): CodeState {
		return { textId: this.textId, title: this.title, focus: this.focus, section: this.section };
	}

	async setState(state: CodeState, result: ViewStateResult) {
		this.textId = isTextId(state?.textId) ? state.textId : undefined;
		this.title = typeof state?.title === "string" ? state.title.slice(0, 200) : undefined;
		this.focus = typeof state?.focus === "string" ? state.focus : undefined;
		this.section = typeof state?.section === "string" ? state.section : undefined;
		await super.setState(state, result);
		this.update();
	}

	protected contentClasses() {
		return ["is-code"];
	}

	protected renderContent(): ReactNode {
		return this.textId ? <CodeToc key={this.textId} textId={this.textId} title={this.title} focus={this.focus} section={this.section} /> : <p className="legifrance-empty">Aucun texte à afficher.</p>;
	}
}
