# REPORT-DEPLACEMENT-PLANIFIE — Aperçu de programmation, flèches, conflits, multi-étapes (06/09/2026)

Exécution du handoff [`HANDOFF-DEPLACEMENT-PLANIFIE.md`](../../../HANDOFF-DEPLACEMENT-PLANIFIE.md) — décisions **D1–D6 tranchées par Erik le 06/09**, non rouvertes.

**État final : 957 tests verts (746 rules + 70 server + 141 web), typecheck 4/4, e2e bot-solo et artefacts verts sur wrangler dev réel. `schemaVersion` 18 → 19. RIEN N'EST COMMITTÉ — Erik déclenche (§7 du handoff).**

## 0. Préalables

- Baseline vérifiée avant chantier : 928 tests verts, typecheck 4/4, `git status` propre (commit `2fb570a`) — les retouches d'atelier d'Erik n'ont pas été touchées.
- **L0 — leçon appliquée en premier** : `orderShapeError` du GameDO a été étendu à la forme `MultiStep` AVANT l'implémentation moteur (tests `tests/orderShape.test.ts` : composite accepté, chemin vide/non-hex/action inconnue/unitId manquant refusés). ✔ critère d'acceptation n°1.

## 1. Moteur (`packages/rules`) — test-first, R-158..R-161

