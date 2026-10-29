/** Test du graphe des citations (construction, filtres, groupes, réglages, animation, simulation de forces). Lancer : `npm test`. */
import { LegalDatabase } from "./database";
import { loadGraphInput } from "./corpus";
import { DEFAULT_GRAPH_SETTINGS, ForceSettings, ForceSimulation, GraphInput, GraphNode, appearanceOrder, buildGraph, isolatedNotes, layoutGraph, matchesQuery, mergeGraphSettings, neighbors, nodeGroup, pivotDecisions } from "./graph";
import { ReferenceIndex } from "./index";
import { THEME_SEPARATOR } from "./themes";
import type { DecisionRecord } from "./timeline";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) { fail++; console.log("ÉCHEC", name, detail); } };

// Trois notes de droit administratif autour de Blanco et Couitéas ; une note isolée sur autre chose.
const input: GraphInput = {
	decisions: [
		{ id: "D1", label: "Blanco", themes: ["Compétence"], date: "1873-02-08", fiche: true, notes: ["cours/admin.md", "td/admin.md", "td/resp.md"] },
		{ id: "D2", label: "Couitéas", themes: ["Responsabilité"], date: "1923-11-30", fiche: false, notes: ["cours/admin.md", "td/resp.md"] },
		{ id: "D3", label: "Autre", themes: ["Contrats"], fiche: false, notes: ["perso/solo.md"] },
		{ id: "D4", label: "Sans note", themes: [], fiche: true, notes: [] },
	],
	decisionArticles: [
		{ decisionId: "D1", key: "article|1240", label: "Code civil, art. 1240", count: 2 },
		{ decisionId: "D2", key: "article|1240", label: "Code civil, art. 1240", count: 1 },
		{ decisionId: "D2", key: "article|1", label: "Code civil, art. 1", count: 1 },
		{ decisionId: "D3", key: "article|solo", label: "Code de commerce, art. L110-1", count: 1 },
	],
	noteArticles: [
		{ note: "cours/admin.md", key: "article|1240", label: "Code civil, art. 1240" },
		{ note: "perso/solo.md", key: "article|solo", label: "Code de commerce, art. L110-1" },
	],
};
const ids = (kind: string, g = buildGraph(input)) => g.nodes.filter((n) => n.kind === kind).map((n) => n.label).sort();

// Analyses sur toute la base.
check("pivots : citées par au moins deux notes, les plus liées d'abord", pivotDecisions(input).map((d) => d.id).join() === "D1,D2", pivotDecisions(input).map((d) => d.id).join());
check("limite des pivots", pivotDecisions(input, 1).length === 1);
check("notes isolées : seule la note qui ne partage rien", isolatedNotes(input).join() === "perso/solo.md", isolatedNotes(input).join());

// Graphe complet.
let g = buildGraph(input);
check("décisions : celles qui ont des liens", ids("decision").join() === "Autre,Blanco,Couitéas", ids("decision").join());
check("notes : celles qui citent (4 notes, dont deux nommées admin)", ids("note").join() === "admin,admin,resp,solo", ids("note").join());
check("articles appliqués", ids("article").length === 3, ids("article").join());
check("liens note-décision", g.edges.filter((e) => e.kind === "cite").length === 6, String(g.edges.filter((e) => e.kind === "cite").length));
check("liens décision-article", g.edges.filter((e) => e.kind === "apply").length === 4);
check("liens orientés : note → décision → article", g.edges.filter((e) => e.kind === "cite").every((e) => e.source.startsWith("note:") && e.target.startsWith("decision:")) && g.edges.filter((e) => e.kind === "apply").every((e) => e.source.startsWith("decision:") && e.target.startsWith("article:")));
check("note → article pour les mentions", buildGraph(input, { mentions: true }).edges.filter((e) => e.kind === "mention").every((e) => e.source.startsWith("note:") && e.target.startsWith("article:")));
check("nœuds : thèmes, date et chemins pour les groupes", g.nodes.find((n) => n.label === "Blanco")!.date === "1873-02-08" && g.nodes.find((n) => n.label === "Blanco")!.themes!.join() === "Compétence" && g.nodes.find((n) => n.label === "Blanco")!.paths!.length === 3 && g.nodes.find((n) => n.label === "solo")!.paths!.join() === "perso/solo.md");
check("pas de lien note-article par défaut", g.edges.every((e) => e.kind !== "mention"));
check("degré = nombre de liens", g.nodes.find((n) => n.label === "Blanco")!.degree === 4, String(g.nodes.find((n) => n.label === "Blanco")!.degree));
check("indicateurs : pivot, fiche, isolée", g.nodes.find((n) => n.label === "Blanco")!.pivot === true && g.nodes.find((n) => n.label === "Blanco")!.fiche === true && g.nodes.find((n) => n.label === "solo")!.isolated === true && !g.nodes.find((n) => n.label === "Autre")!.pivot);
check("tous les liens relient des nœuds présents", g.edges.every((e) => g.nodes.some((n) => n.id === e.source) && g.nodes.some((n) => n.id === e.target)));
check("mentions : liens note-article", buildGraph(input, { mentions: true }).edges.filter((e) => e.kind === "mention").length === 2);

