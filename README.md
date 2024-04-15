## Intégration de l'API Légifrance dans Obsidian

Ce module intègre l'API Légifrance dans l'environnement de travail [Obsidian.md](https://obsidian.md/).

Grâce à vos identifiants PISTE (obtenus gratuitement via la [plateforme en ligne](https://piste.gouv.fr/)), vous pouvez désormais utiliser Légifrance directement dans Obsidian !

Très simple d'utilisation, ce module vous permet de rechercher parmi les différents fonds de données de la plateforme afin de consulter les textes directement dans Obsidian. Vous pourrez ainsi créer une note contenant les informations principales des décisions (encore en développement pour la législation et les autres documents) directement dans votre _coffre_ Obsidian.

## Options

-   Recherche simple parmi les fonds principaux de jurisprudence (administrative, judiciaire, constitutionnelle) ;
-   Choix du texte parmi les résultats ;
-   Personnalisation du format des notes créées (via un système très simple d'étiquettes) ;
-   Personnalisation du format des titres (même système d'étiquette) ;
-   Personnalisation du nombre de résultats souhaités (50 maximum).

### Captures d'écran

_Recherche simple :_

<img src="./docs/images/recherche-simple.png" width=50% height=50%>

_Affichage des résultats (mot recherché dans l'exemple : Constitution) :_

<img src="./docs/images/affichage-resultats.png" width=50% height=50%>

_Création de la note automatiquement :_

<img src="./docs/images/note-creee.png" width=50% height=50%>

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

<img src="./docs/images/parametres.png" width=50% height=50%>

## Comment l'utiliser

### Installer le plugin

Pour l'instant, le module n'est pas encore disponible sur l'application elle-même. Vous devez télécharger le dossier ici pour l'installer dans Obsidian (dossier : /.obsidian/plugins/legifrance-integration). Pensez à autoriser l'utilisation de module tiers.

Une fois le module validé par l'équipe d'Obsidian, il sera disponible directement depuis l'application.

### Utilisation de l'API Légifrance

1. Créez un compte sur l'application PISTE : https://piste.gouv.fr/ ;
2. Dans l'onglet `Applications`, créez une nouvelle application ;
3. Entrez le nom que vous souhaitez donnez à cette connexion, renseignez les informations nécessaires. Laissez la case `Activer l'application` cochée. Cliquez sur `Sauvegarder l'application` ;
4. Cliquez sur `Cliquez ici pour accèder à la page de consentement` : c'est une étape importante pour accepter les conditions d'utilisation du service. Sélectionnez le service _Légifrance_ et acceptez les conditions d'utilisation ;
5. Retournez sur la page de l'application créée et sélectionnez l'application `Légifrance` afin d'activer l'accès à l'API. Validez ;
6. Récupérez les identifiants de connexion dans l'onglet de l'application `Authentification`. Il y a là deux types de codes - il faut sauvegarder, dans un lieu secret et accessible de vous uniquement, le `Client ID` et le `Client Secret` (il faut cliquer sur `Consulter le client secret`) de la section OAuth (deuxième volet des identifiants) ;
7. Une fois ces identifiants récupérés, vous pouvez les insérer dans les paramètres du module ! C'est tout !

## TO-DO

-   [ ] Visualisation des documents dans Obsidian dans une fenêtre, sans insertion dans une note.
-   [ ] Recherche dans tous les fonds disponibles.
-   [ ] Recherche complexe : intégration des opérateurs booléens.

## Soutien

Si vous souhaitez soutenir le projet, vous le pouvez via ce lien :

<a href='https://ko-fi.com/O5O7WXMAR' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
