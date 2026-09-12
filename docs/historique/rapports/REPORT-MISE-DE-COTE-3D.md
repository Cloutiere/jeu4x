# REPORT-MISE-DE-COTE-3D — Le 3D derrière un drapeau unique, accès coupé en production

**Mission** : `HANDOFF-MISE-DE-COTE-3D.md` (pivot du 11/09). **Statut : livré, tests + typecheck + build verts.**

## Ce qui a été fait

### M1 — Le drapeau unique
- **`apps/web/src/lib/config.ts` (nouveau)** — la configuration de premier niveau du client, porteur du drapeau **`rendu3d: false`**. Deux fonctions pures : `rendu3dAutorise(preferenceLocale)` (lit la préférence locale UNIQUEMENT si le drapeau l'autorise) et `bascule3dAutorisee()`. Aucune autre valeur codée en dur dans le code : tout point d'entrée 3D passe par là.
- **`apps/web/src/pages/Game.svelte`** — seul fichier de jeu touché :
  - le **bouton « 3D » n'est plus rendu** (`{#if config.rendu3d}`) ;
  - **la préférence locale est ignorée** : même sur une partie où le localStorage disait `rendu3d=1`, le jeu démarre et reste en 2D (le drapeau court-circuite la lecture) ;
  - **la bascule est inerte** : `basculerRendu3d()` retourne immédiatement si le drapeau est à `false`.
- **Raccourcis clavier** : audit effectué — aucun raccourci 3D n'existe (les touches gérées sont Escape/Entrée/F, toutes 2D) ; rien à neutraliser.
- **À `true`** : comportement historique exact (bouton rendu, préférence locale décidant, bascule fonctionnelle) — verrouillé par tests.

### M2 — Ce qui reste accessible (vérifié, non modifié)
- Le **rendu 2D** : zéro ligne de code 2D touchée, tous les tests 2D restent verts sans modification.
- Les outils **`#/lab3d`**, **`#/atelier`**, **`#/progen`** : routage intact (`App.svelte` non touché) — pas coupés par le drapeau.
- La **fonderie** (`fonderie/`, hors app) : hors scope, non touchée.

### Tests (nouveau fichier `apps/web/tests/rendu3d-flag.test.ts`, 5 tests)
- Drapeau à `false` par défaut ; la vue 3D est refusée pour TOUTE préférence locale (`'1'` compris — le cas « partie où la vue 3D avait été activée ») ; bascule inerte.
- Drapeau forcé à `true` : la préférence locale décide (`'1'` → 3D, sinon 2D), bascule active — non-régression de l'existant.

## Vérifications
- **Suite complète** : **1024 tests verts** (rules 750 · server 72 · web 202, lancée en force sans cache). **schemaVersion 19 inchangée**, zéro gameplay : `packages/rules` et serveur non touchés.
- **Typecheck 4/4** (0 erreur svelte-check).
- **Build** de l'app web OK.
- Périmètre interdit respecté : aucun code supprimé (seuls les débranchements autour du drapeau), aucun asset ni `visuel3d.json` ni fonderie touchés.

## Documentation pivot (M4)
- **PROJET.md** : section « 🔄 Pivot du 11/09 » en tête + chiffres actualisés (1024 tests, schemaVersion 19) + file d'attente réorientée.
- **BACKLOG.md** : entrée « REPRISE 3D (mise en sommeil le 11/09) » — chantiers en attente (RELECTURE-3D, tuiles forêt/désert/eau, distinction capitale, V3) et **état des outils à la reprise** (rig éclairage ACES/IBL data-driven, pipeline .glb + cache Cloudflare à renommer, teintes J1-J6, leçon « validation locale avant commit », tree-shaking = premier chantier de reprise si nécessaire).
- **PILOT-HANDOFF.md** : §4 ouvert par un bloc « PIVOT du 11/09 » — nouvelle file (jouabilité 2D, règles, visuel 2D, menus — à cadrer par Erik) + REPRISE 3D en référence au BACKLOG ; l'historique 3D détaillé est conservé pour la reprise.

## Ce qui reste à vérifier par Erik (en ligne, après déploiement)
1. En partie : **pas de bouton « 3D »** dans la barre, jeu 2D — y compris sur une partie où la 3D avait été activée avant le pivot (la préférence locale est ignorée) ;
2. `#/lab3d`, `#/atelier`, `#/progen` toujours joignables par URL ;
3. Reprise éventuelle : passer `rendu3d: true` dans `config.ts` rend tout le comportement 3D tel qu'avant le pivot.

## Accepté en l'état (consigné, pas corrigé)
- Le code Three.js reste dans le bundle même inutilisé (quelques centaines de Ko — l'avertissement Vite sur la taille des chunks préexistait) ;
- Le labo/atelier restent techniquement joignables par URL en prod (pas de secret derrière).

**Fin de session : arrêt, remise de la main. Commit/push sur demande explicite d'Erik.**
