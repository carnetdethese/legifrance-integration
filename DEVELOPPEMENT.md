# Guide du développeur

Pour comprendre le plugin avant d'y toucher : où est quoi, comment la donnée circule, comment lancer et
écrire les tests. Le code est commenté en français ; ce guide donne la carte.

## 1. Mise en route

```bash
npm install
npm run dev      # compile en continu dans dist/ (main.js, manifest.json, styles.css)
npm run build    # vérifie les types (tsc) puis compile en production
npm run lint     # eslint
npm test         # tous les tests (voir §6)
```

Pour essayer le plugin : lier (ou copier) `dist/` dans `<coffre>/.obsidian/plugins/legifrance-integration/`.
Le réglage **« Mode débogage des références »** (`debugRefs`) ajoute, dans le panneau des références, le journal de
chaque recherche d'API.

## 2. Vue d'ensemble

Le plugin fait deux choses, qui se rejoignent dans la base SQLite :

1. **Recherche et lecture** (la partie historique) : rechercher dans les fonds de l'API Légifrance, lire un
   document, créer une note à partir d'un modèle.
2. **Références du coffre** (la partie récente) : repérer les décisions, textes et articles cités dans les notes,
   les retrouver sur Légifrance, garder leur texte, puis analyser (chronologie, articles appliqués, écarts
   avec les fiches, généalogie…).

| Dossier | Rôle |
|---|---|
| `main.ts` | Point d'entrée : charge les réglages, ouvre la base, enregistre vues et événements, tient l'historique et ouvre les vues. Le reste est délégué (voir ci-dessous). |
| `commands.ts` | Commandes de la palette et icône du ruban. |
| `api/` | **Tous les appels à l'API Légifrance** (`legifrance.ts`), transport PISTE (`client.ts` : OAuth, erreurs), limiteur de débit (`rateLimiter.ts`), adresses des pages (`urls.ts`), constantes du formulaire de recherche (`constants.ts`). |
| `abstracts/` | Partie « recherche » : registre des fonds (`fonds.ts`), construction des requêtes (`searchHandler.ts`, `searches.ts`), lecture des documents (`consult.ts`, `document.ts`, `decisions.ts`), codes et textes consolidés : table des matières et contexte d'un article (`toc.ts` pur, `legislation.ts` appels et cache en mémoire). |
| `creation/` | Création d'une note à partir d'un document (`newNote.ts`, modèles Handlebars). |
| `references/` | **Le cœur récent** : parseur, base, résolution par l'API, tâches, analyses. Voir §3 à §5. |
| `references/sources/` | Sources pour retrouver la décision d'une fiche sans identifiant : Légifrance, ArianeWeb, RGD. |
| `settings/` | Onglet de réglages, déclaratif (`settings.ts` : `getSettingDefinitions`, Obsidian 1.13), identifiants dans le trousseau (`credentials.ts`) et blocs d'état (`status.ts`). |
| `views/` | Vues Obsidian (classes `ItemView`) et composants React (`views/components/`). |
| `lib/` | Petits utilitaires (dates, noms de fichiers sûrs, compatibilité des versions d'Obsidian) et constantes d'événements (`events.ts`). |

### Ce que fait chaque objet du plugin

`main.ts` ne contient plus de logique métier : il assemble des objets qui ont chacun un sujet et un fichier.

| Objet | Fichier | Sujet |
|---|---|---|
| `plugin.api` | `api/legifrance.ts` | Appels à l'API (voir « Appels à l'API » ci-dessous). |
| `plugin.references` | `references/index.ts` | Lecture et écriture de la base des références (liens, fiches, décisions, articles). |
| `plugin.links` | `references/linkResolver.ts` | Retrouve via l'API le lien de chaque référence ; état affiché par les vues : `pending` (recherches en cours), `traces` (journal de débogage), `authFailed` (identifiants refusés). |
| `plugin.fiches` | `references/ficheEditor.ts` | Fiches de décisions dans les notes : reconnaissance (`sync`), bouton « Compléter », complément à l'ouverture. |
| `plugin.tasks` | `references/taskRunner.ts` | Tâches longues : `run(task)`, `cancel()`, `running`, `cancelled`, `state`. |
| `plugin.events` | `lib/events.ts` | `REFERENCES_EVENT`, `TASK_EVENT`, `HISTORY_EVENT`. |
| (privé) | `references/databaseFile.ts` | Fichier SQLite : ouverture tolérante, migration, écriture sûre. |

### Appels à l'API

Tout appel à Légifrance passe par `plugin.api` (`api/legifrance.ts`), **une méthode par endpoint** ; aucun autre
module ne connaît les chemins (`/search`, `/consult/juri`…) ni le jeton OAuth2.

