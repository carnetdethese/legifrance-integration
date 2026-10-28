import { ChevronDown, ChevronRight } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { NoteMentions, decisionMentions } from "references/mentions";
import { DecisionRecord } from "references/timeline";
import { usePlugin } from "views/hooks";
import { Section } from "./Section";

/** Texte d'une ligne dont les plages sont surlignées. */
const Highlighted = ({ text, ranges }: { text: string; ranges: [number, number][] }) => {
	const parts: ReactNode[] = [];
	let from = 0;
	ranges.forEach(([start, end], i) => {
		if (start < from || end > text.length) return;
		parts.push(text.slice(from, start), <span key={i} className="search-result-file-matched-text">{text.slice(start, end)}</span>);
		from = end;
	});
	parts.push(text.slice(from));
	return <>{parts}</>;
};

/** Notes qui citent la décision, avec les lignes concernées, comme les rétroliens d'Obsidian. */
export const Mentions = ({ record, version }: { record: DecisionRecord; version: number }) => {
	const plugin = usePlugin();
	const [notes, setNotes] = useState<NoteMentions[]>();
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	useEffect(() => {
		let current = true;
		void decisionMentions(plugin, record).then((found) => current && setNotes(found));
		return () => {
			current = false;
		};
	}, [plugin, record, version]);

	const open = (path: string, line?: number) => {
		const file = plugin.app.vault.getFileByPath(path);
		if (file) void plugin.app.workspace.getLeaf(false).openFile(file, line === undefined ? undefined : { eState: { line } });
	};
	const toggle = (path: string) =>
		setCollapsed((current) => {
			const next = new Set(current);
			if (!next.delete(path)) next.add(path);
			return next;
		});

	if (record.notes.length === 0) return <Section id="mentions" title="Citée dans" count={0}><div className="setting-item-description">Aucune note.</div></Section>;
	const total = notes?.reduce((sum, n) => sum + Math.max(1, n.mentions.length), 0);
	return (
		<Section id="mentions" title="Citée dans" count={notes ? `${notes.length} note${notes.length > 1 ? "s" : ""} · ${total}` : record.notes.length}>
		<div className="legifrance-mentions">
			{(notes ?? []).map(({ path, mentions }) => {
				const closed = collapsed.has(path);
				return (
					<div key={path} className="tree-item search-result">
						<div className="tree-item-self search-result-file-title is-clickable" onClick={() => toggle(path)}>
							<div className="tree-item-icon collapse-icon">{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</div>
							<div className="tree-item-inner">
								<a
									onClick={(event) => {
										event.stopPropagation();
										open(path);
									}}
									title={path}
								>
									{path.replace(/\.md$/, "").split("/").pop()}
								</a>
							</div>
							<div className="tree-item-flair-outer">
								<span className="tree-item-flair">{mentions.length}</span>
							</div>
						</div>
						{!closed && (
							<div className="search-result-file-matches">
								{mentions.map(({ line, text, ranges }) => (
									<div key={line} className="search-result-file-match tappable" onClick={() => open(path, line)}>
										<Highlighted text={text} ranges={ranges} />
									</div>
								))}
								{mentions.length === 0 && <div className="search-result-file-match">Citation non localisée dans le texte de la note.</div>}
							</div>
						)}
					</div>
				);
			})}
		</div>
		</Section>
	);
};
