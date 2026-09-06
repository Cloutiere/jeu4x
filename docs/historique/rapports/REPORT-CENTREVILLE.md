# REPORT — CENTREVILLE : socle garanti 1N / 1P / 1C du centre-ville (R-66 rév. 06/09)

Mission [`HANDOFF-CENTREVILLE.md`](HANDOFF-CENTREVILLE.md) — demande d'Erik du 05/09 (fait foi) : **la case de ville produit au minimum 1 nourriture, 1 production et 1 commerce, quel que soit le terrain**, et **détruit toute ressource** qui s'y trouvait. Révision de calcul — `schemaVersion` **18 inchangée**.

## Ce qui a été fait

- **L0 — RULES.md** : R-66 (rév. 06/09) réécrite — socle 1N/1P/1C 🔶 en plancher par ressource sur les rendements calculés du centre (ne plafonne rien), tranche démographique R-60bis **au-dessus** du socle (résout le vote de calibrage 7i en suspens « commerce du centre-ville par tranche » : 1 C dès la fondation, la tranche s'empile ensuite) ; note de non-régression D5 ajoutée à R-64/D5.
- **L1 — Moteur (test-first)** :
  - `growth.json` : `cityCenter` — `{minProduction, commerceByTier}` **remplacés** par `floor: {food:1, production:1, commerce:1}` 🔶 ;
  - `tileYield` (economy.ts) : plancher appliqué **pour le terrain `ville` uniquement**, après tous les bonus (bâtiments, merveilles, traits de civ) — **source unique** moteur/UI/3D ;
  - `cityEconomyInputs` (turn.ts) : le centre passe par `tileYield` (au lieu de `TERRAINS['ville']` codé en dur) ; commerce du centre = socle + tranche + bonus d'empire ; les citoyens intérieurs (R-60bis) inchangés ;
  - `fixtures.ts` : `makeState` pose `{terrain:'ville', resource:null}` sous chaque ville (miroir `processFoundCity`/chargement de carte — condition du socle) ;
  - **Tests** : nouveau bloc `phase7i.test.ts` « R-66 (rév. 06/09) » — 6 tests : multi-terrains (prairie/plaine/forêt/colline/désert → ≥ 1/1/1), centre sur désert pop 1 → 1 C exact, tranche pop 7 s'ajoute AU-DESSUS du socle (1+1), Égypte désert dépasse le socle (le plancher ne plafonne pas), non-régression D5 (ResourceDestroyed + socle sur la ville fraîche), auto-assignation ne touche jamais le centre.
- **L2 — UI/3D** :
  - `CityPanel.svelte` : centre calculé via `tileYield` (helper `centerYields`, contexte civ compris) ; **ligne pédagogique** « Centre-ville : socle garanti 1 N / 1 P / 1 C — quel que soit le terrain » + tooltip R-66/R-60bis ;
  - `Game.svelte` : miroir économie d'empire recalé (1 C + tranche × (1 + intérieurs)) ;
  - **Miroir 3D automatique** : `render3d/rendement.ts` consomme déjà `tileYield` — le glyphe commerce du centre s'allume **dès pop 1**, zéro logique dupliquée ;
  - Bot : aucun recalibrage (consomme `tileYield`).

## Vérification

- **921 tests verts** : moteur 718 (32 fichiers), web 138, serveur 65 ; typecheck web 0 erreur ; `schemaVersion` 18.
- **33 tests existants mis à jour** (décalage +1 C/ville/tour du socle, parfois multiplié : Colosse ×2, Marché/Banque, Troyes/Internet ; sac d'espionnage round(50 %) ; Banque mondiale dégelée si le socle fait franchir 20 000 en cours de tour — test recalé à 19 998).
- **E2E solo (dev local)** : partie 5WR3PR (Égypte vs bot Japon, carte aléatoire) — fondation du Colon sur prairie → tour 1 : **trésorerie 1 (+1/tour)**, panneau de ville **N6 / P1 / C1 → 1 or**, ligne socle affichée ; miroir 3D : glyphe commerce du centre allumé. Labo de cartes (`#/progen`) intact.
- **Captures** : `dev-logs/captures/capture-centreville-panneau-socle.png`, `capture-centreville-3d-glyphe-commerce.png`.

## Décisions d'implémentation documentées (défauts 🔶)

- Le socle est **data-driven** (`growth.json` `cityCenter.floor`) et remplace `minProduction`/`commerceByTier` (supprimés — la sémantique « tranche au-dessus du socle » rend `commerceByTier` obsolète).
- Le centre passe par `tileYield` **avec le contexte civ** (miroir exact du moteur dans l'UI ; aucun bonus de terrain civ ne cible `ville` aujourd'hui, le comportement est inchangé mais l'extensibilité est assurée).
- Le plancher s'applique dans `tileYield` pour tout terrain `ville` — la case du centre étant toujours `ville` (fondation R-64, chargement de carte), la garantie vaut **sur N'importe quel terrain d'origine** (testé).

## Périmètre respecté

Aucun chantier parallèle touché (interaction 3D, spawn, unités 3D, atelier — répertoire inspecté avant commit) ; aucun autre recalibrage ; aucun renommage ; `schemaVersion` 18.

## Livraison

Commit sur `main` → CI GitHub Actions (deploy Cloudflare) → health prod vérifiée après push. *(Complété au moment du push — voir commit.)*