// Filtres.
g = buildGraph(input, { theme: "responsabilite" });
check("thème (sans accents ni casse)", ids("decision", g).join() === "Couitéas", ids("decision", g).join());
check("thème : seules les notes de cette décision", ids("note", g).length === 2 && ids("article", g).length === 2, ids("note", g).join());
g = buildGraph(input, { note: "td/admin.md" });
check("note : ses décisions", ids("decision", g).join() === "Blanco", ids("decision", g).join());
check("note : voisinage (autres notes qui citent Blanco, articles de Blanco)", ids("note", g).length === 3 && ids("article", g).join() === "Code civil, art. 1240", ids("note", g).join() + " / " + ids("article", g).join());
g = buildGraph(input, { maxDecisions: 1 });
check("limite de décisions : la plus liée", ids("decision", g).join() === "Blanco" && g.available.decisions === 3, ids("decision", g).join() + " " + g.available.decisions);
check("limite : pas de lien vers une décision absente", g.edges.every((e) => g.nodes.some((n) => n.id === e.source) && g.nodes.some((n) => n.id === e.target)));
check("sans articles", buildGraph(input, { showArticles: false }).nodes.every((n) => n.kind !== "article"));
check("sans notes", buildGraph(input, { showNotes: false }).nodes.every((n) => n.kind !== "note"));
check("limite d'articles", ids("article", buildGraph(input, { maxArticles: 1 })).join() === "Code civil, art. 1240");
// Recherche, fiches seules, orphelins.
g = buildGraph(input, { search: "blanco" });
check("recherche : une décision par son intitulé", ids("decision", g).join() === "Blanco", ids("decision", g).join());
check("recherche : ses notes et ses articles viennent avec elle", ids("note", g).length === 3 && ids("article", g).join() === "Code civil, art. 1240");
check("recherche : sans accents ni casse", ids("decision", buildGraph(input, { search: "COUITEAS" })).join() === "Couitéas");
check("recherche : par le nom d'une note qui la cite", ids("decision", buildGraph(input, { search: "solo" })).join() === "Autre");
check("recherche : par un article appliqué", ids("decision", buildGraph(input, { search: "1240" })).join() === "Blanco,Couitéas", ids("decision", buildGraph(input, { search: "1240" })).join());
check("recherche : par un numéro d'article collé à sa lettre", ids("decision", buildGraph(input, { search: "L110" })).join() === "Autre");
check("recherche : par la date et le thème", ids("decision", buildGraph(input, { search: "1923" })).join() === "Couitéas" && ids("decision", buildGraph(input, { search: "contrats" })).join() === "Autre");
check("recherche : tous les mots sont requis", buildGraph(input, { search: "blanco couiteas" }).nodes.length === 0);
check("recherche vide ou blanche : tout", buildGraph(input, { search: "  " }).nodes.length === buildGraph(input).nodes.length);
check("recherche : disponible compte les décisions trouvées", buildGraph(input, { search: "1240" }).available.decisions === 2);
check("fiches seules", ids("decision", buildGraph(input, { fichesOnly: true })).join() === "Blanco", ids("decision", buildGraph(input, { fichesOnly: true })).join());
const lonely: GraphInput = { ...input, decisions: [...input.decisions, { id: "D5", label: "Orpheline", themes: [], fiche: false, notes: [] }], decisionArticles: [...input.decisionArticles, { decisionId: "D5", key: "article|9", label: "Code civil, art. 9", count: 1 }] };
check("sans articles, une décision sans note n'a aucun lien", buildGraph(lonely, { showArticles: false }).nodes.find((n) => n.label === "Orpheline")?.degree === 0);
check("orphelins masqués", buildGraph(lonely, { showArticles: false, orphans: false }).nodes.every((n) => n.degree > 0) && buildGraph(lonely, { showArticles: false, orphans: true }).nodes.some((n) => n.degree === 0));
check("orphelins masqués : aucun lien ne pointe vers un nœud absent", (() => { const h = buildGraph(lonely, { showArticles: false, orphans: false }); return h.edges.every((e) => h.nodes.some((n) => n.id === e.source) && h.nodes.some((n) => n.id === e.target)); })());
check("graphe vide", buildGraph({ decisions: [], decisionArticles: [], noteArticles: [] }).nodes.length === 0);
check("thème inconnu : vide", buildGraph(input, { theme: "inconnu" }).nodes.length === 0);

