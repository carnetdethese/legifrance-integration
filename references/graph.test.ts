/** Test du graphe des citations (construction, filtres, pivots, notes isolées, disposition). Lancer : `npm test`. */
import { LegalDatabase } from "./database";
import { loadGraphInput } from "./corpus";
import { GraphInput, buildGraph, isolatedNotes, layoutGraph, neighbors, pivotDecisions } from "./graph";
import { ReferenceIndex } from "./index";
import { THEME_SEPARATOR } from "./themes";
import type { DecisionRecord } from "./timeline";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) { fail++; console.log("ÉCHEC", name, detail); } };

// Trois notes de droit administratif autour de Blanco et Couitéas ; une note isolée sur autre chose.
const input: GraphInput = {
	decisions: [
		{ id: "D1", label: "Blanco", themes: ["Compétence"], fiche: true, notes: ["cours/admin.md", "td/admin.md", "td/resp.md"] },
		{ id: "D2", label: "Couitéas", themes: ["Responsabilité"], fiche: false, notes: ["cours/admin.md", "td/resp.md"] },
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
const dist = (a: string, b: string) => { const p = g.nodes.find((n) => n.id === a)!, q = g.nodes.find((n) => n.id === b)!; return Math.hypot(p.x - q.x, p.y - q.y); };
const linked = g.edges.map((e) => dist(e.source, e.target));
const all = g.nodes.flatMap((p, i) => g.nodes.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
check("les nœuds liés sont plus proches que la moyenne", linked.reduce((a, b) => a + b, 0) / linked.length < all.reduce((a, b) => a + b, 0) / all.length);
check("un seul nœud, aucun nœud", layoutGraph([{ id: "x", kind: "note", label: "x", ref: "x", degree: 0, x: 0, y: 0 }], []).length === 1 && layoutGraph([], []).length === 0);
const big = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, kind: "note" as const, label: `n${i}`, ref: `n${i}`, degree: 0, x: 0, y: 0 }));
const t0 = Date.now();
layoutGraph(big, big.slice(1).map((n, i) => ({ source: big[i].id, target: n.id, kind: "cite" as const, weight: 1 })));
check("300 nœuds en moins de 3 s", Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
check("voisins", [...neighbors(buildGraph(input).edges, "decision:D2")].sort().join() === "article:article|1,article:article|1240,note:cours/admin.md,note:td/resp.md");

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
	check("articles visés rattachés à la décision regroupée, sans doublon, décision inconnue ignorée", loaded.decisionArticles.length === 1 && loaded.decisionArticles[0].count === 3, JSON.stringify(loaded.decisionArticles));
	check("articles écrits dans les notes : codes et droit de l'Union, pas les décisions", loaded.noteArticles.map((a) => a.key).sort().join() === "article|1240,eu|celex=1|number=32", JSON.stringify(loaded.noteArticles));

	console.log(fail ? `${fail} échec(s)` : "tout passe");
	process.exit(fail ? 1 : 0);
})();
