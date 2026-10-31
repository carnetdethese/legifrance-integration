/** Tests de la lecture du test de connexion. Lancer : `npm test`. */
import { interpretCheck } from "./connectionCheck";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

eq("succès", interpretCheck(200, 200).ok, true);
eq("injoignable", interpretCheck(undefined).title, "PISTE est injoignable");
eq("identifiants refusés 401", interpretCheck(401).title, "Identifiants refusés");
eq("identifiants refusés 400", interpretCheck(400).title, "Identifiants refusés");
eq("API non souscrite 403", interpretCheck(200, 403).title, "Identifiants valides, mais pas d'accès à l'API Légifrance");
eq("API non souscrite 401", interpretCheck(200, 401).ok, false);
eq("quota (jeton)", interpretCheck(429).title, "Quota dépassé");
eq("quota (API)", interpretCheck(200, 429).title, "Quota dépassé");
eq("jeton 500", interpretCheck(500).title, "PISTE a répondu HTTP 500");
eq("API muette", interpretCheck(200).title, "L'API Légifrance n'a pas répondu");
eq("API 500", interpretCheck(200, 500).title, "L'API Légifrance a répondu HTTP 500");

console.log(fail ? `${fail} échec(s)` : "connexion : tous les tests passent");
if (fail) process.exit(1);
