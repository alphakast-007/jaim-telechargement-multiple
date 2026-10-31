# Jaim — Téléchargement multiple

Extension Chrome Manifest V3 pour télécharger les fichiers directs ouverts dans plusieurs onglets et repérer les images/médias exposés par les pages d’un groupe.

## Ce que fait Jaim

- Sélectionne des onglets ou un groupe Chrome et télécharge des fichiers directs pris en charge.
- Pour les images et médias visibles dans les pages, clique sur **Scanner les images et médias du groupe**. Chrome demande alors l’autorisation pour les domaines concernés.
- Pour Google Drive, utilise l’API Drive en lecture seule et exporte les Docs/Sheets/Slides en PDF.

Le scan média repère les images assez grandes et les sources HTTP/HTTPS directes trouvées dans les balises `video`, `audio` et les liens. Il ne reconstitue pas les flux HLS/DASH (`.m3u8`/`.mpd`), les URL `blob:`, les médias DRM ni les originaux cachés derrière des extracteurs propres à certains sites.

## Installation manuelle dans Chrome

1. Télécharge et décompresse l’archive ou clone le dépôt.
2. Ouvre `chrome://extensions` dans Chrome.
3. Active **Mode développeur**.
4. Clique **Charger l’extension non empaquetée**.
5. Sélectionne ce dossier, celui qui contient directement `manifest.json`.
6. Épingle Jaim depuis le menu des extensions.

Cette installation locale est gratuite. Il faut garder le dossier de l’extension à son emplacement. Chrome peut afficher un avertissement parce que Jaim n’est pas installé depuis le Web Store. [Guide officiel Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Google Drive et OAuth

L’archive contient l’identifiant client OAuth public configuré pour le projet Google de l’auteur. Un identifiant client n’est pas un mot de passe et aucun `client_secret` n’est inclus.

**L’accès Drive n’est pas garanti pour une copie installée par une autre personne.** L’identifiant OAuth Chrome est associé à un identifiant d’extension et le projet Google actuel peut être en mode test. En mode test, le propriétaire du projet doit ajouter les utilisateurs dans **Google Auth Platform > Audience > Test users** ; la limite est de 100 testeurs et les autorisations expirent après 7 jours. Pour ouvrir Drive à un public plus large, l’auteur doit publier/vérifier le projet OAuth et configurer l’identifiant de l’extension distribuée. [Règles Google sur le mode test](https://support.google.com/cloud/answer/15549945).

Le téléchargement direct et le scan des médias ne nécessitent pas de clé d’API tierce. Ils ne contournent pas les connexions, les protections de téléchargement ou les droits d’accès aux fichiers.

## Confidentialité

Jaim lit les titres et URL des onglets ouverts pour afficher la sélection. Le scan de contenu ne démarre que lorsque l’utilisateur clique sur le bouton de scan ; Chrome demande alors l’accès aux sites sélectionnés. Les liens Drive sont envoyés à l’API Google Drive avec l’autorisation OAuth de l’utilisateur. Jaim ne contient aucun serveur de collecte ni outil d’analytique.

Avant de distribuer Jaim au public, publie une politique de confidentialité cohérente avec ces traitements et complète les déclarations de données requises par le canal de distribution choisi.

## Envoyer ce projet sur GitHub depuis le terminal

Cette procédure crée le dépôt et pousse le code avec GitHub CLI. Elle ne demande pas de créer le dépôt dans le tableau de bord du site. La première connexion `gh auth login` peut ouvrir le navigateur pour authentifier la CLI ; la création et l’envoi du dépôt se font ensuite dans le terminal.

Installe [Git](https://git-scm.com/download/win) et [GitHub CLI](https://cli.github.com/), décompresse le ZIP, puis ouvre PowerShell dans le dossier décompressé. Lance :

```powershell
gh auth login
git init -b main
git add .
git commit -m "Jaim 1.2.1 initial"
gh repo create jaim-telechargement-multiple --public --description "Extension Chrome pour télécharger des fichiers depuis plusieurs onglets" --source=. --remote=origin --push
```

`gh auth login` demande de choisir GitHub.com et le protocole de connexion. Une fois authentifié, `gh repo create` crée le dépôt public, ajoute `origin` et pousse la branche `main`.

Pour pousser des changements plus tard :

```powershell
git add .
git commit -m "Décris les changements"
git push
```

## Développement

La version courante est `1.2.1`. Pour installer des changements locaux, reviens sur `chrome://extensions` et clique sur **Actualiser** sur la carte Jaim.
