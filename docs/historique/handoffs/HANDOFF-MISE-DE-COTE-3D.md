# HANDOFF-MISE-DE-COTE-3D — Isoler la vue 3D : code conservé, accès coupé en production

**Décision d'Erik du 11/09** : pivot du projet vers **la jouabilité 2D, les règles, le visuel 2D et les menus**. Le travail 3D (chantiers V1/V2/UNITES-3D/FONDERIE/T5/ECLAIRAGE) est **mis de côté, pas supprimé** : le code reste dans le dépôt, documenté pour une reprise éventuelle, mais **inaccessible en production**.

## 1. Préalables

1. Lire `PROJET.md`, `PILOT-HANDOFF.md` §3-§4, `DESIGN.md` (décisions verrouillées), `BACKLOG.md`.
2. Baseline : tests verts, typecheck 4/4, `schemaVersion` **19** (inchangée), `git status` propre.
3. **Zéro gameplay** : `packages/rules`, serveur, ordres intouchés. Le 3D est une VUE, pas un état moteur — aucune migration.

## 2. Mission

### M1 — Le drapeau unique (le mécanisme)
1. Créer un **drapeau dans un seul fichier de configuration** (ex. `apps/web/src/lib/config.ts` ou entrée data-driven de premier niveau) : `rendu3d: false`.
2. Tous les points d'entrée du 3D **lisent ce drapeau** (pas de valeurs codées en dur dispersées) : le bouton « 3D » de l'UI de jeu n'est pas rendu quand il est à `false` ; le jeu force le rendu 2D même si une préférence locale (localStorage) disait 3D ; la bascule 2D↔3D et tout raccourci associé sont inertes.
3. **Comportement du drapeau `true`** : tout se comporte exactement comme aujourd'hui (test de non-régression : avec le drapeau à `true`, l'existant passe).

### M2 — Ce qui reste accessible
- **Le rendu 2D est le seul chemin de production** : aucune régression possible sur lui (tous les tests 2D existants doivent rester verts sans modification).
- **Les outils de travail restent accessibles en local** : labo `#/lab3d`, atelier `#/atelier`, `#/progen` fonctionnent comme aujourd'hui (le drapeau ne les coupe pas) — ce sont les outils de reprise et d'atelier d'Erik, pas des chemins de gameplay. En prod ils restent techniquement chargés mais sans lien depuis l'UI de jeu.
- **La fonderie** (`fonderie/`, hors app) est hors scope : elle reste autonome et fonctionnelle.

### M3 — Ce qui est volontairement ACCEPTÉ (consigné, pas corrigé)
- Le code Three.js reste dans le bundle même inutilisé (quelques centaines de Ko) : la vraie élimination (tree-shaking/lazy-load) sera le premier chantier de la reprise 3D si elle s'avère nécessaire. Ne pas l'anticiper.
- Le labo/atelier en prod restent techniquement joignables par URL : accepté (pas de secret derrière).

### M4 — Documentation du pivot (aussi importante que le code)
1. **`PROJET.md`** : section « pivot du 11/09 » — objectifs actuels (jouabilité 2D, règles, visuel 2D, menus) ; le 3D « mis de côté, reprisable ».
2. **`BACKLOG.md`** : entrée « REPRISE 3D (mise en sommeil le 11/09) » listant ce qui attend : RELECTURE-3D, tuiles forêt/désert/eau, distinction capitale, V3 visuel — et **l'état des outils à la reprise** : rig d'éclairage ACES/exposition/IBL data-driven dans `visuel3d.json`, pipeline d'assets .glb (fonderie + promotion + mapping), teintes J1-J6, cache edge Cloudflare (renommer les fichiers si reprise), leçon « validation locale avant commit ».
3. **`PILOT-HANDOFF.md`** : la file est réécrite — les chantiers 3D passent en sommeil (référence au BACKLOG), les nouveaux axes (jouabilité 2D, règles, visuel 2D, menus) s'ouvrent.

## 3. Critères d'acceptation

- En jeu (local ET prod après déploiement) : **aucun accès au 3D** — pas de bouton, pas de bascule, le jeu est 2D en toutes circonstances, y compris sur une partie où la vue 3D avait été activée.
- Avec le drapeau à `true` : tout le comportement 3D existant est inchangé (tests).
- Suite complète + typecheck verts ; `schemaVersion` 19 ; zéro gameplay touché.
- Documentation pivot en place (PROJET.md, BACKLOG.md, PILOT-HANDOFF.md).

## 4. Périmètre interdit

- Supprimer du code (moindre : commentaires/débranchements mineurs autour du drapeau) ;
- Toucher aux assets, à `visuel3d.json` (hors lecture du drapeau), à la fonderie ;
- Tout chantier 2D/règles/menus (ce seront les PROCHAINS handoffs — Erik les cadrera).

## 5. Fin de session

Rapport `REPORT-MISE-DE-COTE-3D.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main. Le pilot archive et consigne le pivot.
