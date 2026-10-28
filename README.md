⚠️ [Obsidian Web Clipper](https://obsidian.md/clipper) a rendu ce plugin quelque peu obsolète. En effet, il permet d'enregister directement depuis son navigateur les informations que l'on veut. J'ai écrit un [petit billet de blog](https://carnetdethese.amimms.fr/posts/2025/03/fin-du-game/) pour faire la transition. Dans cette mesure, **je mets en suspens le développement de ce module**. ⚠️


# MISE À JOUR !

🚨 Si le module ne se lance plus après la mise à jour, désinstallez-le puis réinstallez-le ! 🚨

## Nouveautés

Préparation pour le futur de ce module :
- Recomposition des vues avec la librairie ReactJS - compréhension du code facilitée - meilleur support dans le futur - plus grand contrôle du flow de données - moins de code ;
- Nouvelle vue pour la création des notes : une page unique qui permet de sélectionner le document de travail et sur laquelle on peut ajouter et supprimer des champs personnalisés. Finis les "Faits", "Procédure" etc. Un seul modèle de note vous permet d'intégrer ce que vous voulez comme information. 
    - 🚨 Attention : breaking change. **Il faudra modifier vos modèles pour les intégrer dans le modèle unique afin d'éviter toutes pertes de données**. Les informations sont contenues dans une liste (Array) "notes" d'objets avec deux champ : "titreChamp" et "valeurChamp". Voir plus bas pour les spécifications ;
- Ces différents changements ont conduit à changer la manière dont les documents sont conservés - par conséquent, le module réinitialise à chaque lancement les pages qui étaient ouvertes durant la session précédente. L'historique ne disparait pas : il suffit de rouvrir les pages pour retrouver toutes les informations.

## Bugs résolus

- La page de résultat qui s'ouvrait systématiquement dans l'éditeur où se trouvait l'utilisateur est désormais déplacée dans un onglet à part. Permet d'éviter de perdre du temps à retrouver la page précédente ;
- Le problème de la création d'un double de dossier si le dossier de base était la "racine" du module est maintenant résolu ;
- Possibilité de lancer le module sur mobile ;
- Modification de l'*input* pour la date : élément natif HTML que j'aurais dû implanter déjà depuis longtemps.
- Modifications mineures pour une meilleure gestion du flow de data - et notamment la récupération du token pour l'authentification.

# Légifrance Intégration - Module Obsidian

Un tuto-vidéo est disponible ici :

[![OBSIDIAN - Légifrance Intégration](https://img.youtube.com/vi/yfMnuPNtTqM/0.jpg)](https://www.youtube.com/watch?v=yfMnuPNtTqM)

## Intégration de l'API Légifrance dans Obsidian

Ce module intègre l'API Légifrance dans l'environnement de travail [Obsidian.md](https://obsidian.md/).

Grâce à vos identifiants PISTE (obtenus gratuitement via la [plateforme en ligne](https://piste.gouv.fr/)), vous pouvez désormais utiliser Légifrance directement dans Obsidian !

Très simple d'utilisation, ce module vous permet de rechercher parmi les différents fonds de données de la plateforme afin de consulter les textes directement dans Obsidian. Vous pourrez ainsi créer une note contenant les informations principales des décisions (encore en développement pour la législation et les autres documents) directement dans votre _coffre_ Obsidian.

## Comment le lancer ?

Deux solutions pour le lancer :

-   cliquer sur l'icône "⚖️" dans la barre latérale gauche ;
-   lancer la palette de commande (`Cmd+P` / `CTRL+P`) et chercher "Légifrance Intégration".

## Options

-   Recherche simple parmi les fonds principaux de jurisprudence (administrative, judiciaire, constitutionnelle) ;
-   Choix du texte parmi les résultats ;
-   Personnalisation du format des notes créées (via un système très simple d'étiquettes) ;
-   Personnalisation du format des titres (même système d'étiquette) ;
-   Personnalisation du nombre de résultats souhaités (50 maximum).

### Captures d'écran

Les captures d'écran peuvent différer de votre affichage en fonction du thème choisi.

_Recherche simple et historique :_

<img src="./docs/images/recherche-historique.png" alt="" width=50% height=50%>

_Affichage des résultats :_

<img src="./docs/images/affichage-resultats.png" alt="" width=50% height=50%>

_Editeur de notes :_

<img src="./docs/images/editeur-note.png"  alt="" width=50% height=50%>

_Création de la note automatiquement :_

<img src="./docs/images/note-creee.png"  alt="" width=50% height=50%>

## Paramètres

-   Paramètres de connexion au service PISTE :
    -   Client ID (disponible après inscription au service PISTE) ;
    -   Client Secret (disponible après inscription au service PISTE);
    -   Hôte API (valeur par défaut) ;
    -   Token API (valeur par défaut).
-   Personnalisation :
    -   Modèle de note de jurisprudence ;
    -   Modèle du titre des notes de jurisprudence ;
    -   Choix de nombre de résulats affichés (5 min, 50 max).

<img src="./docs/images/parametres.png"  alt="" width=50% height=50%>

### Les modèles

Vous pouvez personnaliser le modèle de note qui sera créée comme vous l'entendez. Pour cela, utilisez la zone de texte à cet effet dans les paramètres. Le moteur de modèle est Handlebars JS (j'utilisais Mustache avant mais Handlebars offre de plus grandes possibilités). Pour afficher une valeur, il suffit de l'encadrer entre deux paires d'accolades.

ex. `{{titre}}`

Voilà les variables accessibles :

-   `{{ titre }}` - titre de l'entrée. Correspond en général à la citation de la décision
-   `{{ id }}` - l'identifiant de la décision sur la base de données de Légifrance
-   `{{ lien }}` - lien vers le site de Légifrance
-   `{{ origin }}` - Fond dans lequel se trouve la décision
-   `{{ texteIntegral }}` - Le texte intégral de la décision
-   `{{ numero }}` - Le numéro de l'affaire, de la décision
-   `{{ date }}` - Date de la décisions sous la forme YYYY-MM-DD
-   `{{ annee }}` - Année de la décision
-   `{{ juridiction }}` - Juridiction qui a rendu la décision
-   `{{ formation }}` - Formation de la juridction
-   `{{ solution }}` - Solution de la décision
-   `{{ urlCC }}` - Lien vers le site du Conseil constitutionnel pour les décisions du Conseil constitutionnel
- `{{ contributionNote }}` - Contribution ajoutée dans l'éditeur de note. Champ par défaut, qui permet d'ajouter une sorte de courte description du document consulté
-   `{{#sommaires}} {{resume}} {{/sommaires}}` (c'est une liste qui peut contenir plusieurs entrées. La syntaxe ici permet de faire une boucle et d'afficher toutes les entrées) - Liste des sommaires.
- `{{#each notes}} {{this.titreChamp}} {{this.valeurChamp}} {{/each}}` (idem, avec une liste qui contient des objets avec une variable `titreChamp` et une autre `valeurChamp`).

> 🚨 Je ne sais pour quelle raison pour l'instant, mais assurez-vous qu'il n'y ait pas d'espace entre les deux accolades et le mot clef (ie. ne pas faire `{{ #each }}` mais bien `{{#each}}` sans quoi le moteur de template ne fonctionne pas). 🚨

Pour aller plus loin, vous pouvez consulter la [documentation de Handlebars](https://handlebarsjs.com). Une fonctionnalité utile, peut être, par exemple, d'intégrer un affichage conditionnel lorsque vous ne souhaitez pas utiliser l'éditeur de note d'arrêt, en utilisant le bloc `{{#if variable}} {{variable}} {{/if}}`.

## Comment utiliser le module

### Installer le plugin

Vous pouvez installer le module directement depuis le store de l'application. C'est plus facile ainsi.

### Utilisation de l'API Légifrance

1. Créez un compte sur l'application PISTE : https://piste.gouv.fr/ ;
2. Dans l'onglet `Applications`, créez une nouvelle application ;
3. Entrez le nom que vous souhaitez donnez à cette connexion, renseignez les informations nécessaires. Laissez la case `Activer l'application` cochée. Cliquez sur `Sauvegarder l'application` ;
4. Cliquez sur `Cliquez ici pour accèder à la page de consentement` : c'est une étape importante pour accepter les conditions d'utilisation du service. Sélectionnez le service _Légifrance_ et acceptez les conditions d'utilisation ;
5. Retournez sur la page de l'application créée et sélectionnez l'application `Légifrance` afin d'activer l'accès à l'API. Validez ;
6. Récupérez les identifiants de connexion dans l'onglet de l'application `Authentification`. Il y a là deux types de codes - il faut sauvegarder, dans un lieu secret et accessible de vous uniquement, le `Client ID` et le `Client Secret` (il faut cliquer sur `Consulter le client secret`) de la section OAuth (deuxième volet des identifiants) ;
7. Une fois ces identifiants récupérés, vous pouvez les insérer dans les paramètres du module ! C'est tout !

## TO-DO

-   [x] Intégration d'un éditeur de fiche d'arrêt.
-   [x] Visualisation des documents dans Obsidian dans une fenêtre, sans insertion dans une note.
-   [x] Recherche, lecture et création de notes dans tous les fonds : jurisprudence (Conseil constitutionnel, juridictions administratives, judiciaires et financières, CNIL), législation (lois et règlements en vigueur ou à une date, codes, Journal officiel, circulaires), conventions collectives et accords d'entreprise.
-   [x] Recherche complexe : intégration des opérateurs booléens.
-   [x] S'assurer que les _views_ persistent après redémarrage.
-   [x] Gestionnaire d'historique.
-   [x] Meilleur moteur d'affichage des résultats.

### Base de données des références juridiques

Le plugin tient, dans le dossier du plugin, une base SQLite (`legifrance.sqlite`, via sql.js : elle fonctionne aussi sur mobile) qui recense les références juridiques de **toutes** les notes du coffre : décisions, lois, articles de codes, droit de l'Union. Elle conserve pour chaque note qui cite quoi (et combien de fois), les liens Légifrance retrouvés et le texte des articles.

-   **Indexer le coffre** (réglages ou commande) analyse toutes les notes ; ensuite la base suit les créations, modifications, renommages et suppressions de notes.
-   **Compléter les fiches de décisions** retrouve chaque décision sur Légifrance et enregistre sa date, sa formation, sa solution, son ECLI et son texte intégral (une requête par décision ; reprenable).
-   Tables : `notes`, `refs`, `citations`, `links`, `misses`, `decisions` — le fichier s'ouvre avec n'importe quel outil SQLite (copiez-le hors du coffre pour le lire).

### Fonctionnalités intéressantes à développer (si le temps le permet)

-   [x] Un _parser_ permettant de lister facilement tous les textes juridiques présents dans le coffre ;
    -   [x] _Parser_ de décisions.
    -   [x] _Parser_ de textes législatifs.
-   [x] Un _parser_ des notes : liste des décisions, textes et articles cités, avec liens Légifrance, dans un panneau latéral (commande « Afficher les références juridiques de la note »). Pistes : reconnaître davantage de formats de citation, ouvrir les documents retrouvés dans le lecteur du plugin.
-   [x] Une prévisualisation des textes (peut-être sous la forme d'un pop-up lorsqu'on passe la souris au dessus d'un lien lié à Légifrance ?)

## Discord

Pour venir discuter du plugin ou de l'utilisation, en général, des outils numériques en droit, vous pouvez rejoindre le serveur Discord suivant :

https://discord.gg/ha3Vsk6DNQ


## Soutien

Si vous souhaitez soutenir le projet, vous le pouvez via ce lien :

<a href='https://ko-fi.com/O5O7WXMAR' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