- **R-158 (D5) — ordre composite `MultiStep { unitId, path, final? }`** : déplacement(s) (R-40..R-43 inchangés) puis UNE action finale (`foundCity`). L'action s'exécute en Phase C via injection d'un ordre `FoundCity` synthétique dans `processFoundCity` — TOUTES les validations métier existantes re-appliquées. Échecs propres testés : PM insuffisants au terme → action annulée, mouvement conservé ; blocage en cours d'étapes → exécutable fait, chemin gelé **en forme composite** ; entrée fog → action annulée (R-161×R-158). L'attaque après déplacement = dernier pas SUR l'ennemi (combat d'entrée existant, D4) — aucun nouveau duel, testé.
- **R-159 (D2/D3) — priorité de destination** : chronologie de programmation (index dans la file du joueur ; chemin gelé = priorité la plus ancienne ; tie `unitId`). Destination disputée amie/amie : la première programmée gagne, les suivantes ont leur chemin **tronqué avant la destination** (avancent au max de leurs PM, s'arrêtent à la dernière case libre ; à 0 case, restent sur place). Le traitement reste en ordre `unitId` (R-41). Exclusion `FormArmy` (co-location R-44).
- **R-160 (D1) — aperçu optimiste** : nouveau module **`src/preview.ts`** (`previewPrograms`, `disputedTilesOf`) — chemin prévu (tronqué fog), destination, action finale, cases disputées + gagnant. Source unique UI 2D/3D.
- **R-161 (D6) — limite fog** : 1 case inconnue par tour (`board.unknownEntered`, mémorisé dans `moveUnit`), chemin ignoré après l'entrée ; case inconnue infranchissable → arrêt AVANT le fog. Testé : unité 5 PM à 3 cases du fog s'arrête sur la première inconnue.
- **Migration 18 → 19** : normalisation des chemins gelés `Move` en composites à une étape ; idempotent ; une partie pré-19 avec chemin gelé reprend et le chemin s'exécute (tests).
- **Déterminisme** : test bit-à-bit (composite + dispute + seed) vert.

## 2. Serveur (`apps/server`)

- `orderShapeError` : cas `MultiStep` (voir §0).
- **`upsertOrderPreservingPriority`** (helper pur, exporté, testé) : re-programmer **remplace en place** (priorité conservée — D3) ; annuler puis re-programmer = fin de file. Utilisé par `handleOrder` ET la génération des ordres du bot.
- Persistance : les brouillons composites et leur index de priorité vivent dans le stockage DO existant (clé `orders`, motif §3.5) — la file EST la priorité ; migration du `GameState` gérée au §1.
- Aperçu/fog : l'aperçu est calculé côté client **sur l'état filtré** (R-160) — aucune fuite possible par construction ; test moteur « aperçu sur état filtré » vert.

## 3. UI (`apps/web`) — 2D ET 3D (dessiné dans `overlayLayer`, projection caméra partagée)

- **Flèches** de programmation dessinées depuis `previewPrograms` : jaune (déplacement), **vert + marqueur ⌂** (action finale fondation) ; **tronquées au bord du visible + un pas** (D6). Chemins gelés pointillés tronqués fog aussi.
- **Fantômes** aux destinations prévues (cercle translucide à la couleur nation), **badge ×N** en pile, **hex rouge surligné** sur les cases disputées, **point doré** sur la gagnante R-159.
- **Tooltip pédagogique** au survol d'une case disputée (règle de priorité expliquée — L4.6).
- **Bouton multi-étapes** dans `UnitPanel` : « 1. Déplacer (n cases) → 2. Fonder » (et « Ne pas fonder à l'arrivée ») — infobulle expliquant le comportement en cas d'échec partiel ; libellé d'ordre « Multi-étapes (R-158) : 1. déplacer → 2. fonder ».
- `pathTo` (clic droit) : destination inconnue adjacente au connu visable (un pas terminal) ; l'inconnu n'est **jamais traversé** — tests web (état réellement filtré, cases absentes).
- `gameClient` : `OrderAck` miroir de l'upsert serveur (priorité conservée localement aussi).

## 4. RULES.md

Nouvelle section **§4bis** : R-158 (multi-étapes + migration 19), R-159 (priorité D2/D3), R-160 (aperçu D1), R-161 (fog D6) + constantes T-46/T-47/T-48 (`deplacement.json` — data-driven, calibrage sans code).

## 5. Vérification (L5)

- `pnpm test` : 3/3 packages verts — **957 tests** (928 + 29 nets). `pnpm typecheck` : **4/4** (0 erreurs svelte-check).
- **E2E conditions réelles (wrangler dev 8787)** : `botSolo-e2e.mjs` ✓ (partie solo complète, **victoire par domination au tour 32**, bot jouant déplacements + production, partie 2 joueurs inchangée) ; `artefact-e2e.mjs` ✓ (fog/pings, activation, disparition).
- **Non fait — resté pour l'acceptation visuelle d'Erik** (le canvas n'est pas rejouable en automatisation d'après les sessions précédentes) : captures `dev-logs/captures-deplacement-planifie/` en GUI réelle 2D/3D. Liste de vérification : flèches + fantômes + pile ×N + disputées rouges en 2D ET 3D ; bouton Colon « 1. Déplacer → 2. Fonder » ; tooltip ⚔ ; flèche stoppée au bord du fog + 1 pas ; re-programmer conserve la priorité, annuler+reprogrammer passe en fin de file.

## 6. Interprétations 🔶 / écarts (à signaler)

1. **Coût PM de l'action finale** : « dans la limite des PM » interprété comme « ≥ 1 PM restant au terme du chemin » (sans consommation supplémentaire — la fondation n'est pas un mouvement). Data-driven (`mpCostOfFinalAction`), veto Erik possible.
2. **Priorité des chemins gelés** : un chemin gelé (tour antérieur) est traité comme « programmé le plus anciennement » — il gagne donc une dispute contre un ordre frais. Alternatives possibles (frais > gelés) : un slider dans `collectMoveOrders`.
3. **Fog et fixtures** : un joueur avec `explored` VIDE (fixtures, états très anciens) n'est pas soumis à la limite fog (le fog n'y est pas modélisé) — évitait de casser 700 tests de fixtures ; les vraies parties ont toujours un `explored` peuplé. Les barbares (absents de `players`) sont de fait exemptés — leurs ordres sont à 1 pas, donc non affectés.
4. **Le test historique R-41 « deux movers vers la même case » a été RÉÉCRIT** : il incarnait l'ancien comportement (le plus petit unitId gagne la case disputée) contredit par D2 (la première programmée gagne). Un test R-41 séparé vérifie que le traitement reste en `unitId` croissant pour des destinations différentes.
5. **Pins de version 18 → 19** dans 14 tests existants (chaîne de migrations, convention établie aux phases précédentes) + test ICBM 7m complété : son chemin traverse désormais l'inexploré → cases du chemin explorées au préalable, en citant R-161.
6. **Action finale `attack` non créée** : D4/D5 sont couverts par la sémantique du chemin (dernier pas sur l'ennemi = combat d'entrée existant) — éviter un double-attaque. Le catalogue `multiStepFinalActions` est data-driven pour extension future.

## 7. Reste à vérifier en ligne par Erik (login réel)

1. En partie : programmer 2 unités amies vers la même case → hex rouge + tooltip ⚔, fantômes ×2, point doré sur la gagnante ; après résolution, la première programmée est sur la case.
2. Colon : tracer un chemin puis « 1. Déplacer → 2. Fonder » → flèche verte + ⌂ ; au tour suivant, la ville est fondée à l'arrivée.
3. Flèche vers l'inexploré : elle s'arrête au bord du visible + 1 pas ; en 3D aussi.
4. Re-programmer une unité déjà programmée puis tester la priorité contre une unité programmée entre-temps.
5. Reprise d'une partie créée avant le déploiement (migration 18→19, chemin gelé conservé).

**Arrêt-pour-approbation** : rien n'est committé ni déployé ; Erik fait committer et déployer quand il est satisfait.