| Méthode | Endpoint | Utilisée par |
|---|---|---|
| `search(request, lane?)` | `POST /search` | formulaire de recherche (`searchHandler.ts`) ; recherche d'une décision pour une fiche (`sources/legifrance.ts`). |
| `consultDecision(textId, { searchedString?, cnil?, lane? })` | `POST /consult/juri` (`/consult/cnil`) | lecture d'une décision (`abstracts/decisions.ts`), analyse (`indexer.ts`), métadonnées d'une fiche. |
| `consultArticle(id, lane?)` | `POST /consult/getArticle` | texte d'un article (`resolver.ts`), versions (`articleVersions.ts`). |
| `consultTableOfContents(textId, date, lane?)` | `POST /consult/legi/tableMatieres` | table des matières d'un code ou d'un texte consolidé (`abstracts/legislation.ts` `loadToc`) : vue « Code » et article suivant / précédent du lecteur. |
| `listCodes(codeName?, lane?)` | `POST /list/code` | liste des codes en vigueur (commande « Parcourir un code »). |
| `consult(route, params, lane?)` | `POST /consult/<route>` | lecture des autres fonds (`abstracts/consult.ts` choisit la route d'après l'identifiant) ; requêtes de résolution des références (`resolver.ts` : `/search`, ou la route d'un texte). |

Le transport (`api/client.ts`) fait le reste : jeton mis en cache et renouvelé sur un 401 (une seule relance),
attente du limiteur de débit, pause générale sur un 429 (`Retry-After`), erreurs HTTP en `ApiError` (le code est
dans `status`). Les appelants distinguent « requête refusée » (400/404 : on essaie la suivante) de « identifiants
refusés ou quota » (401/403/429 : on prévient et on arrête). `lane: "background"` marque un travail de fond, qui
passe après les requêtes de l'utilisateur.

**Ajouter un appel** : une méthode dans `LegifranceApi` (chemin, corps, ligne dans le tableau ci-dessus), pas de
`fetch` ailleurs. Les réponses sont renvoyées brutes ; leur lecture se fait par fond dans `abstracts/` ou
`references/` (`caselaw.ts` pour les décisions, `consult.ts` pour les textes).

### Modules « purs » et modules Obsidian

Règle importante pour que les tests tournent sous Node : **un module de `references/` n'importe pas
`obsidian`** sauf s'il en a vraiment besoin. Sont purs : `parser`, `dates`, `themes`, `similarity`,
`timeline`, `genealogy`, `checks`, `fiches`, `rgdTitle`, `migrate`, `database`, `rateLimiter`. Le plugin leur
passe ce qu'il lit (frontmatter, texte des notes) et applique ce qu'ils décident. Quand vous ajoutez de la
logique, mettez-la dans un module pur et gardez les fichiers qui touchent à Obsidian (`insights.ts`,
`ficheSync.ts`, `ficheEditor.ts`, `linkResolver.ts`, `indexer.ts`, `main.ts`, vues) minces.

## 3. Le cycle de la donnée

Une source (décision, texte, article) passe par cinq étapes. Chacune s'appuie sur la précédente, a sa tâche,
sa commande, ses tables et son compteur dans la vue **Base de données → Cycle de la donnée**
(`views/components/database/CycleOverview.tsx`, alimenté par `cycleProgress` dans
[references/lifecycle.ts](references/lifecycle.ts), qui sert aussi aux réglages).

```
                                  VOTRE COFFRE
  ┌──────────────┐
  │    Notes     │  citent des décisions, des textes, des articles ; certaines notes sont des fiches
  └──────┬───────┘
         │ ① ANALYSER LES NOTES          tâche INDEX_TASK            parser.ts — indexer.ts (indexVault)
         ▼                               tables notes, refs, citations
  ┌──────────────┐
  │  Références  │  « CE, 1923, Couitéas » — « art. 1240 C. civ. » — « art. 32 RGPD »
  │   citées     │  = ÉTAT « CITÉE » (jaune)
  └──────┬───────┘
         │ ② RETROUVER LES TEXTES        tâche ARTICLES_TASK         resolver.ts (articles, textes)
         ▼                               tables links, misses
  ┌──────────────┐
  │ Articles et  │  adresse Légifrance, texte, statut de vigueur (VIGUEUR, ABROGE, MODIFIE…)
  │ textes liés  │  veille : REFRESH_TASK relit les liens de plus de six mois (previous_status, changed_at)
  └──────┬───────┘
         │ ③ COMPLÉTER LES DÉCISIONS     tâche ENRICH_TASK           indexer.ts (enrichDecisions)
         ▼                               tables decisions, decision_articles
  ┌──────────────┐
  │  Décisions   │  recherche (Légifrance, ArianeWeb, RGD) → lecture → métadonnées, texte intégral,
  │  complètes   │  thèmes, résumé, vocabulaire, articles visés par le texte
  └──────┬───────┘  (status : pending → complete | external | unresolved | error)
         │ ④ ANALYSER LA GÉNÉALOGIE      tâche GENEALOGY_TASK        genealogy.ts
         ▼                               table decision_relations
  ┌──────────────┐
  │  Relations   │  « revient sur », « précise », « confirme »… entre décisions
  └──────┬───────┘
         │ ⑤ RELIER LES FICHES           tâche COMPLETE_FICHES_TASK  fiches.ts — ficheSync.ts
         ▼                               table fiches (+ ficheEditor.ts : à chaque modification)
  ┌──────────────┐
  │   Fiches     │  note dont une propriété désigne une décision, reliée par l'identifiant Légifrance
  │   reliées    │  = ÉTAT « FICHÉE » (vert)
  └──────┬───────┘
         │ recensement : loadDecisions / decisionsOf        corpus.ts — insights.ts
         ▼
   Analyses : Articles, Chronologie (vue Jurisprudence) — À faire, Cycle, Tables (vue Base de données)
```

Ce que l'on tire du recensement pour les notes : table des décisions (`timeline.ts`), **plan de cours**
« thème → décisions → articles » (`plan.ts`), **bibliographie** Markdown, CSV, BibTeX et RIS
(`bibliography.ts`, exportée par `ExportModal`), **phrase où une décision cite un article** (`excerpts.ts`,
lue à la demande dans `text_markdown`). Les commandes sont dans `commands.ts` ; l'actualisation des articles
au démarrage (rappel ou lancement en fond) dans `startup.ts`.

Autres lectures de la base : **vue « Articles de la note »** (`ArticlesView`, `components/articles/ArticlesPanel.tsx` :
statut, texte, extraits des décisions, versions, note de chaque article cité), **notes d'articles** (`articleNote.ts`
pour le contenu, `articleNotes.ts` pour la création et la mise à jour automatique ; registre dans la table
`article_notes`, dont le contenu n'est pas indexé comme des citations), **précisions** saisies pour une décision
introuvable (table `decision_precisions`, `precisionsFor` / `savePrecisions`).

**Préciser une référence sans lien** (`preciseReference`, `refineText.ts`) : depuis le panneau des références
comme depuis « À faire ». Une décision passe par le formulaire puis le choix des résultats ; un texte cité par sa
seule date propose tous les textes de ce jour (`findTextCandidates`, lecture dans `textMatch.ts`) ; un article ou un
texte cité par son numéro passe par le formulaire. La résolution automatique ne devine jamais entre plusieurs textes
du même jour.

**Version du parseur** : `PARSER_VERSION` (`parser.ts`) est à incrémenter quand le parseur change ce qu'il reconnaît.
Au démarrage, `ReferenceIndex.parserChanged` invalide l'analyse de toutes les notes (`notes.mtime = 0`) et `INDEX_TASK`
les relit, en local ; les références devenues fausses disparaissent (`prune`). Les décisions du Conseil
constitutionnel citées par leur date seule (« CC, 16 juillet 1971 ») sont des références `court=cc` avec `decided` ;
plusieurs décisions peuvent partager la date, d'où le choix proposé (`buildCcByDate`). Les fiches citées par un lien
(`[[fiche]]`) n'ont pas de référence dans le texte : le panneau les liste à part (`linkedFiches`).

**Textes cités par leur nom** : les lois par leur nom usuel (« loi Informatique et Libertés », « LCEN ») sont dans la
table `LAW_ALIASES` (`lawAliases.ts`), les textes de l'Union (RGPD, DSA, DMA, ePrivacy…) dans `EU_TEXTS` (`eulaw.ts`) ;
ajouter une entrée suffit. Un texte de l'Union cité sans article est une mention (`scanEuMentions`) ; les sigles trop
courants (`AMBIGUOUS_ACRONYMS`) ne comptent qu'avec un article. Les décisions du Conseil constitutionnel peuvent aussi
être citées par l'adresse de leur page (`scanCcSiteUrls`).

**Corriger un lien** : une référence déjà liée peut être corrigée (icône « Corriger le lien » du panneau). Le lien
choisi est marqué `manual` (colonne `links.manual`, `ResolvedLink.manuel`) : `setLink` refuse de le remplacer par un
résultat automatique, la veille (`articlesToRefresh`) et `LinkResolver.resolve` l'ignorent. Seuls un nouveau choix
ou `clearLink` (« Rétablir la recherche automatique ») le changent.

La commande **« Compléter les fiches de décisions »** (`ENRICH_TASK`) enchaîne les étapes ③, ② puis ④ ; chaque
étape peut aussi être lancée seule depuis la vue ou la palette de commandes.

### Les trois états d'une source

Deux informations indépendantes décrivent une décision, et l'interface les distingue partout par la même
pastille (`SourceBadge`, calculée par `sourceState` dans `lifecycle.ts`) :

| Pastille | Signification | Où la voir |
|---|---|---|
| **Fichée** (verte) | Une fiche décrit la décision et au moins une note la cite. | Listes de décisions, panneau des références. |
| **Citée** (jaune) | Une note la cite, mais elle n'a pas de fiche : « À faire » propose d'en créer une. | idem |
| **Fiche non citée** (grise) | Une fiche existe, mais aucune note ne cite la décision. | idem |

Ce qui a été **lu en ligne** (texte intégral en base, `decisions.status = 'complete'`) n'est pas un quatrième état :
c'est une précision, signalée par l'icône de lecture, qui permet de consulter la décision sans requête.

Les articles et les textes n'ont pas de fiche : ils sont toujours « cités ». Leur précision est le **statut de
vigueur** (`statusLabel`) : un article « Abrogé » ou « Transféré » apparaît dans « À faire ».

### Deux services transversaux

Ils ne sont pas des étapes du cycle : ils lisent ce que les étapes ont mis en base.

**Recherche dans les textes** (`references/textSearch.ts`, onglet *Recherche* de la vue Jurisprudence).
Elle cherche dans le texte intégral des décisions complétées (`decisions.text_markdown`), des articles
retrouvés (`links.text`) et des documents consultés (`documents`). Aucune requête n'est envoyée à l'API.
- La comparaison est faite par une fonction SQL `fold` (déclarée dans `LegalDatabase.open`) : minuscules, sans
  accents, apostrophes et espaces insécables ordinaires. `foldText` conserve la longueur du texte, ce qui permet de
  placer les extraits surlignés (`snippetsFor`) dans le texte d'origine.
- Tous les mots demandés doivent figurer ; `"une expression"` se cherche telle quelle.
- Le filtrage se fait dans SQLite (`instr(fold(texte), mot)`) ; seuls les textes d'une page sont relus pour les extraits.
  Le coût est proportionnel à la taille totale des textes en base : une recherche sur une très grosse base prend
  quelques secondes, d'où le message « Recherche… ».

**Version d'un article à la date d'une décision** (`references/versions.ts`, `references/articleVersions.ts`,
onglet *Articles*). Une décision applique l'article tel qu'il était le jour où elle a été rendue.
- `/consult/getArticle` renvoie `article.articleVersions` : pour chaque version, `id`, `etat`, `dateDebut`,
  `dateFin` (millisecondes ; 2999 = sans fin). `parseVersions` les convertit en dates AAAA-MM-JJ.
- `versionAt(versions, date)` choisit la version dont la période contient la date (début inclus, fin exclue).
  Une date incomplète (« 1923 », « 2016-10 ») est comparée à toute la période qu'elle couvre : plusieurs
  versions → résultat `ambiguous` (toutes sont montrées) ; aucune → `none` avec la raison (article postérieur à
  la décision, lacune).
- Les versions sont demandées **à la demande** (bouton, une fois par article) puis gardées dans `article_versions`.
  Les articles visés par une décision n'étant pas forcément cités dans une note, l'article est d'abord retrouvé
  (`resolveReference`) à partir de sa clef et de son libellé (`articleRef`).
- « Lire » enregistre le texte de la version dans `documents` (`storeArticleVersion`) pour l'ouvrir dans le lecteur.
- Limite : les droits de l'Union (`eu|…`) n'ont pas de versions Légifrance ; un article renuméroté (art. 1382
  devenu 1240) a son historique sous l'identifiant de l'article actuel, pas sous l'ancien numéro.

**Graphe des citations** (`references/graph.ts`, `loadGraphInput` dans `corpus.ts`, onglet *Graphe*).
Notes ↔ décisions ↔ articles, trois sortes de liens, orientés comme les flèches : une note *cite* une décision
(`DecisionRecord.notes`), une décision *applique* un article (`decision_articles`), une note *mentionne* un article
(`citations`, option).
- `buildGraph` ne garde qu'un **extrait** : les décisions les plus liées (150 par défaut, jusqu'à 600), les articles
  qu'elles appliquent, les notes qui les citent ; filtres par texte (intitulé, date, thèmes, notes qui citent, articles
  appliqués : tous les mots, sans accents), par thème, par note (la note, ses décisions, leurs articles et les autres
  notes qui les citent), « fiches uniquement » (équivalent de « fichiers existants uniquement » d'Obsidian : une
  décision sans fiche n'est que citée) et « orphelins » (nœuds sans lien dans l'extrait). Les liens ne pointent jamais
  vers un nœud absent.
