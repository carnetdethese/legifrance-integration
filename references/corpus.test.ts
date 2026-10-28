/** Tests de la lecture des articles dans la base (pagination, filtre, statuts). Lancer : `npm test`. */
import { LegalDatabase } from "./database";
import { ReferenceIndex } from "./index";
import { articleByKey, articleExcerpts, articlePage, articleTexts, articlesByDecision, citedTexts, excerptFor, staleArticles, statusLabel } from "./corpus";
import { parseCitations } from "./parser";
import type { DecisionRecord } from "./timeline";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) { fail++; console.log("ÉCHEC", name, detail); } };

(async () => {
	const index = new ReferenceIndex(await LegalDatabase.open(undefined, () => undefined));
	const { db } = index;

	// 1 200 articles visés par des décisions : le plafond de 500 n'existe plus.
	db.transaction(() => {
		for (let i = 1; i <= 1200; i++) {
			// L'article n appliqué par (n % 7) + 1 décisions, pour avoir un classement.
			for (let d = 0; d <= i % 7; d++) db.run("INSERT INTO decision_articles (decision_id, article_key, label, count) VALUES (?, ?, ?, 1)", [`D${d}`, `article|${i}`, `art. ${i} C. civ.`]);
		}
		db.run("INSERT INTO decision_articles (decision_id, article_key, label, count) VALUES ('D0', 'article|x', 'art. 5% (ou _) C. com.', 1)");
	});

	const first = articlePage(index);
	check("total hors page", first.total === 1201, String(first.total));
	check("page de 80", first.rows.length === 80);
	check("les plus appliqués d'abord", first.rows[0].n === 7 && first.rows.every((r, i) => i === 0 || first.rows[i - 1].n >= r.n));
	const last = articlePage(index, { limit: 80, offset: 1160 });
	check("dernière page : 41 articles", last.rows.length === 41, String(last.rows.length));
	check("tous les articles atteignables", new Set([0, 80, 160].flatMap((offset) => articlePage(index, { offset }).rows.map((r) => r.key))).size === 240);

	const filtered = articlePage(index, { needle: "art. 12" });
	check("filtre : art. 12, 120 à 129 et 1200", filtered.total === 12, String(filtered.total));
	check("filtre : tous correspondent", filtered.rows.every((r) => r.label.includes("art. 12")));
	check("filtre insensible à la casse", articlePage(index, { needle: "C. COM." }).total === 1);
	check("jokers pris à la lettre", articlePage(index, { needle: "5% (ou _)" }).total === 1 && articlePage(index, { needle: "%" }).total === 1);
	check("filtre sans résultat", articlePage(index, { needle: "inexistant" }).total === 0);

	check("article par clef", articleByKey(index, "article|7")?.label === "art. 7 C. civ." && articleByKey(index, "article|inconnu") === undefined);

	// Textes, tri et vigueur : trois textes aux numéros de longueurs différentes, dont un abrogé.
	db.run("DELETE FROM decision_articles");
	db.run("DELETE FROM refs"); db.run("DELETE FROM links");
	const add = (key: string, label: string, decisions: number, status?: string) => {
		for (let d = 0; d < decisions; d++) db.run("INSERT INTO decision_articles (decision_id, article_key, label, count) VALUES (?, ?, ?, 1)", [`D${d}`, key, label]);
		if (status) db.run("INSERT INTO links (ref_key, url, title, resolved_at, status) VALUES (?, 'https://exemple', ?, 1, ?)", [key, label, status]);
	};
	add("a1", "Code civil, art. 1240", 5, "VIGUEUR");
	add("a2", "Code civil, art. 99", 2, "ABROGE");
	add("a3", "Code civil, art. 1103", 3);
	add("a4", "Code de procédure civile, art. 700", 4, "VIGUEUR");
	add("a5", "RGPD, art. 32", 1);
	add("a6", "Préambule de 1946, al. 3", 2);
	check("textes : un par ligne avec le nombre d'articles", JSON.stringify(articleTexts(index)) === JSON.stringify([{ text: "Code civil", n: 3 }, { text: "Code de procédure civile", n: 1 }, { text: "Préambule de 1946", n: 1 }, { text: "RGPD", n: 1 }]), JSON.stringify(articleTexts(index)));
	check("tri par applications", articlePage(index).rows.map((r) => r.key).join() === "a1,a4,a3,a2,a6,a5", articlePage(index).rows.map((r) => r.key).join());
	check("tri par texte puis numéro (99 avant 1103)", articlePage(index, { sort: "text" }).rows.map((r) => r.key).join() === "a2,a3,a1,a4,a6,a5", articlePage(index, { sort: "text" }).rows.map((r) => r.key).join());
	check("filtre par texte exact", articlePage(index, { text: "Code civil" }).total === 3 && articlePage(index, { text: "Code" }).total === 0);
	check("texte et tri combinés", articlePage(index, { text: "Code civil", sort: "text" }).rows.map((r) => r.n).join() === "2,3,5");
	check("vigueur : en vigueur", articlePage(index, { vigor: "force" }).rows.map((r) => r.key).sort().join() === "a1,a4");
	check("vigueur : plus en vigueur", articlePage(index, { vigor: "stale" }).rows.map((r) => r.key).join() === "a2");
	check("vigueur : statut inconnu", articlePage(index, { vigor: "unknown" }).rows.map((r) => r.key).sort().join() === "a3,a5,a6");
	check("filtres cumulés", articlePage(index, { text: "Code civil", vigor: "force", needle: "12" }).rows.map((r) => r.key).join() === "a1");
	check("article par clef : texte, statut", articleByKey(index, "a2")?.text === "Code civil" && articleByKey(index, "a2")?.status === "ABROGE" && articleByKey(index, "a5")?.status === null);

	// Statuts lisibles.
	check("statut : abrogé", statusLabel("ABROGE") === "Abrogé");
	check("statut : modifié", statusLabel("MODIFIE") === "Modifié");
	check("statut : transféré", statusLabel("TRANSFERE") === "Transféré");
	check("statut inconnu laissé tel quel", statusLabel("AUTRE") === "AUTRE");
	check("statut absent", statusLabel(undefined) === "inconnu" && statusLabel(null) === "inconnu");

	// Articles périmés : notes réunies en une requête.
	for (const [key, label, status] of [["article|a", "art. 1 C. civ.", "ABROGE"], ["article|b", "art. 2 C. civ.", "MODIFIE"], ["article|c", "art. 3 C. civ.", "VIGUEUR"]]) {
		db.run("INSERT INTO refs (key, kind, label, query, data) VALUES (?, 'article', ?, '', '{}')", [key, label]);
		db.run("INSERT INTO links (ref_key, url, title, resolved_at, status) VALUES (?, 'https://exemple', ?, 1, ?)", [key, label, status]);
	}
	db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES ('b.md', 'article|a', 0, 1), ('a.md', 'article|a', 0, 1), ('a.md', 'article|c', 1, 1)");
	const stale = staleArticles(index);
	check("périmés : deux articles", stale.length === 2, JSON.stringify(stale.map((s) => s.key)));
	check("périmés : notes triées", JSON.stringify(stale[0].notes) === JSON.stringify(["a.md", "b.md"]) && stale[1].notes.length === 0, JSON.stringify(stale));

	// Compteur de modifications de la base : périme les caches.
	const before = db.version;
	db.run("INSERT INTO meta (key, value) VALUES ('t', '1')");
	check("version de la base incrémentée", db.version === before + 1);
	db.all("SELECT 1");
	check("une lecture ne change pas la version", db.version === before + 1);

	// Extraits, articles par décision, textes cités.
	const text = "Faits. Aux termes de l'article 1240 du code civil, tout fait de l'homme oblige à réparer. Suite.";
	const key = parseCitations(text).find(({ ref }) => ref.kind === "article")!.ref.key;
	db.run("DELETE FROM decision_articles"); db.run("DELETE FROM refs"); db.run("DELETE FROM links");
	db.run("INSERT INTO decisions (ref_key, status, legifrance_id, title, date, text_markdown) VALUES ('r1', 'complete', 'JURITEXT1', 'Cass. 1', '2025-06-04', ?)", [text]);
	db.run("INSERT INTO decisions (ref_key, status, legifrance_id, title, date, text_markdown) VALUES ('r2', 'complete', 'JURITEXT2', 'Cass. 2', '2024-01-01', 'Aucun article ici.')");
	db.run("INSERT INTO decision_articles (decision_id, article_key, label, count) VALUES ('JURITEXT1', ?, 'Code civil, art. 1240', 2)", [key]);
	db.run("INSERT INTO decision_articles (decision_id, article_key, label, count) VALUES ('JURITEXT2', ?, 'Code civil, art. 1240', 1)", [key]);
	const excerpts = articleExcerpts(index, key);
	check("extraits : seule la décision qui cite l'article", excerpts.length === 1 && excerpts[0].decisionId === "JURITEXT1", JSON.stringify(excerpts));
	check("extrait : la phrase citante", excerpts[0]?.excerpt.cited === "article 1240 du code civil" && excerpts[0].excerpt.after.includes("oblige à réparer"));
	check("extrait d'une décision regroupée", excerptFor(index, ["JURITEXT2", "JURITEXT1"], key)?.cited === "article 1240 du code civil" && excerptFor(index, [], key) === undefined);
	const record = { id: "JURITEXT1", label: "Cass. 1", themes: [], complete: true, notes: [], members: ["JURITEXT1", "JURITEXT2"] } as DecisionRecord;
	const applied = articlesByDecision(index, [record]).get("JURITEXT1");
	check("articles par décision : réunis, le plus grand nombre de citations", applied?.length === 1 && applied[0].count === 2, JSON.stringify(applied));
	db.run("INSERT INTO refs (key, kind, label, query, data) VALUES ('k1', 'article', 'Code civil, art. 1240', '', '{}'), ('k2', 'decision', 'CE, n° 1', '', '{}')");
	db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES ('a.md', 'k1', 0, 1), ('b.md', 'k1', 0, 1), ('a.md', 'k2', 1, 1)");
	db.run("INSERT INTO links (ref_key, url, title, resolved_at, status) VALUES ('k1', 'https://exemple/k1', 'Code civil, art. 1240', 1, 'VIGUEUR')");
	const cited = citedTexts(index);
	check("textes cités : articles seulement, nombre de notes", cited.length === 1 && cited[0].notes === 2 && cited[0].link_url === "https://exemple/k1" && cited[0].status === "VIGUEUR", JSON.stringify(cited));
	check("textes cités par une note", citedTexts(index, "a.md")[0]?.notes === 1 && citedTexts(index, "c.md").length === 0);

	// Précisions de l'utilisateur : conservées, champs vides écartés, oubliées si tout est vide.
	check("précisions : rien au départ", index.precisionsFor("k2") === undefined);
	index.savePrecisions("k2", { court: "ce", name: " Despujol ", date: "", number: "97263", link: "" });
	check("précisions : conservées et nettoyées", JSON.stringify(index.precisionsFor("k2")) === JSON.stringify({ court: "ce", name: "Despujol", number: "97263" }), JSON.stringify(index.precisionsFor("k2")));
	index.savePrecisions("k2", { name: "", number: undefined });
	check("précisions : tout vide, on oublie", index.precisionsFor("k2") === undefined);
	index.savePrecisions("k2", { name: "Despujol" });
	index.db.run("DELETE FROM citations WHERE ref_key = 'k2'");
	index.prune();
	check("précisions : supprimées avec la référence", index.precisionsFor("k2") === undefined);

	// Notes d'articles : leur contenu ne compte pas comme des citations de l'utilisateur.
	index.setArticleNote("article|a", "Articles/a.md");
	check("note d'article enregistrée", index.isArticleNote("Articles/a.md") && index.articleNoteFor("article|a") === "Articles/a.md" && !index.isArticleNote("b.md"));
	const found = await index.forFile("Articles/a.md", 1, async () => "Voir l'article 1240 du code civil.");
	check("note d'article : références rendues mais non enregistrées", found.length === 1 && db.get("SELECT 1 FROM citations WHERE note_path = 'Articles/a.md'") === undefined);
	await index.forFile("b.md", 1, async () => "Voir l'article 1240 du code civil.");
	check("note ordinaire : citations enregistrées", db.get("SELECT 1 FROM citations WHERE note_path = 'b.md'") !== undefined);
	index.rename("Articles/a.md", "Articles/renommee.md");
	check("note d'article renommée", index.articleNoteFor("article|a") === "Articles/renommee.md" && index.isArticleNote("Articles/renommee.md") && !index.isArticleNote("Articles/a.md"));
	index.remove("Articles/renommee.md");
	check("note d'article supprimée", index.articleNotes().length === 0);

	console.log(fail ? `${fail} échec(s)` : "tout passe");
	process.exit(fail ? 1 : 0);
})();
