# RAPPORT CHANTIER — Brancher les unités 3D d'Erik sur le monde de jeu

Date : 05/09/2026 · Baseline : 868+ tests · schemaVersion **18 inchangée**, zéro gameplay.

## Ce qui était cassé

Les créatures cyber de l'atelier (Script de Base, Sentinelle Réseau — `ba04abe`) s'affichaient dans le labo `#/lab3d` mais pas en vraie partie : le calque `unites` de `structures3d.ts` existait, l'atelier l'alimentait, mais **`GameCanvas.svelte` ne transmettait jamais d'unités** au planificateur. Le diagnostic du handoff était correct ; précision : le labo ne l'alimentait pas encore non plus (seul l'atelier le faisait).

## Livré

- **L1 — Branchement (module partagé)** : nouveau `render3d/unites3d.ts` (même pattern que `rendement.ts`) — assemble le calque `unites` depuis l'état filtré (id, gabarit, q, r, owner, terrain, fog ; embarquées R-117 et hors vision exclues, miroir du rendu 2D). Consommé **à la fois par `GameCanvas.svelte` (vraie partie, à chaque tick) et par `Lab3d.svelte`** — zéro logique dupliquée. Le guerrier est donc visible en 3D dans le jeu ET au labo.
- **Playback** : `EntiteStructure.interpole` (deQ/deR/deTerrain/t) — le planificateur lerp **position ET élévation** entre les cases de départ et d'arrivée ; `GameCanvas` reconstruit le calque à chaque frame de playback (le modèle se déplace de façon animée, comme le sprite).
- **L2 — Mapping data-driven** : `visuel3d.json` §`structures.unites3d` = catalogue `type moteur → gabarit` (`guerrier`→Script de Base, `archer`→Sentinelle Réseau), validé/exporté par `spec3d.ts` (`MODELES_UNITES3D`, `gabaritUnite3D`). **Tout type absent garde son sprite billboard** (les ~53 autres types) ; quand Erik ajoute une entrée au catalogue, le type apparaît en 3D **sans nouveau code** (testé).
- **L3 — Surcouche** : pour une unité rendue en 3D, les sprites `base`/`accent` du conteneur PixiJS sont masqués (désormais étiquetés) ; **barre de PV, fortification, cargo, badge espion, anneau de sélection restent projetés** et suivent la structure 3D. Accent propriétaire = couleur joueur via `couleurDe` (lame du guerrier, déjà en place). `clickAction`/`rightClickAction` **inchangées** : le picking hexagonal existant sélectionne l'unité 3D au clic (vérifié en GUI).

## Vérifications

- **Tests** : nouveau `apps/web/tests/unites3d.test.ts` (14 tests : catalogue, masquage de décision type→modèle, pools ug* par gabarit, accent R-65, élévation, interpolation, assemblage partagé). **695 rules + 124 web + server verts, typecheck 0 erreur.**
- **GUI sur vraie partie solo** (SRAV8D, Amérique vs Espagne, mode 3D) : pools `ugCorps/ugCoeur/ugPatte/ugBras/ugArme` présents ; Colons garde son sprite, Guerrier en modèle 3D à lame accent rouge (p1) ; clic = sélection de l'unité 3D ; ordre de mouvement + fin de tour = playback suivi (u2 rendue à sa nouvelle case, calque cohérent, aucun `__tickError`).
- **Perf 40×40** (labo, bench carte entière 1600 tuiles + structures) : **60 FPS moyen**, CPU 0,8 ms/frame, 197 draw calls, rebuild 8,3 ms.
- Captures : `dev-logs/captures-unites3d/` (GUI vue + gros plan, labo bench).

## Périmètre respecté

Aucune modélisation nouvelle (le catalogue accueille les futurs modèles d'Erik sans code), aucun changement gameplay/moteur/serveur, schemaVersion 18, pas de renommage V3. Arborescence inspectée avant commit : seuls les fichiers du chantier sont commis (les retouches d'atelier d'Erik ne sont pas dans le dépôt).

## Reste (non bloquant)

- Calibrage visuel fin (échelle/orientation des créatures en vraie partie) : c'est l'acceptation d'Erik.
- Bloom désactivé dans le jeu (décision L0) — les cœurs néon des créatures claqueront avec son activation 🔶.
- L'anneau de sélection reste le tracé hexagonal 2D projeté (cohérent avec villes/structures) ; un anneau 3D dédié est 🔶.
