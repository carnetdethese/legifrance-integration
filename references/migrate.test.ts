/** Test de la migration du parseur sur une base synthétique reprenant les doublons constatés. Lancer : `npm test`. */
import { LegalDatabase } from "./database";
import { ReferenceIndex } from "./index";
import { namedDecisionKey } from "./parser";
import { PARSER_VERSION, migrateParser, needsParserMigration, stampParserVersion, upgradeParserData } from "./migrate";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) { fail++; console.log("ÉCHEC", name, detail); } };

(async () => {
	const db = await LegalDatabase.open(undefined, () => undefined);
	check("base neuve : rien à migrer", !needsParserMigration(db));

	// Anciennes clefs : date telle qu'écrite, nom tel que capturé (avec ses scories).
	const old = (name: string, decided: string) => `decision|court=ce|decided=${decided.toLowerCase()}|name=${name.toLowerCase()}`;
	const ref = (label: string, name: string, decided: string) => {
		const key = old(name, decided);
		db.run("INSERT OR REPLACE INTO refs (key, kind, label, query, data, url, fallback_url) VALUES (?, 'decision', ?, ?, ?, NULL, NULL)", [key, label, `${name} ${decided}`, JSON.stringify({ court: "ce", name, decided })]);
		return key;
	};
	const a = ref("CE, 31 juillet 1942, Monpeurt", "Monpeurt", "31 juillet 1942");
	const b = ref("C.E., assemblée., 31 juillet 1942, Monpeurt.", "Monpeurt.", "31 juillet 1942");
	const c = ref("CE, 31 juillet 1942, Monpeurt]]", "Monpeurt]]", "31 juillet 1942");
	const d = ref("CE, Ass., 1943, Bouguen]].", "Bouguen]].", "1943");
	const e = ref("CE, 13 février 1942, Ville de Dôle", "Ville de Dôle", "13 février 1942");   // déjà propre
	db.run("INSERT INTO refs (key, kind, label, query, data) VALUES ('decision|court=ce|number=448948', 'decision', 'CE, n° 448948', '448948', '{\"court\":\"ce\",\"number\":\"448948\"}')");
	const cite = (note: string, key: string, count: number, ord: number) => db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES (?, ?, ?, ?)", [note, key, ord, count]);
	cite("cours.md", a, 2, 0); cite("td.md", b, 1, 0); cite("cours.md", c, 1, 3); cite("td.md", d, 1, 1); cite("cours.md", e, 1, 2); cite("cours.md", "decision|court=ce|number=448948", 1, 4);
	db.run("INSERT INTO notes (path, mtime, indexed_at) VALUES ('cours.md', 100, 1), ('td.md', 200, 1)");
	// Ce que l'API a coûté : un lien avec texte sur l'un, une fiche complète sur un autre, un échec sur un troisième.
	db.run("INSERT INTO links (ref_key, url, title, text, resolved_at) VALUES (?, 'https://exemple/ceta/id/CETATEXT000007637232', 'Monpeurt', NULL, 10)", [b]);
	db.run("INSERT INTO links (ref_key, url, title, text, resolved_at) VALUES (?, 'https://exemple/ceta/id/CETATEXT000007637232', 'Monpeurt (texte)', 'texte', 5)", [c]);
	db.run("INSERT INTO decisions (ref_key, status, legifrance_id, text_markdown) VALUES (?, 'unresolved', NULL, NULL)", [a]);
	db.run("INSERT INTO decisions (ref_key, status, legifrance_id, text_markdown) VALUES (?, 'complete', 'CETATEXT000007637232', 'texte intégral')", [c]);
	db.run("INSERT INTO decisions (ref_key, status) VALUES (?, 'unresolved')", [d]);
	db.run("INSERT INTO misses (ref_key, at) VALUES (?, 1)", [d]);
	db.run("INSERT INTO misses (ref_key, at) VALUES (?, 2)", [e]);        // introuvable, mais nom déjà propre
	db.run("INSERT INTO decisions (ref_key, status) VALUES (?, 'unresolved')", [e]);

	check("migration nécessaire", needsParserMigration(db));
	const report = migrateParser(db);
	check("plus de migration", !needsParserMigration(db));
	check("version enregistrée", db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'parser_version'")?.value === String(PARSER_VERSION));

	const refs = db.all<{ key: string; label: string; data: string }>("SELECT key, label, data FROM refs WHERE kind = 'decision' ORDER BY key");
	check("3 décisions nommées + 1 par numéro", refs.length === 4, JSON.stringify(refs.map((r) => r.key)));
	const monpeurt = refs.filter((r) => r.key.includes("monpeurt"));
	check("Monpeurt : une seule référence", monpeurt.length === 1, JSON.stringify(monpeurt));
	check("clef normalisée", monpeurt[0]?.key === "decision|court=ce|decided=1942-07-31|name=monpeurt", monpeurt[0]?.key);
	check("libellé nettoyé", !/\]\]|\.$/.test(monpeurt[0]?.label ?? "x]]"), monpeurt[0]?.label);
	check("nom nettoyé", JSON.parse(monpeurt[0].data).name === "Monpeurt", monpeurt[0]?.data);
	check("décisions par numéro intactes", refs.some((r) => r.key === "decision|court=ce|number=448948"));
	check("Bouguen nettoyé", refs.some((r) => r.key === "decision|court=ce|decided=1943|name=bouguen"));
	check("décision propre conservée", refs.some((r) => r.key === old("Ville de Dôle", "13 février 1942")) === false && refs.some((r) => r.key === "decision|court=ce|decided=1942-02-13|name=ville de dole"), JSON.stringify(refs.map((r) => r.key)));

	const mk = "decision|court=ce|decided=1942-07-31|name=monpeurt";
	const citations = db.all<{ note_path: string; count: number; ord: number }>("SELECT note_path, count, ord FROM citations WHERE ref_key = ? ORDER BY note_path", [mk]);
	check("citations additionnées par note", JSON.stringify(citations) === JSON.stringify([{ note_path: "cours.md", count: 3, ord: 0 }, { note_path: "td.md", count: 1, ord: 0 }]), JSON.stringify(citations));
	check("aucune citation orpheline", (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM citations WHERE ref_key NOT IN (SELECT key FROM refs)")?.n ?? 1) === 0);
	check("lien avec texte conservé", db.get<{ text: string }>("SELECT text FROM links WHERE ref_key = ?", [mk])?.text === "texte");
	check("un seul lien", (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM links")?.n ?? 0) === 1);
	const decision = db.get<{ status: string; text_markdown: string }>("SELECT status, text_markdown FROM decisions WHERE ref_key = ?", [mk]);
	check("fiche complète conservée", decision?.status === "complete" && decision.text_markdown === "texte intégral", JSON.stringify(decision));
	const bouguen = "decision|court=ce|decided=1943|name=bouguen";
	check("introuvable à cause d'un nom abîmé : à retenter", db.get<{ status: string }>("SELECT status FROM decisions WHERE ref_key = ?", [bouguen])?.status === "pending");
	check("échec de recherche oublié", !db.get("SELECT 1 FROM misses WHERE ref_key = ?", [bouguen]));
	const dole = "decision|court=ce|decided=1942-02-13|name=ville de dole";
	check("nom déjà propre : l'échec de recherche est conservé", !!db.get("SELECT 1 FROM misses WHERE ref_key = ?", [dole]));
	check("nom déjà propre : toujours marquée introuvable", db.get<{ status: string }>("SELECT status FROM decisions WHERE ref_key = ?", [dole])?.status === "unresolved");
	check("notes à réanalyser", (db.get<{ n: number }>("SELECT COUNT(*) AS n FROM notes WHERE mtime = -1")?.n ?? 0) === 2);
	check("bilan", report.merged === 2 && report.rewritten >= 3, JSON.stringify(report));

	// Rejouer la migration ne change rien.
	const before = JSON.stringify(db.all("SELECT * FROM refs ORDER BY key"));
	stampParserVersion(db);
	check("idempotente", JSON.stringify(migrateParser(db)) === JSON.stringify({ rewritten: 0, merged: 0 }) && JSON.stringify(db.all("SELECT * FROM refs ORDER BY key")) === before);

	// Démarrage : une base neuve est simplement marquée ; une base à jour n'est pas réécrite.
	const fresh = await LegalDatabase.open(undefined, () => undefined);
	check("base neuve : pas de bilan", upgradeParserData(fresh) === undefined && fresh.get<{ value: string }>("SELECT value FROM meta WHERE key = 'parser_version'")?.value === String(PARSER_VERSION));
	let writes = 0;
	const watched = await LegalDatabase.open(undefined, () => writes++);
	upgradeParserData(watched);
	writes = 0;
	check("à jour : aucune écriture", upgradeParserData(watched) === undefined && writes === 0, String(writes));
	check("migration via le démarrage", upgradeParserData(db) === undefined);

	// Base migrée en v2 : un nom suivi d'un sous-titre ou d'un renvoi de page est devenu une « décision » distincte.
	const v2 = await LegalDatabase.open(undefined, () => undefined);
	const v2key = (name: string, decided: string) => namedDecisionKey("ce", name, decided);
	const camino = ["Camino", "Camino : contrôle de l'exactitude matérielle des faits", "Camino : L'administration considère que l'administré ne r", "Camino p. 15"];
	const keys = camino.map((name) => v2key(name, "1916-01-14"));
	const bordeaux = ["Compagnie générale d'éclairage de Bordeaux : hausse du prix", "Compagnie générale d'éclairage de Bordeaux : théorie de l'i"].map((name) => v2key(name, "1916-03-30"));
	[...camino, ...["Compagnie générale d'éclairage de Bordeaux : hausse du prix", "Compagnie générale d'éclairage de Bordeaux : théorie de l'i"]].forEach((name, i) => {
		const key = [...keys, ...bordeaux][i];
		v2.run("INSERT INTO refs (key, kind, label, query, data) VALUES (?, 'decision', ?, ?, ?)", [key, `CE, ${i < 4 ? "14 janvier 1916" : "30 mars 1916"}, ${name}`, name, JSON.stringify({ court: "ce", name, decided: i < 4 ? "1916-01-14" : "1916-03-30" })]);
		v2.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES (?, ?, 0, 1)", [`note${i}.md`, key]);
		v2.run("INSERT INTO decisions (ref_key, status) VALUES (?, 'unresolved')", [key]);
		v2.run("INSERT INTO misses (ref_key, at) VALUES (?, 1)", [key]);
	});
	v2.run("INSERT INTO meta (key, value) VALUES ('parser_version', '2')");
	v2.run("INSERT INTO notes (path, mtime, indexed_at) VALUES ('note0.md', 5, 1)");
	check("v2 → v3 nécessaire", needsParserMigration(v2));
	const bilan = upgradeParserData(v2);
	const left = v2.all<{ key: string }>("SELECT key FROM refs ORDER BY key").map((r) => r.key);
	check("Camino : une seule référence, Bordeaux : une seule", JSON.stringify(left) === JSON.stringify([namedDecisionKey("ce", "Camino", "1916-01-14"), namedDecisionKey("ce", "Compagnie générale d'éclairage de Bordeaux", "1916-03-30")].sort()), JSON.stringify(left));
	check("citations réunies (4 notes sur Camino)", v2.get<{ n: number }>("SELECT SUM(count) AS n FROM citations WHERE ref_key = ?", [namedDecisionKey("ce", "Camino", "1916-01-14")])?.n === 4);
	check("à retenter avec le nom corrigé", v2.all<{ status: string }>("SELECT status FROM decisions").every((d) => d.status === "pending") && (v2.get<{ n: number }>("SELECT COUNT(*) AS n FROM misses")?.n ?? 1) === 0);
	check("bilan v3", bilan?.merged === 4, JSON.stringify(bilan));
	check("v3 enregistrée", !needsParserMigration(v2) && upgradeParserData(v2) === undefined);

	// Base migrée en v3 : un nom suivi d'une fin de phrase ; une citation par numéro avec indices ne doit pas être réécrite.
	const v3 = await LegalDatabase.open(undefined, () => undefined);
	const k1 = namedDecisionKey("ce", "Labonne", "1919-08-08");
	const k2 = namedDecisionKey("ce", "Labonne. On fait la", "1919-08-08");
	const knum = "decision|court=ce|number=56377";
	v3.run("INSERT INTO refs (key, kind, label, query, data) VALUES (?, 'decision', 'CE, 8 août 1919, Labonne', 'Labonne', ?)", [k1, JSON.stringify({ court: "ce", name: "Labonne", decided: "1919-08-08" })]);
	v3.run("INSERT INTO refs (key, kind, label, query, data) VALUES (?, 'decision', 'CE 8 août 1919, Labonne. On fait la', 'x', ?)", [k2, JSON.stringify({ court: "ce", name: "Labonne. On fait la", decided: "1919-08-08" })]);
	v3.run("INSERT INTO refs (key, kind, label, query, data) VALUES (?, 'decision', 'CE, 8 août 1919, Labonne, n° 56377', '56377', ?)", [knum, JSON.stringify({ court: "ce", number: "56377", name: "Labonne", decided: "1919-08-08" })]);
	v3.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES ('a.md', ?, 0, 1), ('b.md', ?, 0, 1), ('c.md', ?, 0, 1)", [k1, k2, knum]);
	v3.run("INSERT INTO meta (key, value) VALUES ('parser_version', '3')");
	check("v3 → v4 nécessaire", needsParserMigration(v3));
	upgradeParserData(v3);
	const labonneRefs = v3.all<{ key: string }>("SELECT key FROM refs ORDER BY key").map((r) => r.key);
	check("Labonne : une référence nommée + la référence par numéro intacte", JSON.stringify(labonneRefs) === JSON.stringify([k1, knum].sort()), JSON.stringify(labonneRefs));
	check("la citation par numéro garde ses indices", JSON.parse(v3.get<{ data: string }>("SELECT data FROM refs WHERE key = ?", [knum])!.data).name === "Labonne");
	check("citations des deux formes nommées réunies", v3.get<{ n: number }>("SELECT COUNT(*) AS n FROM citations WHERE ref_key = ?", [k1])?.n === 2);

	// Veille : un statut qui change est signalé, un lien identique ne l'est pas.
	const watch = new ReferenceIndex(await LegalDatabase.open(undefined, () => undefined));
	const article = { key: "article|code civil|1240", kind: "article" as const, label: "art. 1240 C. civ.", query: "", data: {} };
	watch.db.run("INSERT INTO refs (key, kind, label, query, data) VALUES (?, 'article', ?, '', '{}')", [article.key, article.label]);
	watch.setLink(article, { url: "https://exemple/LEGIARTI000032041571", titre: "art. 1240", texte: "Tout fait quelconque…", statut: "VIGUEUR" });
	watch.setLink(article, { url: "https://exemple/LEGIARTI000032041571", titre: "art. 1240", texte: "Tout fait quelconque…", statut: "VIGUEUR" });
	check("veille : rien de changé", watch.changedArticles().length === 0);
	watch.setLink(article, { url: "https://exemple/LEGIARTI000032041571", titre: "art. 1240", texte: "Tout fait quelconque…", statut: "ABROGE" });
	const changed = watch.changedArticles();
	check("veille : statut changé signalé", changed.length === 1 && changed[0].previousStatus === "VIGUEUR" && changed[0].status === "ABROGE", JSON.stringify(changed));
	check("veille : lien à revérifier", watch.articlesToRefresh(Date.now() + 1000).length === 1 && watch.articlesToRefresh(0).length === 0);
	watch.acknowledgeChange(article.key);
	check("veille : changement vu", watch.changedArticles().length === 0);
	watch.setLink(article, { url: "https://exemple/LEGIARTI000032041571", titre: "art. 1240", texte: "Texte modifié", statut: "ABROGE" });
	check("veille : texte modifié signalé", watch.changedArticles().length === 1);

	// Généalogie : enregistrement, relecture, décision marquée comme analysée.
	watch.db.run("INSERT INTO decisions (ref_key, status, legifrance_id, text_markdown) VALUES ('k', 'complete', 'CETATEXT1', 'Texte.')");
	check("généalogie : décision à analyser", watch.decisionsWithoutRelations().length === 1);
	watch.saveRelations("CETATEXT1", [{ ref: { key: "decision|ce|1", kind: "decision", label: "CE, n° 1", query: "", data: { court: "ce", number: "1" } }, kind: "renverse", extract: "Il y a lieu de revenir…" }]);
	check("généalogie : relation relue", JSON.stringify(watch.allRelations().map((r) => [r.from_id, r.to_number, r.kind])) === JSON.stringify([["CETATEXT1", "1", "renverse"]]));
	check("généalogie : décision analysée", watch.decisionsWithoutRelations().length === 0);

	console.log(fail ? `${fail} échec(s)` : "tout passe");
	process.exit(fail ? 1 : 0);
})();
