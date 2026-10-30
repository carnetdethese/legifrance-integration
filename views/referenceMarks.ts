/**
 * Repère les références juridiques dans le texte des notes (« art. 226-17 C. pén. », « Cass. civ. 1re, 3 mars 2020 »…) par un
 * soulignement discret en pointillés : dans l'éditeur (extension CodeMirror, sur la partie visible) et en mode lecture
 * (post-processeur). Le texte de la note n'est jamais modifié : ce ne sont que des marques d'affichage. Le survol
 * (`LinkPreview`) montre ce que la base sait de la référence ; Cmd/Ctrl + clic l'ouvre.
 */
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type LegifrancePlugin from "main";
import { citationSpans } from "references/parser";
import { rememberRef } from "references/refRegistry";

/** Texte d'une note sans son bandeau de propriétés (le YAML n'est pas du texte à repérer). */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/** Extension de l'éditeur (aperçu en direct et mode source) : marque les références des lignes visibles. */
export function referenceMarks(plugin: LegifrancePlugin) {
	function build(view: EditorView): DecorationSet {
		if (!plugin.settings.markReferences) return Decoration.none;
		const { doc } = view.state;
		const frontmatterEnd = FRONTMATTER.exec(doc.sliceString(0, Math.min(doc.length, 6000)))?.[0].length ?? 0;
		const builder = new RangeSetBuilder<Decoration>();
		let last = -1;
		for (const range of view.visibleRanges) {
			const start = doc.lineAt(range.from).from;
			const text = doc.sliceString(start, doc.lineAt(range.to).to);
			let previous: [number, number] | undefined;
			for (const span of citationSpans(text)) {
				const from = start + span.start;
				const to = start + span.end;
				// Plusieurs références d'une même plage (« art. 1240 et 1241 ») : une seule marque ; jamais deux plages qui se chevauchent d'une zone visible à l'autre.
				if (from < frontmatterEnd || from < last || (previous && previous[0] === span.start && previous[1] === span.end)) continue;
				rememberRef(span.ref);
				builder.add(from, to, Decoration.mark({ class: "legifrance-cite", attributes: { "data-lf-key": span.ref.key } }));
				previous = [span.start, span.end];
				last = to;
			}
		}
		return builder.finish();
	}

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = build(view);
			}
			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) this.decorations = build(update.view);
			}
		},
		{ decorations: (value) => value.decorations }
	);
}

/** Textes à ne pas marquer : liens, code, formules, ce qui est déjà marqué. */
const SKIPPED = "a, code, pre, .math, .frontmatter, .legifrance-cite";

/** Mode lecture : marque les références de chaque bloc rendu (un nœud de texte à la fois : une citation coupée par une mise en forme n'est pas repérée). */
export function markReferencesIn(plugin: LegifrancePlugin, root: HTMLElement) {
	if (!plugin.settings.markReferences) return;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) => (node.parentElement?.closest(SKIPPED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
	});
	const nodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);

	for (const node of nodes) {
		const spans = citationSpans(node.data);
		// De la fin vers le début : couper un nœud ne décale pas les plages qui précèdent.
		let limit = node.data.length;
		for (const span of spans.reverse()) {
			if (span.end > limit) continue;
			rememberRef(span.ref);
			const range = document.createRange();
			range.setStart(node, span.start);
			range.setEnd(node, span.end);
			const mark = createSpan({ cls: "legifrance-cite" });
			mark.dataset.lfKey = span.ref.key;
			range.surroundContents(mark);
			limit = span.start;
		}
	}
}
