// api/connectionCheck.ts
function interpretCheck(tokenStatus, apiStatus) {
  if (tokenStatus === void 0)
    return { ok: false, title: "PISTE est injoignable", detail: "V\xE9rifiez votre connexion Internet. Si elle fonctionne, les adresses des h\xF4tes (r\xE9glages avanc\xE9s de la connexion) ont peut-\xEAtre chang\xE9." };
  if (tokenStatus === 429 || apiStatus === 429)
    return { ok: false, title: "Quota d\xE9pass\xE9", detail: "PISTE limite le nombre de requ\xEAtes. Patientez une minute avant de r\xE9essayer." };
  if (tokenStatus === 400 || tokenStatus === 401)
    return {
      ok: false,
      title: "Identifiants refus\xE9s",
      detail: "V\xE9rifiez que le Client ID et le Client Secret sont ceux de la section OAuth (le deuxi\xE8me volet) de l'onglet \xAB Authentification \xBB de votre application, sans espace avant ni apr\xE8s, et que l'application est bien activ\xE9e."
    };
  if (tokenStatus !== 200) return { ok: false, title: `PISTE a r\xE9pondu HTTP ${tokenStatus}`, detail: "Le service est peut-\xEAtre indisponible. R\xE9essayez plus tard." };
  if (apiStatus === 200) return { ok: true, title: "Connexion r\xE9ussie", detail: "Vos identifiants sont valides et l'API L\xE9gifrance r\xE9pond." };
  if (apiStatus === 401 || apiStatus === 403)
    return {
      ok: false,
      title: "Identifiants valides, mais pas d'acc\xE8s \xE0 l'API L\xE9gifrance",
      detail: "Sur PISTE, ouvrez votre application : acceptez les conditions d'utilisation de L\xE9gifrance (page de consentement, \xE9tape 4), puis s\xE9lectionnez l'API L\xE9gifrance dans l'application et validez (\xE9tape 5)."
    };
  if (apiStatus === void 0) return { ok: false, title: "L'API L\xE9gifrance n'a pas r\xE9pondu", detail: "Les identifiants sont valides, mais le service ne r\xE9pond pas. R\xE9essayez plus tard." };
  return { ok: false, title: `L'API L\xE9gifrance a r\xE9pondu HTTP ${apiStatus}`, detail: "Les identifiants sont valides. Si l'erreur persiste, v\xE9rifiez l'adresse de l'h\xF4te de l'API dans les r\xE9glages." };
}

// api/connectionCheck.test.ts
var fail = 0;
var eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) {
    fail++;
    console.log("\xC9CHEC", name, "\n   obtenu :", g, "\n   attendu:", w);
  }
};
eq("succ\xE8s", interpretCheck(200, 200).ok, true);
eq("injoignable", interpretCheck(void 0).title, "PISTE est injoignable");
eq("identifiants refus\xE9s 401", interpretCheck(401).title, "Identifiants refus\xE9s");
eq("identifiants refus\xE9s 400", interpretCheck(400).title, "Identifiants refus\xE9s");
eq("API non souscrite 403", interpretCheck(200, 403).title, "Identifiants valides, mais pas d'acc\xE8s \xE0 l'API L\xE9gifrance");
eq("API non souscrite 401", interpretCheck(200, 401).ok, false);
eq("quota (jeton)", interpretCheck(429).title, "Quota d\xE9pass\xE9");
eq("quota (API)", interpretCheck(200, 429).title, "Quota d\xE9pass\xE9");
eq("jeton 500", interpretCheck(500).title, "PISTE a r\xE9pondu HTTP 500");
eq("API muette", interpretCheck(200).title, "L'API L\xE9gifrance n'a pas r\xE9pondu");
eq("API 500", interpretCheck(200, 500).title, "L'API L\xE9gifrance a r\xE9pondu HTTP 500");
console.log(fail ? `${fail} \xE9chec(s)` : "connexion : tous les tests passent");
if (fail) process.exit(1);
