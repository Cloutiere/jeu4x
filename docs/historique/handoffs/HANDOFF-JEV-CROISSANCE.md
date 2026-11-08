# HANDOFF-JEV-CROISSANCE — Rouvrir la fenêtre de fondation + confirmer l'écrasement en condition réelle

**Statut : prêt — NON LANCÉ.** Suite directe de JEV-STRATEGE (acceptée `52f1629`). Deux objets, un banc : (a) le calibrage DATA `configCondense.gainSite` — le diagnostic stratege a montré que la fenêtre « gainNet > 0 » se referme vers t100 (0-1 sites corrects), verrou de l'expansion (2,0 villes/partie vs cible ≥ 4) ; (b) le banc de confirmation du correctif D-B bis (`cibleEcrasement`) — la partie 1 (rencontrée t41, capitale jamais vue, rapport 10×, 600 tours de paix) doit enfin finir, et les déclarations `motif:'ecrasement'` doivent apparaître au transcript. **Budget : ≤ 1,00 $ (5 parties complètes, plafond 600 — Erik a relevé le plafond pour ne plus couper la 5ᵉ partie).**

## 0. Préalables

1. `REPORT-JEV-STRATEGE.md` (§3 le correctif, §4 la carte des leviers) + `HANDOFF-JEV-STRATEGE.md` (D-A/D-B/C1/C2 en vigueur) ;
2. Code/data : `packages/rules/src/data/civilizations.json` ou le data où vit `configCondense.gainSite` (partCouronne, penaliteDistance, risque — TROUVER la source exacte et la consigner ; ⚠ c'est du DATA moteur ou du config condensé : identifier si `gainSite` vit côté `packages/rules` ou côté harnais `sableuse/src/condense.mjs` — si harnais, port TS bit-à-bit obligatoire) ; `sableuse/src/joueur.mjs` (cibleEcrasement — INTACT, à confirmer) ;
3. ⚠ Discipline : tests FIRST, banc vanilla long via tsx (`--vanilla --plafond 600`), mètre `analyse-vanilla.py`, sonde crédits 402 avant de lancer, jev-port via config dédiée, suites complètes avant push.
4. ⚠ Entrelacement : personne d'autre sur `sableuse/`, `apps/server/src/jev/`, les data de fondation.

## 1. Décisions de tranche (défauts tranchés — veto Erik possible)

- **D1 — Calibrage `gainSite` (data, pas de logique)** — trois leviers, défauts proposés, à justifier par un recalcul AVANT le banc (tableau avant/après du nombre de sites corrects aux t50/t100/t200 sur 2-3 seeds du corpus, sans LLM) :
  - `penaliteDistance` : 2 → **1** par case (la distance au territoire tue la fenêtre vers t100 ; 1/case la maintient ouverte plus longtemps) ;
  - le seuil de `gainNet > 0` (ou son équivalent) : abaissé pour tolérer les sites « moyens » — proposer la valeur exacte après avoir lu la formule, en visant « sites corrects ≥ 3 jusqu'à t300 » sur les seeds test ;
  - `risque` (pénalité de danger) : INCHANGÉE au premier passage (un seul levier fort à la fois — si le recalcul montre que risque domine, le consigner et le proposer à Erik au lieu de l'appliquer).
  ⚠ Si `gainSite` est partagé avec les BOTS classiques (même config de fondation), vérifier l'effet aux bancs bot 40×3 gratuits : l'expansion bot peut en profiter — acceptable si zéro collapse, à consigner ; si l'effet bot est fort, proposer de scinder la config (banc Jev vs prod) au lieu de la changer.
- **D2 — AUCUN autre changement** : `cibleEcrasement`, les questions v9, la marche, le siège, les voiles opportuniste : INTACTS. C'est une mission de calibrage + confirmation.
- **D3 — Banc de confirmation UNIQUE ≤ 1,00 $** : 5 parties vanilla longues (les 5 seeds du banc stratege, dont la partie 1 seed 3538506724 et la partie 5 coupée 214915776 — les 5 COMPLÈTES cette fois). Tableau : villes/partie (LE critère ≥ 4), déclarations mécaniques au transcript (motifs `ecrasement`/`espace`/`domination` avec conditions horodatées), victoires (non-régression 3/4 finies) et tours, parties finies = 5/5 (plus de coupe budget — c'est le but du plafond relevé).

## 2. Mission L0→L4

- **L0** : préalables, sonde crédits, suites vertes (sableuse 198, jev-port 35).
- **L1 — Localiser `gainSite`** (moteur ou harnais) + recalcul sans LLM (script, 2-3 seeds) : tableau de sites corrects avant/après aux t50/t100/t200/t300. C'est ce tableau qui VALIDE le choix des valeurs avant de dépenser 1 $.
- **L2 — Tests FIRST** : le data lu au calcul de fondation (verrou de valeur) ; si harnais : port TS bit-à-bit + tests croisés jev-port ; bancs bot 40×3 gratuits avant/après (zéro collapse — cf. D1).
- **L3 — Banc UNIQUE ≤ 1,00 $** (5 parties complètes) : le tableau du rapport (villes, motifs de déclaration, victoires, tours, coût réel par partie). Suites complètes, commit + push, rapport `REPORT-JEV-CROISSANCE.md` (recalcul L1, tableau banc, la partie 1 tranche : finit-elle et comment).
- **L4 — Remise de la main** : rapport + arrêt. Erik lit ; si l'expansion est toujours sous 4 villes, le rapport propose le levier suivant chiffré (risque ? partCouronne ? scission de config ?) SANS l'appliquer.

## 3. Critères d'acceptation

1. Expansion : **≥ 4 villes/partie en moyenne** (vs 2,0) — ou diagnostic chiffré montrant le levier restant (alors Erik tranche) ;
2. Écrasement : au moins une déclaration `motif:'ecrasement'` au transcript en condition réelle ; la partie 1 finit (victoire OU guerre visible) ou le rapport explique chiffré pourquoi non ;
3. Non-régression : victoires conservées (les parties qui finissaient finissent encore) ; bancs bot sans collapse ; 5/5 parties complètes ;
4. Suites toutes vertes ; `schemaVersion` 28 ; budget ≤ 1,00 $.

## 4. Périmètre interdit

Toute logique de fondation (la formule reste — seules les VALEURS data bougent, D1) ; `cibleEcrasement` et les questions v9 (INTACTS — confirmation seulement) ; la conquête par direction du théâtre (backlog, pas cette mission) ; moteur hors data ; bots tactique ; Zii ; client. Pas de re-run hors verdict Erik en session. Jamais de secret ni de fichier non tracké d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : le chapitre « croissance » se clôt, reste au backlog : conquête par direction (fog), zapping de voie (coût jetons), miroir JvJ, atelier voix de Zii, vieux 🔶.
