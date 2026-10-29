# HANDOFF-CARTE-RONDE-T1 — Monde cylindrique : moteur + génération rotationnelle

**Décisions Erik 04/10** : enroulement **Est↔Ouest seulement** (nord/sud restent des bords) ; le monde rond devient **LA règle pour tous les modes** ; le miroir 1v1 est remplacé par une **symétrie rotationnelle** (adversaire à l'opposé du cylindre). **Le rendu sans couture est la TRANCHE 2** — dans T1 la carte reste affichée en bande avec ses deux bords visibles ; ce qui change, c'est la GÉOMÉTRIE du jeu (on peut la traverser).

---

## 1. Préalables

- Lire `packages/rules/src/hex.ts` (axial pointy-top, Red Blob), `progen/` (génération miroir, `settings.ts`), et RULES.md §6 (mouvements) + R-81..R-82 (tri déterministe).
- Baseline : suites vertes (rules 980 + web 506 + server 120), `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).
- **Aucune migration attendue** : les `q` sérialisés sont déjà dans 0..largeur-1 ; le wrap est une règle de CALCUL (distance/voisinage/chemin), pas de stockage. `schemaVersion` inchangée sauf nécessité démontrée.

## 2. Principes de conception (défauts tranchés — veto Erik possible)

- **D1 — Normalisation canonique** : toute case stockée a `q` normalisé dans [0, largeur). Les entrées (ordres, spawn, régularisations) normalisent ; `orderShapeError` accepte un `q` hors bornes en le normalisant (VALIDER LE VALIDATEUR EN PREMIER).
- **D2 — Géométrie wrap-aware, miroir de l'existant** : `hexDistance` devient « distance la plus courte, couture comprise » (dq ajusté de ±largeur) ; `neighbors`/`hexesWithinRadius`/chemins/portées/fog/PM bouclent Est↔Ouest. Les signatures PURES sans contexte de largeur reçoivent la largeur via le board/état — audit systématique de TOUS les consommateurs de géométrie (mouvement, mêlée, worked tiles, spawn rings, artefacts, espion ≤1, ICBM rayon 1, distances villages/huttes, soutien naval R-118, placement 5 sièges…). Tests de couture pour chaque famille.
- **D3 — Symétrie rotationnelle 1v1** : la demi-carte+rotation 180° est remplacée : contenu engendré sur toute la carte, spawns équidistants sur le CYLINDRE (distance wrap), l'adversaire à l'opposé (décalage ≈ largeur/2), villages/huttes/ressources/artefacts transformés par la même rotation (q + largeur/2, r symétrisé — la forme exacte au choix de l'agent, documentée). Les garanties existantes tiennent : SPAWN-START (anneaux 2F/2P/1E, purge ressources rayon 2), villages 5 sièges (2-5), artefacts îlots + distance capitales 8 (wrap), TOPOGRAPHIES (pangée/rift/archipel), Calibrage CARTE-2 (forêts 50 %, prairies 10 %, ressources ×1.2, Mosaïque).
- **D4 — Bancs re-baselines** : les bancs de conformité (500 seeds, bit-stabilité, VILLAGES-5SIEGES, CARTE-50) sont RÉÉCRITS pour le monde rotationnel avec leurs critères d'équité transposés (distance wrap). Les seeds qui ne tiennent pas sous la nouvelle géométrie sont remplacés et le compte rendu au rapport (plafonds, best-effort comme en 01/10).
- **D5 — Déterminisme intact** : RNG seedé, tris R-81, aucune valeur de gameplay modifiée par T1 (rendements, PM, coûts).

## 3. Mission

- **L1 — test-first (couture)** : suite `carte-ronde.test.ts` : distance wrap (0,39 = 1), voisinage à cheval, chemin traversant la couture (guerrier de q=39 vers l'Est ressort à q=0), PM/fog/worked tiles wrap, combat adjacence à cheval, embarquement/dépose wrap, ordre normalisé (`q:-1` → 39, `orderShapeError` vert), cartes générées 1v1 ET 3-5 sièges : spawns équidistants wrap, anneaux spawn garantis, villages/huttes/artefacts symétriques, TOPOGRAPHIES conformes.
- **L2 — moteur** : D1/D2 (audit exhaustif des consommateurs de géométrie, listé au rapport) ; brouillard, mêlée, artefacts, espion, nucléaire, régularisation SUR-OCCUPATION couverts.
- **L3 — génération** : D3 rotationnelle (miroir supprimé ou devenu cas particulier documenté), bancs D4 réécrits.
- **L4 — serveur/e2e** : partie solo légale où une unité TRAVERSE la couture (dump serveur), une partie multi 3 sièges ; `devtmp/carte-ronde-e2e.mjs` + captures `dev-logs/captures-carte-ronde-t1/`.
- **L5** : suites vertes complètes + typecheck ; RULES.md — nouvelle règle « Monde cylindrique » (§6 ou §2, au choix de l'agent) : enroulement Est↔Ouest, distance wrap, normalisation, symétrie rotationnelle (miroir abrogé) ; commit, push, rapport `REPORT-CARTE-RONDE-T1.md`.

## 4. Critères d'acceptation

1. Une unité programme un déplacement qui franchit la couture et l'exécute ;
2. Distance/fog/adjacence comptent par la couture partout (tests de couture verts) ;
3. Génération 1v1 = adversaire à l'opposé, équité vérifiée sur les bancs re-écrits ; multi 2-5 sièges conforme ;
4. Les garanties de départ (anneaux, villages, artefacts) tiennent sur les nouvelles cartes ;
5. Suites et bancs verts, `schemaVersion` 27 inchangée.

## 5. Périmètre interdit (tranche 2, après acceptation de T1)

Rendu sans couture (caméra bouclante, double affichage au bord, minimap), flèches/aperçus visuels traversant la couture, tout clic-à-la-couture côté client — ET : changement de dimensions de carte, enroulement Nord-Sud, les calibrages 🔶 existants, tout le 3D.

## 6. Fin de session

Rapport (audit des consommateurs, seeds re-baselines, forme exacte de la rotation, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
