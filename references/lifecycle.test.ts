/** Test du cycle de la donnée et de l'état des sources. Lancer : `npm test`. */
import { LegalDatabase } from "./database";
import { ReferenceIndex } from "./index";
import { cycleProgress, sourceState } from "./lifecycle";
import type { LegalRef } from "./parser";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) { fail++; console.log("ÉCHEC", name, detail); } };

(async () => {
	const index = new ReferenceIndex(await LegalDatabase.open(undefined, () => undefined));
	const { db } = index;

	// Base vide : cinq étapes, rien à faire.
	let steps = cycleProgress(index, [], () => true);
	check("cinq étapes dans l'ordre", steps.map((s) => s.id).join() === "notes,textes,decisions,genealogie,fiches", steps.map((s) => s.id).join());
	check("base vide : tout à zéro", steps.every((s) => s.done === 0 && s.total === 0));
	check("une tâche par étape", new Set(steps.map((s) => s.task)).size === 5);

	// Deux notes dont une seule analysée ; articles : un retrouvé, un introuvable, un hors de portée, un à retrouver.
	db.run("INSERT INTO notes (path, mtime, indexed_at) VALUES ('a.md', 10, 1)");
	const ref = (key: string, kind: string, label: string) => {
		db.run("INSERT INTO refs (key, kind, label, query, data) VALUES (?, ?, ?, '', '{}')", [key, kind, label]);
		db.run("INSERT INTO citations (note_path, ref_key, ord, count) VALUES ('a.md', ?, 0, 1)", [key]);
	};
	ref("article|1", "article", "Code civil, art. 1240");
	ref("article|2", "article", "Code civil, art. 1");
	ref("article|3", "article", "Code étranger, art. 5");
	ref("article|4", "article", "Code civil, art. 2");
	const asRef = (key: string, label: string): LegalRef => ({ key, kind: "article", label, query: "", data: {} });
	index.setLink(asRef("article|1", "Code civil, art. 1240"), { url: "https://exemple", titre: "x" });
	index.setMiss(asRef("article|2", "Code civil, art. 1"));
	const reachable = (r: LegalRef) => r.key !== "article|3";
	// Décisions : une complète (avec texte), une introuvable, une à compléter.
	ref("decision|a", "decision", "CE, n° 1"); ref("decision|b", "decision", "CE, n° 2"); ref("decision|c", "decision", "CE, n° 3");
	db.run("INSERT INTO decisions (ref_key, status, legifrance_id, text_markdown) VALUES ('decision|a', 'complete', 'CETATEXT1', 'Texte.')");
	db.run("INSERT INTO decisions (ref_key, status) VALUES ('decision|b', 'unresolved')");
	db.run("INSERT INTO fiches (note_path, legifrance_id, indexed_at) VALUES ('f1.md', 'CETATEXT1', 1), ('f2.md', NULL, 1)");

	steps = cycleProgress(index, [{ path: "a.md", mtime: 10 }, { path: "b.md", mtime: 20 }], reachable);
	const by = (id: string) => steps.find((s) => s.id === id)!;
	// L'analyse d'une note est « à jour » quand sa date correspond : a.md l'est (mtime 10), b.md n'a jamais été analysée.
	check("notes : une sur deux", by("notes").done === 1 && by("notes").total === 2, by("notes").detail);
	check("textes : 1 retrouvé sur 4", by("textes").done === 1 && by("textes").total === 4, by("textes").detail);
	check("textes : détail introuvable / hors de portée / à retrouver", /1 à retrouver/.test(by("textes").detail) && /1 introuvables/.test(by("textes").detail) && /1 hors de portée/.test(by("textes").detail), by("textes").detail);
	check("décisions : 1 traitée sur 3 citées", by("decisions").done === 1 && by("decisions").total === 3, by("decisions").detail);
	check("généalogie : décision complète pas encore analysée", by("genealogie").done === 0 && by("genealogie").total === 1, by("genealogie").detail);
	db.run("UPDATE decisions SET relations_at = 1 WHERE legifrance_id = 'CETATEXT1'");
	check("généalogie : analysée", cycleProgress(index, [], reachable).find((s) => s.id === "genealogie")!.done === 1);
	check("fiches : 1 reliée sur 2", by("fiches").done === 1 && by("fiches").total === 2, by("fiches").detail);

	// États d'une source.
	check("fichée et citée", sourceState({ fiche: true, notes: 2 }).tone === "fiche");
	check("citée sans fiche", sourceState({ fiche: false, notes: 1 }).tone === "cite");
	check("fiche que rien ne cite", sourceState({ fiche: true, notes: 0 }).tone === "orpheline");
	check("libellés lisibles", sourceState({ fiche: true, notes: 1 }).label === "Fichée" && sourceState({ fiche: false, notes: 1 }).label === "Citée" && sourceState({ fiche: true, notes: 0 }).label === "Fiche non citée");

	console.log(fail ? `${fail} échec(s)` : "tout passe");
	process.exit(fail ? 1 : 0);
})();
