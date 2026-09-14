# HANDOFF-CULTURE-FRONTIERES — La frontière progresse palier après palier + diagnostic du GP tour 18

**Chantier correctif du chapitre 2D.** Constats d'Erik du 13/09 en jeu (une seule ville, tour 5) : la frontière culturelle est passée « d'inexistante à 2 cases de rayon » d'un coup, et un GP est sorti au tour 18 — impossible que l'empire ait atteint 150 culture. Décisions tranchées : **10 de culture pour le premier niveau, c'est bon ; au premier palier, la frontière = la zone cultivée seule**.

## 1. Préalables

1. Lire `RULES.md` (R-162 anneaux culturels, T-51/T-52, R-113 rév., R-114 paliers GP, D4/D6 de GP-CULTURE), `docs/historique/rapports/REPORT-EXPANSION-CULTURELLE.md` (la « bande » = disque (travail + anneaux) MOINS zone cultivée — c'est cette lecture qui saute), `PILOT-HANDOFF.md` §5 (piège viewport).
2. Baseline : suite verte (**1091 tests**), typecheck 4/4, `schemaVersion` **22**, `git status` propre (COLON-FONDATION peut tourner en parallèle — vérifier avant d'éditer).
3. **Zéro gameplay** pour M1 (rendu seul) ; M2 est un DIAGNOSTIC — aucun changement moteur sans constat d'Erik.

## 2. Mission

### M1 — La frontière progresse palier après palier (rendu 2D, testé)
1. **Palier 0** (cumul < 10) : aucun liseré de frontière (état actuel — les tuiles cultivées portent leurs hexagones seuls).
2. **Palier 1** (10 ≤ cumul < 100) : le **liseré accent joueur apparaît autour de la ZONE CULTIVÉE seule** (contour de la worked zone — réutiliser `contourUnion`), PAS de bande au-delà. La frontière est donc à rayon 1, jamais à 2.
3. **Palier 2 et plus** : la bande d'extension s'ajoute (disque (travail + anneaux − 1) MOINS zone cultivée — chaque palier supplémentaire pousse la frontière d'UNE case ; liseré + dégradé sur la frontière extérieure seule, comme livré).
4. Forme pure testée : entrée = paliers franchis + rayon de travail ; sortie = rayon de frontière (`frontierRadius = workRadius + max(0, anneaux − 1)`) — le décalage d'un palier est centralisé dans cette fonction, pas dans le dessin. Tests : palier 0/1/2/3, Tribunal (rayon 2) au palier 1 = frontière à rayon 2 = sa zone, pas plus.
5. UI/tooltips éventuels mis à jour (« Frontière : niveau 1 » etc. si représentés).

### M2 — Diagnostic du GP tour 18 (investigation, PUIS correctif si bug)
1. Reproduire le scénario (solo, une ville, ~18 tours) et déterminer la **source exacte** du GP (journal, dump admin) : canal culture (palier 150) vs GP gratuit de technologie (Premier découvrir, R-109/7j) vs palier d'or (R-136).
2. **Si le GP est venu d'une autre voie** : comportement CANON (D4) — aucun bug moteur ; consigner et **rendre la source explicite dans le journal** (libellé « GP de [technologie/or/culture] ») pour que le joueur ne soit plus jamais dans le doute.
3. **Si le GP est venu du canal culture** : c'est un bug de cumul (cultureCumulee gonflée — par exemple multipliée par ville, merveille, ou palier mal indexé) — corriger test-first et le documenter.
4. Vérifier au passage la cohérence de la jauge empire (« Palier N : X / seuil ») contre la cumulée réelle au dump.

### M3 — Vérification
1. Tests M1 (forme pure + rendu), M2 selon constat.
2. e2e + partie solo (captures `dev-logs/captures-culture-frontieres/`) : palier 1 → liseré autour de la zone cultivée seulement ; palier 2 → bande à 1 case au-delà ; une seule ville, la frontière ne dépasse jamais rayon 1 au palier 1.
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 22, zéro gameplay (sauf constat M2.3 — à signaler dans le rapport), zéro diff 3D.

## 3. Notes

- **Le problème du zoom vue ville est MIS DE CÔTE** (décision Erik) — ne pas le traiter ici ; il reste au backlog avec le handoff CORRECTIFS-VUE-VILLE (M1 shelvé).
- Les seuils T-51 (10/100/1 000/10 000) restent data-driven — le calibrage fin se fera à l'œil par Erik une fois la lecture corrigée.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie, viewport réaliste). Rapport `REPORT-CULTURE-FRONTIERES.md` (y compris le verdict M2 avec sa preuve), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