- `pivotDecisions` (citées par au moins deux notes, les plus liées d'abord) et `isolatedNotes` (tout ce qu'elles
  citent n'est cité par aucune autre note) se calculent sur **toute la base**, pas sur l'extrait.
- **Réglages** (`GraphSettings`, conservés dans `data.json` sous la clef `graph`, lus par `mergeGraphSettings` qui
  ramène tout dans les bornes) : mêmes rubriques et mêmes curseurs que le graphe d'Obsidian — *Filtres*, *Groupes*
  (requêtes `type:`, `theme:`, `path:` ou mot de l'intitulé, couleur, le premier groupe qui convient l'emporte :
  `matchesQuery`, `nodeGroup`), *Afficher* (flèches, seuil de fondu du texte, taille des nœuds, épaisseur des liens,
  *Animer*), *Forces* (centrale, répulsion, liaison, distance des liens). Réinitialisation par le bouton ↺.
- `ForceSimulation` : simulation de forces à la d3-force (comme Obsidian) — ressorts sur les liens, répulsion en
  1/distance entre toutes les paires, attraction vers le centre, énergie `alpha` qui décroît jusqu'à l'arrêt. Maison,
  déterministe (départ en spirale ou près des voisins), quadratique : un pas coûte ~4 ms pour 1 200 nœuds. Les nœuds
  déjà dessinés gardent leur place quand l'extrait change. `layoutGraph` la mène à son terme d'un coup (tests).
  Constantes `REPEL_SCALE` et `CENTER_SCALE` : elles relient les curseurs d'Obsidian aux forces, à régler à l'œil.
- *Animer* (`appearanceOrder`) rejoue la constitution du graphe : les décisions paraissent par date croissante, les
  notes et articles avec la première décision qui leur est liée ; `ForceSimulation.setActive` / `reveal` tiennent les
  nœuds à l'écart jusqu'à leur tour.
- Rendu (`graphRenderer.ts`) : **canvas 2D**, hors React (la boucle de dessin ne tourne que tant que la simulation ou la
  vue bougent). Couleurs lues dans les variables du graphe d'Obsidian (`--graph-line`, `--graph-node`, `--graph-text`,
  `--graph-node-focused`), donc celles du thème, relues à `css-change`. Survol / sélection : le nœud et ses voisins
  restent allumés, le reste s'estompe ; intitulés qui apparaissent avec le zoom (seuil de fondu) et selon le degré ;
  glisser un nœud, glisser le fond, molette, pincement à deux doigts ; cadrage automatique tant qu'on ne touche pas à
  la vue. Une décision pâle n'est que citée, pleine elle a une fiche ; une note creuse est isolée.
