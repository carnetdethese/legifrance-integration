/** Test de la recherche dans les textes (accents, casse, mots multiples, extraits). Lancer : `npm test`. */
import { LegalDatabase } from "./database";
import { ReferenceIndex } from "./index";
import { foldText, searchTerms, searchTexts, snippetsFor } from "./textSearch";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) { fail++; console.log("ÉCHEC", name, detail); } };

(async () => {
	// Réduction du texte.
	check("accents et casse", foldText("RESPONSABILITÉ du Fait des Produits") === "responsabilite du fait des produits");
	check("apostrophe typographique et insécable", foldText("l’État :") === "l'etat :");
	check("longueur conservée", foldText("Œuvre ÇÀ l’ÉTÉ").length === "Œuvre ÇÀ l’ÉTÉ".length);
	check("mots et expressions", JSON.stringify(searchTerms('Responsabilité "fait des produits" a')) === JSON.stringify(["responsabilite", "fait des produits"]), JSON.stringify(searchTerms('Responsabilité "fait des produits" a')));
	check("requête vide", searchTerms("  ").length === 0);

	// Extraits : surlignage du mot trouvé, contexte coupé avec des points de suspension.
	const long = `${"Lorem ipsum ".repeat(30)}La responsabilité de l'État est engagée.${" dolor sit".repeat(30)}`;
	const snippets = snippetsFor(long, ["responsabilite"]);
	check("un extrait", snippets.length === 1, String(snippets.length));
	check("mot surligné avec sa graphie d'origine", snippets[0].some((p) => p.hit && p.text === "responsabilité"), JSON.stringify(snippets[0]));
	check("contexte tronqué", snippets[0][0].text.startsWith("…") && snippets[0][snippets[0].length - 1].text.endsWith("…"));
	check("deux occurrences éloignées : deux extraits", snippetsFor(`${"a ".repeat(200)}tutu${" b".repeat(200)} tutu`, ["tutu"]).length === 2);
	check("deux occurrences proches : un seul extrait, deux mots surlignés", (() => { const s = snippetsFor("le chat et le chat dorment", ["chat"]); return s.length === 1 && s[0].filter((p) => p.hit).length === 2; })());
	check("Markdown aplati", !snippetsFor("**Le** principe\n\n> de _précaution_ s'applique", ["precaution"])[0].map((p) => p.text).join("").match(/[*_>\n]/));

	// Base synthétique.
	const index = new ReferenceIndex(await LegalDatabase.open(undefined, () => undefined));
	const { db } = index;
	const decision = (key: string, id: string, title: string, date: string, text: string, status = "complete") =>
		db.run("INSERT INTO decisions (ref_key, status, legifrance_id, title, court, number, date, text_markdown) VALUES (?, ?, ?, ?, 'ce', '1', ?, ?)", [key, status, id, title, date, text]);
	decision("k1", "CETATEXT1", "CE, 1923, Couitéas", "1923-11-30", "Le refus de concours de la force publique engage la RESPONSABILITÉ de l'État.");
	decision("k1bis", "CETATEXT1", "CE, 1923, Couitéas", "1923-11-30", "Le refus de concours de la force publique engage la RESPONSABILITÉ de l'État."); // même décision, deux citations
	decision("k2", "CETATEXT2", "CE, 1999, Autre", "1999-01-01", "La responsabilité n'est pas engagée sans faute.");
	decision("k3", "CETATEXT3", "CE, 2005, Sans texte", "2005-01-01", "Responsabilité.", "pending");
	db.run("INSERT INTO links (ref_key, url, title, text, resolved_at, status) VALUES ('a', 'https://exemple/codes/article_lc/LEGIARTI000032041571', 'Code civil, art. 1240', 'Tout fait quelconque de l''homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.', 1, 'VIGUEUR')");
	db.run("INSERT INTO documents (id, title, text_markdown, fetched_at) VALUES ('DOC1', 'Arrêt consulté', 'Une question de responsabilité civile.', 1)");

	// Régression : `export()` (enregistrement du fichier) efface les fonctions SQL ; la recherche doit survivre à une sauvegarde.
	db.export();
	db.export();

	let result = searchTexts(index, "responsabilité");
	check("accents : trouve avec et sans", searchTexts(index, "responsabilite").total === result.total);
	check("décisions complètes uniquement, sans doublon, plus récentes d'abord", result.hits.filter((h) => h.kind === "decision").map((h) => h.id).join() === "CETATEXT2,CETATEXT1", result.hits.map((h) => h.id).join());
	check("documents consultés aussi", result.total === 3 && result.hits.some((h) => h.kind === "document"), String(result.total));
	result = searchTexts(index, "responsabilité état");
	check("tous les mots requis", result.total === 1 && result.hits[0].id === "CETATEXT1", JSON.stringify(result.hits.map((h) => h.id)));
	check("expression exacte", searchTexts(index, '"force publique"').total === 1 && searchTexts(index, '"publique force"').total === 0);
	check("portée : décisions", searchTexts(index, "responsabilité", { scope: "decisions" }).total === 2);
	check("portée : articles", searchTexts(index, "fait quelconque", { scope: "articles" }).hits[0]?.id === "LEGIARTI000032041571", JSON.stringify(searchTexts(index, "fait quelconque", { scope: "articles" }).hits[0]));
	check("portée : documents", searchTexts(index, "responsabilité", { scope: "documents" }).hits.map((h) => h.id).join() === "DOC1");
	check("extraits fournis", result.hits[0].snippets.length === 1 && result.hits[0].snippets[0].some((p) => p.hit));
	check("pagination", searchTexts(index, "responsabilité", { limit: 1, offset: 1 }).hits.length === 1 && searchTexts(index, "responsabilité", { limit: 1, offset: 1 }).total === 3);
	check("aucun résultat", searchTexts(index, "inexistant").total === 0);
	check("requête vide", searchTexts(index, " a ").total === 0);

	console.log(fail ? `${fail} échec(s)` : "tout passe");
	process.exit(fail ? 1 : 0);
})();
