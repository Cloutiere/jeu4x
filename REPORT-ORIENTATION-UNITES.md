# REPORT-ORIENTATION-UNITES

Mission exécutée le 18/10/2026 (handoff du 17/10, décisions D1-D5 d'Erik). **Les unités regardent dans le sens de leur déplacement.**

## Livré

- **D1 — État** : champ optionnel `faceGauche?: boolean` sur `Unit` (packages/rules/src/state.ts) — absent = droite (création/spawn/début de partie/reprise d'ancienne partie). Mis à jour au **PREMIER pas** de chaque tour de mouvement dans `moveUnit` (packages/rules/src/turn.ts) ; les pas suivants du même tour ne réorientent pas ; dépose navale **oriente** (tranché : OUI, côté du pas transport → case d'arrivée, dans `tenterDepose`) ; à bord = suit son transport (copie dans `moveUnit`). Aucun nouvel ordre, `orderShapeError` non concerné.
- **Helper pur** `directionOrientante(origine, destination, largeur = SANS_WRAP)` (packages/rules/src/hex.ts) : les 6 voisins → `'gauche'` (O/N-O/S-O) ↔ `'droite'` (E/N-E/S-E) ; hors voisinage = `null`. Côté mesuré en **X écran** (`x ∝ q + r/2`, pointy-top — ce que voit le joueur), delta au plus court sur le cylindre (`wrapColDelta` en demi-colonnes ×2). 🔶 **Nota espace colonne** : en colonne pure (`colOf`), un voisin Nord/Sud peut donner Δcol = 0 selon la parité de la rangée — le X écran tranche toujours (N-O ↔ N-E selon la parité visualisée par le décalage demi-case) ; le mapping retenu suit le rendu, pas `colOf`.
- **D2 — Rendu miroir** : retournement AU RENDU uniquement (`scale.x = −echelle`) — zéro asset miroir. S'applique aux sprites `base`/`accent`, à l'art de fondation (`fondBase`/`fondAccent`) et à l'**icône compacte garnison** (`iconeImg` — choix consigné : icône presque symétrique mais retournée aussi par cohérence) ; barres PV, badges, écus, anneaux NON mirroir. Copies couture : `syncCopie` recopie la largeur **signée** des sprites → le flip se propage sans code supplémentaire. Relecture : l'orientation voyage dans l'état, le rendu lit l'état à chaque sync — cohérente par construction.
- **D3 — Table des faces natives** : `apps/web/src/lib/render/orientation-unites.ts` (`FACES_NATIVES`, bascule data-driven par type, corrigible sans code). Planche d'inspection : `devtmp/orientation-planche-unites.png`. **Table complète (30 types avec art propre)** — 🔶 **à valider à l'ŒIL par Erik** (jugée sur la planche, pas en jeu) :

| Natif à GAUCHE (`false`) | Natif à DROITE (`true`) |
|---|---|
| guerrier, colon, piquier, espion, catapulte, canon, infanterie_moderne, galere, chasseur, bombardier, icbm, batisseur | artiste_penseur, archer, cavalier, legion, chevalier, fusilier, char_d_assaut, artillerie, caravane, galion, croiseur, cuirasse, sous_marin, milice, savant, explorateur, humanitaire, leader |

  Les 25 unités uniques sans art propre (guerrier_jaguar, hoplite, keshik, etc.) retombent sur le sprite de leur base — pas d'entrée nécessaire (test de couverture : tout type avec `unite_<id>.png` DOIT figurer dans la table).
- **D4/D5** : zéro gameplay, zéro RNG, `schemaVersion` 27 INCHANGÉE (champ optionnel, aucune migration) ; reprise d'une partie antérieure = tout à droite (défaut), testé.
- **RULES.md §6 R-185** : règle courte ajoutée.
- **Tests** : `packages/rules/tests/orientation-unites.test.ts` (12 — helper, wrap couture, Est/Ouest, premier-pas-seulement, gel repris, immobile, dépose) ; `apps/web/tests/orientation-unites.test.ts` (4 — table, couverture, flip). Suites : règles **vertes** (suite complète), web **671/671**, svelte-check **0**.
- **Captures GUI** (devtmp/orientation-unites-gui.mjs, ports wrangler 8787 — le proxy Vite est FIGÉ sur 8787 dans vite.config.ts, pas de port dédié possible sans toucher la config) : `dev-logs/captures-orientation-unites/` — 1-début-droite, 2-pas-est, 3-pas-ouest-flip, 4-persistance, 5-pile-mixte. **Tous les asserts passent** (état moteur + signe `scale.x` des sprites/icônes). gitignorées comme les captures précédentes.

## 🔶 À l'œil Erik

1. **Table D3** (ci-dessus) — corriger `FACES_NATIVES` sans code si une face est mal jugée.
2. **Calibre visuel du flip** : le guerrier (art quasi de face) rend peu ; les profils nets (canon, galère, chasseur, cuirassé) sont les bons témoins.
3. **Non capturé en GUI** : couture (le flip se propage par `syncCopie` largeur signée — prouvé en lecture de code, pas en capture) et **relecture** (l'orientation voyage dans l'état filtré — testé côté moteur, rendu partagé). À vérifier en ligne.

## Pièges consignés

- **Assert GUI ≠ table D3** : « regarde à droite » peut vouloir dire flip (art natif gauche) — le signe attendu se DÉRUIT de la table, jamais écrit en dur.
- Vite proxy figé 8787 : lancer `node devtmp/orientation-unites-gui.mjs 8787 5174`.
- L'attaque entrante (mêlée) et la régularisation de sur-orientation passent par `moveUnit` → orientent aussi (premier pas du tour) — voulu, consigné.