- Vue : `GraphTab.tsx` (extrait, cartes de droite, légende), `GraphCanvas.tsx` (lien React ↔ dessin),
  `GraphControls.tsx` (panneau de réglages). Sur petit écran, la fiche du nœud touché s'affiche en bas du graphe.

### Où se décide quoi

| Question | Réponse | Code |
|---|---|---|
| Que cite cette note ? | Table `citations`, `ReferenceIndex.cached` | `references/index.ts` |
| Cette référence a-t-elle un lien ? | `ReferenceIndex.linkFor` | `references/index.ts` |
| Cette décision est-elle lue ? | `decisions.status` | `references/index.ts` |
| Cette décision a-t-elle une fiche ? | `fiches.legifrance_id` = identifiant de la décision | `ReferenceIndex.ficheFor` |
| Où en est le cycle ? | `cycleProgress` | `references/lifecycle.ts` |
| Quelle pastille afficher ? | `sourceState` | `references/lifecycle.ts` |
| Quels textes contiennent ces mots ? | `searchTexts` | `references/textSearch.ts` |
| Quels liens entre notes, décisions et articles ? | `buildGraph` | `references/graph.ts` |
| Quelle version de l'article à cette date ? | `versionAt` | `references/versions.ts` |

Quand vous ajoutez une étape (une nouvelle source, par exemple Judilibre), ajoutez-la à `cycleProgress` : elle
apparaîtra dans la vue et dans les réglages, avec son bouton.

