/** Tests de la table des matières et du contexte d'un article. Lancer : `npm test`. */
import { decodeEntities } from "lib/tools";
import { ancestorsOf, articleSpan, articlesOf, filterToc, follow, parseArticleContext, parseToc, pathToSection } from "./toc";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

const article = (id: string, cid: string, num: string, order: number, etat = "VIGUEUR") => ({ id, cid, num, intOrdre: order, etat });
const response = {
	id: "LEGITEXT000006070719_10-03-2024",
	title: "Code pénal",
	etat: "VIGUEUR",
	sections: [
		{
			id: "S2", title: "Livre II : Des crimes et <b>délits</b>", intOrdre: 20, sections: [], articles: [article("A3", "C3", "226-17", 2), article("A2", "C2", "226-13", 1), article("A4", "C4", "226-18", 3, "ABROGE")],
		},
		{ id: "S1", title: "Livre I", intOrdre: 10, sections: [], articles: [article("A1", "C1", "111-1", 1)] },
	],
	articles: [],
};

const toc = parseToc(response)!;
eq("identifiant sans suffixe", toc.id, "LEGITEXT000006070719");
eq("ordre des sections", toc.root.children.map((c) => (c.kind === "section" ? c.title : "")), ["Livre I", "Livre II : Des crimes et délits"]);
eq("ordre des articles", toc.articles.map((a) => a.num), ["111-1", "226-13", "226-17", "226-18"]);
eq("réponse invalide", parseToc("x"), null);
eq("réponse sans identifiant", parseToc({ title: "x" }), null);
eq("articles d'une section", articlesOf(toc.root).length, 4);
eq("sections de l'article", ancestorsOf(toc.root, "C3"), ["LEGITEXT000006070719", "S2"]);
eq("article absent", ancestorsOf(toc.root, "ZZ"), []);

eq("étendue", articleSpan(toc.root.children[1] as never), { count: 3, range: "art. 226-13 à 226-18" });
eq("un seul article", articleSpan(toc.root.children[0] as never), { count: 1, range: "art. 111-1" });
eq("section vide", articleSpan({ ...toc.root, children: [] }), { count: 0, range: "" });
eq("chemin d'une section", pathToSection(toc.root, "S2"), ["S2"]);
eq("section absente", pathToSection(toc.root, "ZZ"), null);
eq("suivre un chemin", follow(toc.root, ["S2"])!.map((s) => s.id), ["S2"]);
eq("chemin périmé", follow(toc.root, ["ZZ"]), null);
eq("chemin vide", follow(toc.root, []), []);
const nested = { ...toc.root, children: [{ kind: "section" as const, id: "P", title: "Partie", status: "", children: [toc.root.children[0]] }] };
eq("chemin profond", pathToSection(nested, "S2") ?? pathToSection(nested, "S1"), ["P", "S1"]);

const nums = (result: ReturnType<typeof filterToc>) => articlesOf(result.root).map((a) => a.num);
eq("filtre par numéro", nums(filterToc(toc.root, "226-1")), ["226-13", "226-17", "226-18"]);
eq("filtre sans point ni espace", nums(filterToc(toc.root, "226-17")), ["226-17"]);
eq("numéro à lettre", nums(filterToc({ ...toc.root, children: [{ kind: "article", id: "X", cid: "X", num: "L121-6", status: "" }] }, "l. 121-6")), ["L121-6"]);
eq("filtre par titre", nums(filterToc(toc.root, "livre ii")), ["226-13", "226-17", "226-18"]);
eq("titre sans accent", nums(filterToc(toc.root, "delits")), ["226-13", "226-17", "226-18"]);
eq("rien", nums(filterToc(toc.root, "zzz")), []);
const limited = filterToc(toc.root, "226", 2);
eq("limite", [limited.count, limited.truncated], [2, true]);

const context = parseArticleContext({
	article: {
		id: "LEGIARTI000037825504", cid: "LEGIARTI000006417962", num: "226-17", etat: "VIGUEUR",
		context: { titreTxt: [{ cid: "LEGITEXT000006070719", titre: "Code pénal" }], titresTM: [{ id: "LEGISCTA1", titre: "Partie législative" }, { id: "LEGISCTA2", titre: "Livre II &gt; Des crimes" }] },
		articleVersions: [{ id: "V1", etat: "MODIFIE", dateDebut: 762480000000, dateFin: 1559347200000 }, { id: "V2", etat: "VIGUEUR", dateDebut: 1559347200000, dateFin: 32472144000000 }],
	},
})!;
eq("contexte", [context.textId, context.textTitle, context.cid, context.versions.length], ["LEGITEXT000006070719", "Code pénal", "LEGIARTI000006417962", 2]);
eq("sections de l'article", context.sections, [{ id: "LEGISCTA1", title: "Partie législative" }, { id: "LEGISCTA2", title: "Livre II > Des crimes" }]);
eq("entités", decodeEntities("A &gt; B &amp;amp; &#39;c&#39; &eacute; &#x41;"), "A > B &amp; 'c' &eacute; A");
eq("texte non consolidé", parseArticleContext({ article: { id: "JORFARTI000000000001", context: { titreTxt: [{ cid: "JORFTEXT000000888309" }] } } })!.textId, undefined);
eq("contexte invalide", parseArticleContext({}), null);

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("table des matières : tous les tests passent");