// Disposition.
g = buildGraph(input);
layoutGraph(g.nodes, g.edges, { width: 800, height: 500 });
check("positions finies et dans le cadre", g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.x >= 0 && n.x <= 800 && n.y >= 0 && n.y <= 500));
const again = buildGraph(input);
layoutGraph(again.nodes, again.edges, { width: 800, height: 500 });
check("déterministe", JSON.stringify(g.nodes.map((n) => [n.x, n.y])) === JSON.stringify(again.nodes.map((n) => [n.x, n.y])));
check("nœuds distincts", new Set(g.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`)).size === g.nodes.length);
const dist = (a: string, b: string, h = g) => { const p = h.nodes.find((n) => n.id === a)!, q = h.nodes.find((n) => n.id === b)!; return Math.hypot(p.x - q.x, p.y - q.y); };
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const compact = buildGraph(input);
layoutGraph(compact.nodes, compact.edges, { width: 800, height: 500, forces: { ...DEFAULT_GRAPH_SETTINGS, linkDistance: 60 } });
const linked = compact.edges.map((e) => dist(e.source, e.target, compact));
const all = compact.nodes.flatMap((p, i) => compact.nodes.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
check("liens courts : les nœuds liés sont plus proches que la moyenne", mean(linked) < mean(all) * 0.8, `${mean(linked).toFixed(0)} / ${mean(all).toFixed(0)}`);
check("un seul nœud, aucun nœud", layoutGraph([{ id: "x", kind: "note", label: "x", ref: "x", degree: 0, x: 0, y: 0 }], []).length === 1 && layoutGraph([], []).length === 0);
const big = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, kind: "note" as const, label: `n${i}`, ref: `n${i}`, degree: 0, x: 0, y: 0 }));
const t0 = Date.now();
layoutGraph(big, big.slice(1).map((n, i) => ({ source: big[i].id, target: n.id, kind: "cite" as const, weight: 1 })));
check("300 nœuds en moins de 3 s", Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
check("voisins", [...neighbors(buildGraph(input).edges, "decision:D2")].sort().join() === "article:article|1,article:article|1240,note:cours/admin.md,note:td/resp.md");

// Groupes : requêtes et couleurs.
const node = (kind: GraphNode["kind"], label: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id: `${kind}:${label}`, kind, label, ref: label, degree: 1, x: 0, y: 0, ...extra });
const blanco = node("decision", "Blanco", { themes: ["Compétence"], paths: ["Atlas/Notes/admin.md", "Atlas/Sources/Zotero/td.md"], fiche: true });
const noteTd = node("note", "td", { paths: ["Atlas/Sources/Zotero/td.md"] });
const art = node("article", "Code civil, art. 1240");
check("groupe : type (accents et pluriel tolérés)", matchesQuery(blanco, "type:décision") && matchesQuery(blanco, "type:decision") && !matchesQuery(blanco, "type:note") && matchesQuery(noteTd, "type:notes") && matchesQuery(art, "type:Article"));
check("groupe : thème, sans accents", matchesQuery(blanco, "theme:competence") && !matchesQuery(blanco, "theme:contrats") && !matchesQuery(art, "theme:competence"));
check("groupe : chemin de la note, ou d'une note qui cite la décision", matchesQuery(noteTd, "path:Atlas/Sources") && matchesQuery(blanco, "path:atlas/notes") && !matchesQuery(blanco, "path:Archives") && !matchesQuery(art, "path:Atlas"));
check("groupe : mot de l'intitulé", matchesQuery(blanco, "blanc") && matchesQuery(art, "1240") && !matchesQuery(art, "blanco"));
check("groupe : tous les mots sont requis", matchesQuery(blanco, "type:décision theme:competence blanco") && !matchesQuery(blanco, "type:décision theme:contrats"));
check("groupe : requête vide, incomplète ou sans mot ne retient rien", !matchesQuery(blanco, "") && !matchesQuery(blanco, "   ") && !matchesQuery(blanco, "type:") && !matchesQuery(blanco, "path:") && !matchesQuery(blanco, "theme:"));
check("groupe : le premier qui convient l'emporte", nodeGroup(blanco, [{ query: "type:note", color: "#000000" }, { query: "blanco", color: "#111111" }, { query: "type:décision", color: "#222222" }]) === 1);
check("groupe : aucun", nodeGroup(blanco, [{ query: "type:note", color: "#000000" }]) === -1 && nodeGroup(blanco, []) === -1);
check("groupes par défaut : les trois espèces ont leur couleur", [blanco, noteTd, art].every((n) => nodeGroup(n, DEFAULT_GRAPH_SETTINGS.groups) >= 0));

// Réglages : lecture tolérante.
check("réglages : rien de lu = valeurs par défaut", JSON.stringify(mergeGraphSettings(undefined)) === JSON.stringify(DEFAULT_GRAPH_SETTINGS) && JSON.stringify(mergeGraphSettings("n'importe quoi")) === JSON.stringify(DEFAULT_GRAPH_SETTINGS));
check("réglages : les copies ne partagent pas les groupes par défaut", mergeGraphSettings(undefined).groups !== DEFAULT_GRAPH_SETTINGS.groups);
const merged = mergeGraphSettings({ arrows: true, orphans: "oui", textFade: -99, nodeSize: 2.5, repelForce: Number.NaN, linkDistance: 9999, centerForce: 0, maxDecisions: 100, fichesOnly: true });
check("réglages : valeurs valides gardées", merged.arrows === true && merged.nodeSize === 2.5 && merged.centerForce === 0 && merged.fichesOnly === true, JSON.stringify(merged));
check("réglages : valeurs hors bornes ramenées dedans, valeurs invalides remplacées", merged.textFade === -3 && merged.linkDistance === 500 && merged.repelForce === DEFAULT_GRAPH_SETTINGS.repelForce && merged.orphans === DEFAULT_GRAPH_SETTINGS.orphans);
check("réglages : nombre de décisions ramené à une valeur proposée", merged.maxDecisions === 150 && mergeGraphSettings({ maxDecisions: 100000 }).maxDecisions === 600 && mergeGraphSettings({ maxDecisions: 1 }).maxDecisions === 20);
const groupsMerged = mergeGraphSettings({ groups: [{ query: "a", color: "#ABCDEF" }, { query: "b", color: "rouge" }, { query: 3, color: "#000000" }, null] }).groups;
check("réglages : groupes mal formés écartés, couleur en minuscules", JSON.stringify(groupsMerged) === JSON.stringify([{ query: "a", color: "#abcdef" }]), JSON.stringify(groupsMerged));
check("réglages : aucun groupe, c'est permis", mergeGraphSettings({ groups: [] }).groups.length === 0);

// Animation : ordre d'apparition.
const timeline = buildGraph(input, { mentions: true });
const at = appearanceOrder(timeline.nodes, timeline.edges);
const atOf = (kind: string, label: string) => at.get(timeline.nodes.find((n) => n.kind === kind && n.label === label)!.id)!;
check("animation : chaque nœud a son instant, entre 0 et 1", timeline.nodes.every((n) => at.get(n.id)! > 0 && at.get(n.id)! <= 1));
check("animation : les décisions par date, celles sans date à la fin", atOf("decision", "Blanco") < atOf("decision", "Couitéas") && atOf("decision", "Couitéas") < atOf("decision", "Autre") && atOf("decision", "Autre") === 1);
check("animation : une note ou un article paraît avec sa première décision", atOf("article", "Code civil, art. 1240") === atOf("decision", "Blanco") && atOf("article", "Code civil, art. 1") === atOf("decision", "Couitéas") && atOf("note", "resp") === atOf("decision", "Blanco"));
check("animation : sans décision, tout paraît à la fin", (() => { const only = buildGraph(input, { note: "perso/solo.md" }); return appearanceOrder(only.nodes.filter((n) => n.kind === "note"), []).get("note:perso/solo.md") === 1; })());

// Simulation de forces.
const extent = (nodes: { x: number; y: number }[]) => Math.max(...nodes.map((n) => Math.hypot(n.x, n.y)));
const settle = (nodes: GraphNode[], edges: typeof g.edges, forces: ForceSettings = DEFAULT_GRAPH_SETTINGS, initial?: Map<string, { x: number; y: number }>) => { const sim = new ForceSimulation(nodes, edges, forces, initial); let steps = 0; while (!sim.settled && steps < 2000) { sim.tick(); steps++; } return { sim, steps }; };
const fresh = () => { const h = buildGraph(input); return { nodes: h.nodes, edges: h.edges }; };
const run = (() => { const h = fresh(); return { ...h, ...settle(h.nodes, h.edges) }; })();
check("simulation : s'arrête d'elle-même, en un nombre fini de pas", run.sim.settled && run.steps >= 100 && run.steps < 1000, String(run.steps));
check("simulation : positions finies, recopiées dans les nœuds", run.nodes.every((n, i) => Number.isFinite(n.x) && n.x === run.sim.x[i] && n.y === run.sim.y[i]));
const second = (() => { const h = fresh(); return { ...h, ...settle(h.nodes, h.edges) }; })();
check("simulation : déterministe", JSON.stringify(Array.from(run.sim.x)) === JSON.stringify(Array.from(second.sim.x)));
check("simulation : reheat la relance", (() => { run.sim.reheat(0.5); return !run.sim.settled; })());
const weak = (() => { const h = fresh(); settle(h.nodes, h.edges, { ...DEFAULT_GRAPH_SETTINGS, repelForce: 2 }); return extent(h.nodes); })();
const strong = (() => { const h = fresh(); settle(h.nodes, h.edges, { ...DEFAULT_GRAPH_SETTINGS, repelForce: 18 }); return extent(h.nodes); })();
check("simulation : plus de répulsion, dessin plus large", strong > weak * 1.2, `${weak.toFixed(0)} → ${strong.toFixed(0)}`);
const meanEdge = (h: { nodes: GraphNode[]; edges: typeof g.edges }) => h.edges.reduce((sum, e) => { const a = h.nodes.find((n) => n.id === e.source)!, b = h.nodes.find((n) => n.id === e.target)!; return sum + Math.hypot(a.x - b.x, a.y - b.y); }, 0) / h.edges.length;
const shortLinks = (() => { const h = fresh(); settle(h.nodes, h.edges, { ...DEFAULT_GRAPH_SETTINGS, linkDistance: 60 }); return meanEdge(h); })();
const longLinks = (() => { const h = fresh(); settle(h.nodes, h.edges, { ...DEFAULT_GRAPH_SETTINGS, linkDistance: 400 }); return meanEdge(h); })();
check("simulation : distance des liens plus grande, liens plus longs", longLinks > shortLinks * 1.5, `${shortLinks.toFixed(0)} → ${longLinks.toFixed(0)}`);
const loose = Array.from({ length: 12 }, (_, i) => node("note", `seule ${i}`));
const spread = (centerForce: number) => { const nodes = loose.map((n) => ({ ...n })); settle(nodes, [], { ...DEFAULT_GRAPH_SETTINGS, centerForce }); return extent(nodes); };
check("simulation : la force centrale resserre les nœuds sans lien", spread(1) < spread(0) * 0.8 && Number.isFinite(spread(0)), `${spread(0).toFixed(0)} → ${spread(1).toFixed(0)}`);
check("simulation : sans aucune force, rien n'explose", (() => { const h = fresh(); const { sim } = settle(h.nodes, h.edges, { centerForce: 0, repelForce: 0, linkForce: 0, linkDistance: 30 }); return sim.x.every(Number.isFinite); })());
check("simulation : forces extrêmes bornées", (() => { const h = fresh(); const { sim } = settle(h.nodes, h.edges, { centerForce: 1, repelForce: 20, linkForce: 1, linkDistance: 500 }); return sim.x.every(Number.isFinite) && sim.y.every(Number.isFinite); })());
check("simulation : un nœud retenu ne bouge pas, un nœud relâché repart", (() => {
	const h = fresh(); const sim = new ForceSimulation(h.nodes, h.edges, DEFAULT_GRAPH_SETTINGS); sim.pin(0, 5, -7);
	for (let i = 0; i < 50; i++) sim.tick();
	const held = sim.x[0] === 5 && sim.y[0] === -7;
	sim.release(0); for (let i = 0; i < 50; i++) sim.tick();
	return held && (sim.x[0] !== 5 || sim.y[0] !== -7);
})());
check("simulation : les positions connues sont reprises, les autres arrivent près de leurs voisins", (() => {
	const h = fresh(); const known = new Map(h.nodes.filter((n) => n.kind !== "article").map((n, i) => [n.id, { x: i * 10, y: i * -10 }]));
	const sim = new ForceSimulation(h.nodes, h.edges, DEFAULT_GRAPH_SETTINGS, known);
	const kept = h.nodes.every((n, i) => !known.has(n.id) || (sim.x[i] === known.get(n.id)!.x && sim.y[i] === known.get(n.id)!.y));
	const newcomers = h.nodes.map((n, i) => ({ n, i })).filter(({ n }) => !known.has(n.id));
	const close = newcomers.every(({ i }) => sim.adjacency[i].some((j) => Math.hypot(sim.x[i] - sim.x[j], sim.y[i] - sim.y[j]) <= DEFAULT_GRAPH_SETTINGS.linkDistance * 0.5 + 1));
	return kept && newcomers.length > 0 && close;
})());
check("simulation : snapshot", (() => { const h = fresh(); const sim = new ForceSimulation(h.nodes, h.edges, DEFAULT_GRAPH_SETTINGS); const snap = sim.snapshot(); return snap.size === h.nodes.length && snap.get(h.nodes[2].id)!.x === sim.x[2]; })());
check("simulation : un nœud écarté ne bouge pas, une fois révélé il paraît près de ses voisins", (() => {
	const h = fresh(); const sim = new ForceSimulation(h.nodes, h.edges, DEFAULT_GRAPH_SETTINGS);
	for (let i = 0; i < h.nodes.length; i++) sim.setActive(i, false);
	const first = h.nodes.findIndex((n) => n.kind === "decision"); sim.reveal(first);
	const idle = h.nodes.map((_, i) => [sim.x[i], sim.y[i]]);
	for (let i = 0; i < 20; i++) sim.tick();
	const stayed = h.nodes.every((_, i) => i === first || (sim.x[i] === idle[i][0] && sim.y[i] === idle[i][1]));
	const neighbour = sim.adjacency[first][0]; sim.reveal(neighbour);
	const near = Math.hypot(sim.x[neighbour] - sim.x[first], sim.y[neighbour] - sim.y[first]) <= DEFAULT_GRAPH_SETTINGS.linkDistance * 0.4 + 1;
	return stayed && near && sim.active[neighbour] === 1;
})());
check("simulation : le dessin d'un seul coup (layoutGraph) tient dans le cadre, quelles que soient les forces", (() => { const h = fresh(); layoutGraph(h.nodes, h.edges, { width: 600, height: 400, forces: { ...DEFAULT_GRAPH_SETTINGS, linkDistance: 80, repelForce: 1 } }); return h.nodes.every((n) => n.x >= 0 && n.x <= 600 && n.y >= 0 && n.y <= 400); })());
const crowd = Array.from({ length: 800 }, (_, i) => ({ id: `c${i}`, kind: "note" as const, label: `c${i}`, ref: `c${i}`, degree: 0, x: 0, y: 0 }));
const crowdEdges = crowd.slice(1).map((n, i) => ({ source: crowd[Math.floor(i / 3)].id, target: n.id, kind: "cite" as const, weight: 1 }));
const crowdStart = Date.now();
const crowdSim = new ForceSimulation(crowd, crowdEdges, DEFAULT_GRAPH_SETTINGS);
for (let i = 0; i < 20; i++) crowdSim.tick();
check("800 nœuds : 20 pas en moins de 2 s (de quoi tenir 60 images par seconde)", Date.now() - crowdStart < 2000, `${Date.now() - crowdStart} ms`);

// Lecture dans la base : décision citée de deux façons = un seul nœud ; articles des notes.
(async () => {
	const index = new ReferenceIndex(await LegalDatabase.open(undefined, () => undefined));
	const { db } = index;
	db.run("INSERT INTO refs (key, kind, label, query, data) VALUES ('article|1240', 'article', 'Code civil, art. 1240', '', '{}'), ('eu|celex=1|number=32', 'eu', 'RGPD, art. 32', '', '{}'), ('decision|x', 'decision', 'CE, n° 1', '', '{}')");
	db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES ('a.md', 'article|1240', 0, 1), ('a.md', 'eu|celex=1|number=32', 1, 1), ('a.md', 'decision|x', 2, 1)");
	db.run("INSERT INTO decision_articles (decision_id, article_key, label, count) VALUES ('CETATEXT1', 'article|1240', 'Code civil, art. 1240', 3), ('CETATEXT1bis', 'article|1240', 'Code civil, art. 1240', 1), ('INCONNU', 'article|1', 'Code civil, art. 1', 1)");
	const record = { id: "CETATEXT1", label: "CE, n° 1", themes: [`Responsabilité${THEME_SEPARATOR}Faute`, `Responsabilité${THEME_SEPARATOR}Risque`], complete: true, notes: ["a.md"], members: ["CETATEXT1", "CETATEXT1bis", "decision|x"], name: "Couitéas", fichePath: "f.md" } as DecisionRecord;
	const loaded = loadGraphInput(index, [record]);
	check("décision : nom, thème de plus haut niveau (sans doublon), fiche", JSON.stringify(loaded.decisions) === JSON.stringify([{ id: "CETATEXT1", label: "Couitéas", themes: ["Responsabilité"], fiche: true, notes: ["a.md"] }]), JSON.stringify(loaded.decisions));
check("décision : sa date, pour l'animation", loadGraphInput(index, [{ ...record, date: "1923-11-30" }]).decisions[0].date === "1923-11-30");
	check("articles visés rattachés à la décision regroupée, sans doublon, décision inconnue ignorée", loaded.decisionArticles.length === 1 && loaded.decisionArticles[0].count === 3, JSON.stringify(loaded.decisionArticles));
	check("articles écrits dans les notes : codes et droit de l'Union, pas les décisions", loaded.noteArticles.map((a) => a.key).sort().join() === "article|1240,eu|celex=1|number=32", JSON.stringify(loaded.noteArticles));

	console.log(fail ? `${fail} échec(s)` : "tout passe");
	process.exit(fail ? 1 : 0);
})();