### Statuts d'une décision (`decisions.status`)

`pending` (à compléter) → `complete` (texte et métadonnées en base) ; ou `external` (page hors Légifrance, sans
texte) ; `unresolved` (introuvable, retentée plus tard) ; `error` (échec réseau, retentée après `ERROR_RETRY_MS`).

### Identifiants

- `decisionKey` (`ids.ts`) extrait la clef d'une décision depuis un identifiant ou une adresse : identifiant
  Légifrance (`CETATEXT…`, `JURITEXT…`, `CONSTEXT…`), adresse ArianeWeb, page du Conseil constitutionnel, page RGD.
- Une `DecisionRecord.id` est cette clef quand elle est connue, sinon la clef de la référence ou `fiche:<chemin>`.
- Les clefs de références (`refs.key`) sont fabriquées par le parseur (`makeKey`) : `decision|court=ce|number=…`,
  `decision|court=ce|decided=…|name=…`, `article|…`. **Changer la façon de fabriquer une clef impose une
  migration** (§5).

## 4. La base SQLite (`references/database.ts`)

sql.js (SQLite en WebAssembly) : la base **vit en mémoire** ; le plugin écrit le fichier `legifrance.sqlite` du
dossier du plugin à chaque série de modifications (`DatabaseFile.save` dans `references/databaseFile.ts`, planifiée par `main.ts`, dernière écriture à la
fermeture). Conséquences :

- une requête sur toute la base n'est pas coûteuse en disque, mais le **travail en JavaScript autour** l'est.
  Préférez filtrer, trier et paginer en SQL (modèle : `articlePage` dans `corpus.ts`) ;
- pas de clefs étrangères (`Database.export()` réinitialise les pragmas) : les suppressions en cascade sont
  faites à la main (`prune`, `remove`, `rename` dans `index.ts`) ;
- `LegalDatabase.version` s'incrémente à chaque écriture : c'est la clef des caches (voir §7).

Tables principales :

