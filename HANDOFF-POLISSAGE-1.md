# HANDOFF-POLISSAGE-1 — Socle de capitale, flèche d'annulation, rééquilibrage barbares

Trois signalements d'Erik du 07/09 (session polissage). Petites tranches, mais la n°3 touche le moteur — test-first, R/T à jour.

## 1. Préalables

1. Lire `RULES.md`, `PROJET.md`, `PILOT-HANDOFF.md` §3, `HANDOFF.md` §4.
2. Baseline : **974 tests verts**, typecheck 4/4, `schemaVersion` **19**, `git status` vérifié (l'atelier/fonderie d'Erik peuvent avoir des retouches — ne pas les absorber).

## 2. Les trois correctifs

### C1 — La case de capitale produit 2 nourriture au lieu de 1 (donnée)
**Constat** : `terrain.json` §`ville` porte des rendements de base **food 2 / production 1 / commerce 1** (héritage ancien, antérieur à CENTREVILLE). Le socle R-66 (`growth.json` `cityCenter.floor` 1/1/1) est un plancher : Max(1, 2) = 2 — d'où les 2 bus vus par Erik.
**Décision Erik : la case de ville produit 1 bus / 1 cpu / 1 ram.**
- Corriger `terrain.json` §`ville` → yields **1/1/1** (le plancher R-66 reste en place comme garantie, il devient simplement redondant — ne PAS le supprimer, il protège les cas futurs type cratère).
- Mettre à jour les tests qui citent les rendements de la case de ville ; réaligner RULES.md si le 2 y figure quelque part.
- Vérifier l'effet de bord : toute la démographie de début de partie se recalcule (villes fondées à pop 2, croissance 10×n) — exécuter la suite complète et signaler dans le rapport les tests moteurs impactés. Zéro ajustement d'équilibrage caché : si un test d'équilibre casse parce que les villes grandissent moins vite, c'est la conséquence ATTENDUE de la décision d'Erik, le consigner.

### C2 — Annuler un ordre laisse la flèche affichée (UI)
**Constat** : cliquer « annuler l'ordre » d'une unité n'efface pas sa flèche de programmation — le joueur ne croit pas que l'annulation a marché.
- L'annulation doit retirer **immédiatement** flèche, fantôme et marqueur d'action finale de l'aperçu (R-160 : `previewPrograms` ne doit plus voir l'ordre annulé ; vérifier le chemin gelé aussi — un chemin gelé annulé doit disparaître pareillement).
- Le cas « re-programmer remplace » (D3) doit rester correct : nouvelle flèche à la place de l'ancienne.
- Test web sur l'état de l'aperçu après annulation (pur, pas de rendu).

### C3 — Rééquilibrage des barbares (moteur, test-first, data-driven)
**Comportement actuel** (`barbares.json`) : spawn tous les 3 tours, aggro rayon 6, cap 2/village, escalade tour 15.
**Nouveau cadrage Erik** :
1. **1 barbare dans le camp au début** de la partie ;
2. **+1 après 10 tours**, jusqu'à un **maximum de 3** par camp — le camp se régénère à 3 sans jamais le dépasser ;
3. Les barbares **ne sortent du camp que si une unité ennemie est à 2 cases ou moins** (remplace le rayon d'aggro 6) ;
4. **Ils conservent toujours AU MOINS 1 unité dans le camp** — donc au plus 2 peuvent sortir simultanément.
- Tout en data-driven dans `barbares.json` (nouvelles clés + T-xx dans RULES) : `spawnInterval` → 10, `capPerVillage` → 3, `aggroRadius` → 2, nouvelle clé `gardeMinimale` → 1.
- ⚠️ Cohérence cap/garde : avec cap 3 et garde 1, la sortie est plafonnée à 2 — verrouiller par test.
- Mettre à jour les tests barbares existants (7d) qui encodent l'ancien rythme ; vérifier l'interaction avec l'escalade (unité escaladée `archer` : conservée telle quelle, seul le RYTHME change — signaler tout doute plutôt que d'inventer).
- e2e bot-solo à rejouer : le bot chasse les villages — vérifier que le nouveau rythme ne casse pas la partie solo.

## 3. Critères d'acceptation

- C1 : la case de capitale affiche et produit exactement 1 bus/1 cpu/1 ram (moteur, UI 2D, lueur 3D `rendement.ts` — miroir automatique à vérifier) ; suite verte.
- C2 : annuler un ordre efface flèche/fantôme instantanément (2D et 3D) ; test vert.
- C3 : nouveau rythme barbare entièrement couvert par des tests citant les nouvelles T-xx ; suite verte ; e2e bot-solo vert.
- Typecheck 4/4 ; `schemaVersion` 19 inchangée (aucune des trois corrections ne touche aux données persistées — le confirmer, C3 touche des constantes de génération, pas des états).

## 4. Périmètre interdit

- Tout autre rééquilibrage (économie, civs, merveilles) ; le renommage V3 ; la fonderie ; RELECTURE-3D.
- Supprimer le plancher R-66 (il reste, redondant).
- Si une des corrections révèle un problème plus large, 🔶 dans le rapport — ne pas déborder.

## 5. Fin de session

Rapport `REPORT-POLISSAGE-1.md`, commit/push **sur la demande explicite d'Erik**, arrêt, remise de la main.