| Table | Contenu |
|---|---|
| `notes` | Notes analysées (`mtime` : on ne réanalyse que ce qui a changé). |
| `refs` | Une ligne par référence distincte (décision, texte, article, identifiant, droit de l'Union). |
| `citations` | Qui cite quoi : note, référence, rang, nombre. |
| `links` | Adresse retrouvée, texte et **statut de vigueur** d'un article ; `previous_status` et `changed_at` pour la veille. |
| `misses` | Recherches infructueuses (retentées après un délai). |
| `fiches` | Notes reconnues comme fiches, avec l'identifiant Légifrance. |
| `decisions` | Métadonnées, texte intégral (HTML et Markdown), thèmes, résumé, vocabulaire (`terms`). |
| `decision_articles` | Articles visés par le texte de chaque décision. |
| `decision_relations` | Généalogie (confirme, renverse, précise, écarte, cite). |
| `article_versions` | Versions d'un article (identifiant, état, dates de vigueur), relevées sur l'API à la demande. |
| `decision_merges`, `decision_dismissed` | Rapprochements manuels et suggestions écartées. |
| `documents` | Documents consultés dans la recherche (cache avant l'API). |
| `meta` | Version du schéma et du parseur. |

**Ajouter une colonne** : l'inscrire dans `ADDED_COLUMNS` (ajoutée aux bases existantes à l'ouverture), pas
seulement dans `SCHEMA`. **Ajouter une table** : `CREATE TABLE IF NOT EXISTS` dans `SCHEMA` suffit.

## 5. Tâches de fond et migrations

### Tâches (`references/indexer.ts`)

Chaque tâche est un objet `Task` lancé par `plugin.tasks.run` (`references/taskRunner.ts`) : elle rend la main à
l'interface régulièrement, signale sa progression (`plugin.tasks.state`, événement `TASK_EVENT`), et peut être
annulée (`plugin.tasks.cancel`, que la tâche lit dans `plugin.tasks.cancelled`). Toutes passent par le **limiteur de débit** (`api/rateLimiter.ts`) : jamais plus de N requêtes
par minute, priorité aux actions interactives sur les travaux de fond (`Lane`).

| Tâche | Commande | Effet |
|---|---|---|
| `INDEX_TASK` | Indexer les références juridiques du coffre | Analyse toutes les notes modifiées. |
| `ARTICLES_TASK` | Retrouver les articles et textes cités | Adresse, texte et statut de chaque article. |
| `ENRICH_TASK` | Compléter les fiches de décisions | Lit chaque décision sur l'API, analyse son texte. |
| `RETRY_UNRESOLVED_TASK` | Réessayer les décisions introuvables | Relance les `unresolved`. |
| `GENEALOGY_TASK` | Analyser la généalogie | Relations entre décisions (local, sans requête). |
| `REFRESH_TASK` | Actualiser les articles | Revérifie les liens de plus de 6 mois ; garde l'ancien statut. |
| `COMPLETE_FICHES_TASK` | Compléter toutes les fiches | Renseigne les propriétés des fiches. |

### Migrations (`references/migrate.ts`)

Quand le parseur change (clefs, libellés), `PARSER_VERSION` est incrémenté et `migrateParser` /
`upgradeParserData` réécrivent les références **sans perdre** liens, textes et thèmes. Toute modification de
`makeKey` ou de `cleanPartyName` s'accompagne d'une migration **et** d'un test dans `migrate.test.ts`.

## 6. Interface

- **Vues** (`views/*.tsx`) : chacune est un `ItemView` qui monte un composant React (`ReactItemView.tsx`) dans un
  `PluginContext`. `usePlugin()` (`views/hooks.tsx`) donne accès au plugin.
- **Événements** (`lib/events.ts`) : `REFERENCES_EVENT` (lien retrouvé, base modifiée), `TASK_EVENT` (progression
  d'une tâche), `HISTORY_EVENT`. `useDatabaseVersion()` renvoie un numéro qui change quand la base change (lissé par un
  `debounce`) : les analyses en dépendent pour se recalculer.
- **Panneau des références** (`components/references/`) : références de la note active, avec la pastille
  d'état des décisions ; pour une fiche, `FicheInsights`.
- **Analyse de la jurisprudence** (`components/jurisprudence/`) : onglets Articles (par défaut, lu en SQL, page par
  page, avec filtres texte / vigueur et deux tris ; la version applicable à la date de chaque décision se
  demande par un bouton), Chronologie et Graphe (ils recensent toutes les décisions à l'ouverture) et Recherche (dans les
  textes, sans recensement). Le bouton « À faire → » mène à la vue Base de données.
- **Vue Base de données** (`components/database/`) : trois onglets — *Cycle de la donnée* (`CycleOverview` : les cinq
  étapes, leur avancement, un bouton par tâche, la légende des pastilles), *À faire* (`TodoTab`, menu des rubriques à gauche : fiches à
  créer, décisions et textes introuvables à préciser, écarts, articles abrogés, citations à vérifier) et *Tables* (contenu brut de la base).
- `Shared.tsx` rassemble les briques communes (`Card`, `Row`, `DecisionRow`, `DecisionInfo`, `Genealogy`).

## 7. Performances : ce qu'il faut savoir

- `decisionsOf(plugin)` (`insights.ts`) recense **toutes** les décisions (parcourt `refs`, `decisions`, fiches,
  fusionne les alias). Son résultat est gardé en cache tant que `LegalDatabase.version` et
  `plugin.notesVersion` (changements de notes et de liens) n'ont pas bougé. Ne le rappelez pas dans une boucle
  de rendu sans `useMemo`, mais l'appeler plusieurs fois ne coûte rien si rien n'a changé.
- Un nouvel onglet qui n'a pas besoin des décisions ne doit **pas** appeler `decisionsOf` : lisez la base
  directement, en paginant (`articlePage`).
- Ajouter une analyse sur toutes les décisions = ajouter un coût à l'ouverture : préférez une requête SQL, ou
  chargez à la demande (au clic).
- Ne rendez jamais toutes les lignes d'une liste potentiellement longue : calculer des milliers de décisions est
  instantané (12 000 en ~350 ms), les afficher d'un coup fige l'interface. La chronologie rend une fenêtre de
  lignes qui s'agrandit au défilement (`IntersectionObserver`), avec un saut par année ; l'onglet Articles pagine
  les décisions d'un article (25 à la fois).
- Pour retrouver la phrase d'une décision qui cite un article (`citingSentence`), on n'analyse que les passages
  autour du numéro de l'article, jamais le texte entier (un texte entier × 100 décisions = plusieurs secondes).
- `ReferenceIndex` garde en mémoire tous les liens (`links`) : l'interface les lit à chaque affichage.

## 8. Les tests

Les tests sont des scripts Node sans framework : chacun est un fichier `*.test.ts` compilé par esbuild en un
fichier `.xxx-test.js` (ignoré par git) puis exécuté. Le script `npm test` les enchaîne et s'arrête au premier
qui échoue ; chacun affiche `tout passe` ou `ÉCHEC <nom>` avec la valeur obtenue et la valeur attendue.

Deux petites aides sont définies en tête de chaque fichier : `eq(nom, obtenu, attendu)` (comparaison par JSON)
et `check(nom, condition, détail)`. Les tests qui ouvrent une base sont asynchrones (`LegalDatabase.open`) et
se compilent avec `--loader:.wasm=binary` pour embarquer le moteur SQLite.

| Fichier | Ce qu'il vérifie |
|---|---|
| `references/parser.test.ts` | **Parseur de citations.** Libellés (loi + décret, décisions, droit de l'Union, RGPD, CPCE, Charte de l'environnement) ; absence de faux positifs ; clefs stables (une décision citée de deux façons = une clef ; deux décisions distinctes = deux clefs) ; nettoyage des noms de parties (crochets, points, « et », initiales, noms longs) ; dates (année seule, mois et année, jours distincts) ; indices (nom, date) attachés à une citation par numéro ; plages de texte des citations. |
| `references/fiches.test.ts` | **Fiches de décisions.** Reconnaissance d'une fiche (propriété, frontmatter vide) ; identifiant Légifrance lu dans le lien ou la propriété ; propriétés à compléter, écrasement ou non ; clefs ArianeWeb / Légifrance / Conseil constitutionnel / Journal officiel / RGD ; requête de recherche tirée du frontmatter (numéro, nom, citation, juridiction) ; comparaison des formations de jugement (sections, chambres réunies, sigles) ; **zéros en tête** des numéros ; titres RGD (Blanco, Despujol, CJUE…). |
| `api/rateLimiter.test.ts` | **Limiteur de débit.** Fenêtre glissante (jamais plus de N requêtes par fenêtre), ordre d'attente, suspension après un refus de quota, changement de limite à chaud, mesure de l'usage, priorité de l'interactif sur le fond. Utilise de vraies durées courtes (centaines de ms). |
| `references/insights.test.ts` | **Analyses.** Thèmes (CE, Cassation, CC) et thème de plus haut niveau ; solution du Conseil constitutionnel ; résumé ; vocabulaire et décisions proches (TF-IDF) ; écarts entre fiche et Légifrance ; filtres de la chronologie ; dates (année d'après le numéro du CC, dates de libellés, date la plus précise) ; **fusion des alias** d'une même décision (Labonne, Despujol, Septfonds, Piccoli…, avec les cas où il ne faut *pas* fusionner) ; rapprochements manuels et suggestions ; comparaison de numéros et de dates des citations ; généalogie. |
| `references/corpus.test.ts` | **Lecture de la base.** Pagination et filtre des articles en SQL (1 200 articles, plus de plafond), jokers `%` et `_` pris à la lettre, filtres par texte de loi et par vigueur, deux tris (plus appliqués ; texte puis numéro, 99 avant 1103), libellés des statuts de vigueur (« Abrogé », « Transféré »…), articles périmés avec leurs notes, compteur de version de la base. |
| `references/graph.test.ts` | **Graphe des citations.** Sur un petit corpus (Blanco, Couitéas, une note isolée) : décisions pivots, notes isolées, nœuds et liens du graphe complet (orientés), degrés, indicateurs (pivot, fiche, isolée), filtres par thème, par note, par texte (intitulé, date, thème, note, article ; tous les mots), fiches seules, orphelins, limites (décisions, articles), liens vers des nœuds absents exclus ; groupes (requêtes `type:`, `theme:`, `path:`, mots, premier groupe qui convient) ; réglages lus en tolérant (bornes, types, groupes mal formés) ; ordre d'apparition de l'animation ; simulation de forces (arrêt, déterminisme, effet de chaque curseur, nœud retenu, positions reprises, nœuds écartés puis révélés, forces extrêmes) et 800 nœuds en moins de 2 s ; lecture en base (décision citée de plusieurs façons = un nœud, date, articles des notes). |
| `references/textSearch.test.ts` | **Recherche dans les textes.** Réduction du texte (accents, casse, apostrophes, longueur conservée) ; mots et expressions entre guillemets ; extraits (mot surligné avec sa graphie d'origine, contexte tronqué, extraits proches réunis, Markdown aplati) ; sur base synthétique : décisions complètes seulement et sans doublon, plus récentes d'abord, articles, documents consultés, portées, tous les mots requis, pagination. |
| `references/versions.test.ts` | **Versions d'un article.** Lecture de la réponse de l'API (réponse réelle abrégée de l'art. 1240 : ancienne version 1804-2016, version actuelle) ; version applicable la veille, le jour même (début inclus, fin exclue) et après une réforme ; date incomplète (année ou mois) exacte ou ambiguë ; article inexistant à la date, lacune, date illisible. |
| `references/lifecycle.test.ts` | **Cycle de la donnée.** Les cinq étapes dans l'ordre, une tâche par étape ; compteurs sur une base synthétique (notes analysées, articles retrouvés / introuvables / hors de portée / à retrouver, décisions traitées, généalogie, fiches reliées) ; état d'une source (fichée, citée, fiche non citée). |
| `references/migrate.test.ts` | **Migrations sur base synthétique.** Anciennes clefs réunies (Monpeurt, Bouguen, Camino, Labonne) sans perdre citations, liens ni fiches complètes ; échecs oubliés quand le nom était abîmé, conservés sinon ; idempotence ; veille des articles (statut ou texte modifié, « Vu ») ; enregistrement et relecture de la généalogie. |

### Écrire un test

1. Mettez la logique dans un module pur.
2. Ajoutez le cas dans le fichier de test le plus proche (ou créez `xxx.test.ts` et ajoutez-le au script `test`
   de `package.json`, ainsi que `.xxx-test.js` à `.gitignore`).
3. Pour une régression constatée dans le coffre : **reproduisez-la avec des données inventées**, jamais avec le
   contenu réel des notes ou de la base. Les tests existants (Monpeurt, Labonne, Despujol…) sont des décisions
   publiques.

### Ce qui n'est pas testé

Les vues React, les appels réels à l'API (résolution, consultation), l'écriture dans le coffre (création et
correction de fiches) et les tâches de fond de bout en bout. Pour les changer, vérifiez à la main dans
Obsidian, avec `npm run dev`.

## 9. Conventions

- Commentaires et textes d'interface en **français**, un commentaire de documentation (`/** … */`) par fonction
  exportée et par module : dire *pourquoi*, pas répéter le code.
- Pas d'accès direct à la base depuis les composants quand une fonction de `corpus.ts` / `index.ts` existe.
- Un statut de l'API ne s'affiche jamais brut : passer par `statusLabel` (`corpus.ts`).
- Les listes de notes affichent le **nom** de la note (`noteName`), jamais le chemin complet.
- Une nouvelle source de décisions (Judilibre, EUR-Lex…) : implémenter `DecisionSource`
  (`references/sources/types.ts`), l'ajouter à `SOURCES` (`sources/index.ts`) et enseigner à `decisionKey`
  (`ids.ts`) la forme de son identifiant.
- Données du coffre et de la base : on n'en copie jamais le contenu dans le dépôt, les tests ni les journaux.

## 10. Pièges connus

- **Boucle de rendu** : `useNoteReferences` distingue `reparse` (relance l'analyse) de `refresh` (simple
  réaffichage). Relancer l'analyse depuis l'événement émis par la résolution fige Obsidian.
- **Obsidian émet `create` pour chaque note au démarrage** : le plugin ignore ces événements tant que
  `workspace.layoutReady` est faux.
- **Requêtes Légifrance** : un fond ou un champ erroné renvoie un 400 ; une recherche approchée peut renvoyer un
  autre document, d'où le contrôle du numéro, de la date et des parties dans `resolver.ts`.
- **Numéros de décisions** : comparés sans espaces, points, tirets ni zéros de tête (`04749` = `4749`) ; au
  Conseil constitutionnel, sans le type (`DC`, `QPC`).

## Le graphe des citations est désactivé

L'onglet « Graphe » de l'analyse de la jurisprudence n'est plus affiché (`GRAPH_ENABLED = false` dans
`JurisprudencePanel.tsx`) : il n'était pas assez intuitif. Tout le code est conservé (`GraphTab`, `graph.ts`,
`graphRenderer.ts`, réglages et tests) ; remettre l'indicateur à `true` le réaffiche.

## Lire un code (table des matières, lecteur d'article)

- **Vue Code** (`views/CodeView.tsx`, `components/code/CodeToc.tsx`) : sections qui se déplient (seules les sections ouvertes sont affichées), filtre par numéro d'article ou mot d'un titre (`filterToc`, limité à 300 articles), date de version. Ouverte par `plugin.openCode(textId, titre?, cid?)` : titre d'un code dans les résultats, commande « Parcourir un code », bouton « Dans le code » du lecteur.
- **Lecteur d'article** (`components/reader/ArticleBar.tsx`) : chemin dans le code, liste des versions, article précédent / suivant, renvois cliquables (liens `LEGIARTI` / `LEGITEXT` ouverts dans le plugin ; les liens relatifs de l'API sont rendus absolus par `lib/links.ts`).
- **Ouvrir un document** : toujours `plugin.readLegalDocument` (base d'abord, sinon l'API, puis lecteur). La navigation d'article en article passe `history: false` : le texte rejoint la base (`documents`) mais pas l'historique de `data.json`, qui ne grossit donc pas.
- **Données** : la table des matières (grosse) et le contexte d'un article ne sont gardés qu'en mémoire (`legislation.ts`, quelques entrées), jamais dans la base ni dans le coffre. Les identifiants lus dans l'état d'un onglet sont contrôlés (`isTextId`, `isArticleId`) avant toute requête ; les titres de l'API sont affichés comme du texte, jamais comme du HTML.
