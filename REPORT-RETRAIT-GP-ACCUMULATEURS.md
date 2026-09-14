# REPORT-RETRAIT-GP-ACCUMULATEURS — Suppression de la famille R-123 (GP de rendement)

**Chantier gameplay de retrait** (chapitre 2D) · mission exécutée le 14/09/2026 d'après `HANDOFF-RETRAIT-GP-ACCUMULATEURS.md`.

## 0. Étape 0 — commit CULTURE-FRONTIERES

Déjà satisfaite à l'ouverture de session : le commit `0c5daa5` (« correctifs: CULTURE-FRONTIERES… ») est dans l'arbre `main`. Aucun mélange des deux chantiers : le retrait n'a pas été committé (voir §6).

## 1. Ce qui a été retiré (liste exacte)

### Champs d'état (moteur)
- `City.gpAccumGold`, `City.gpAccumScience`, `City.gpAccumProd` (accumulateurs R-123, 7h) ;
- `City.gpAccumFood` (accumulateur dormant du Grand Humanitaire, 7j — 7k C1) ;
  → **migration `schemaVersion` 22 → 23** (`MIGRATIONS[23]` dans `packages/rules/src/state.ts`) : les 4 champs sont retirés de chaque ville, idempotent, partie pré-23 reprise et résolue sans erreur (test dédié dans `phase7h.test.ts`).

### Moteur
- `packages/rules/src/turn.ts` : les 3 lignes d'accumulation Phase C (`gpAccumGold/Science/Prod += …`) et le **bloc d'émission** « au plus un GP par ville et par tour (science → or → production) » avec ses 3 appels `spawnGreatPerson(..., 'science'|'or'|'production')` — SUPPRIMÉS. Les émissions restantes sont intactes : Leader (`combat`, T-31), paliers T-27 (`culture`), paliers d'or R-136 (`or`).
- `packages/rules/src/culture.ts` : `YIELD_GP_TYPES`, `YieldGreatPersonType`, `yieldGpThresholdFor` (seuils T-30) — SUPPRIMÉS. `leaderGpVictoriesNeeded` (T-31) conservé.
- `packages/rules/src/types.ts` : champs `greatPersonYieldThresholdBase`/`greatPersonYieldThresholdGrowth` de `CultureData` — SUPPRIMÉS.
- `packages/rules/src/data/culture.json` : les 2 entrées T-30 — SUPPRIMÉES (`leaderGpVictories` conservé).
- `packages/rules/src/events.ts` : type `GpCanal` resserré `'culture' | 'or' | 'combat' | 'artefact'` — les valeurs `'science'`/`'production'` n'existent plus au niveau du type (garantie compile).
- Créations de villes nettoyées (`map.ts`, `fixtures.ts`, `turn.ts` ×2) : plus aucune initialisation `gpAccum*`.
- Le trait `gpFrequents` (Grèce/Rome, ×0,75) ne porte plus que sur le canal culture T-27 (son seul point d'application restant).

### UI et journal
- `apps/web/src/components/CityPanel.svelte` : les 3 jauges d'accumulateurs (Grand Savant / Grand Explorateur / Grand Bâtisseur), leur dérivé `gpYieldGauges`, l'import `yieldGpThresholdFor` et le CSS `.gp-fill` — SUPPRIMÉS. Le menu-ville n'affiche plus que la jauge de croissance (R-63) et la jauge de culture empire (paliers T-27). `CityView`/MENU-VILLE : aucune référence aux accumulateurs (vérifié par grep — rien à retirer).
- `apps/web/src/lib/labels.ts` : entrées `science`/`production` de `GP_CANAL_LABELS` retirées (le journal ne peut plus libeller « GP de science/production ») ; le champ `canal` et ses libellés restants (« GP de culture/or/combat/artefact ») sont inchangés.

## 2. Ce qui est resté intouché (verrouillé par tests)

Leader T-31 (20 victoires, canal `combat` — testé), paliers d'or R-136 (`goldMilestoneGpClass`), paliers de culture T-27 (tirage seedé D2), GP de technologies (Premier découvrir), Confucius/merveilles, artefacts (T-43), effets Consume/Settle (R-126, C3/C6), ciblage D2, anneaux culturels CULTURE-FRONTIERES, 3D (zéro fichier touché — vérifié au `git status`).

## 3. Garde-fous ajoutés (test-first)

1. `phase7h.test.ts` — « GARDE-FOU : aucun GP ne sort d'un accumulateur » : forte économie, un tour de résolution → **zéro** `GreatPersonSpawned`, et les champs `gpAccum*` sont absents de l'état.
2. `phase7h.test.ts` — « GARDE-FOU global : 100 tours de simulation » : les seuls canaux observables sont `culture/or/combat/artefact` (jamais `science`/`production`), sur 100 tours effectivement joués.
3. `phase7h.test.ts` — migration 22→23 : retrait des 4 champs (valeurs dormantes comprises), idempotent, partie pré-23 migre et se résout sans erreur.
4. `culture.test.ts` — les canaux `science`/`production` n'existent plus (ex-test des canaux d'accumulateurs réécrit).
5. `phase7j.test.ts`/`phase7k.test.ts` — les anciens tests « `gpAccumFood` dormant » réécrits en garde-fous d'ABSENCE ; les tests de chaîne de migration vérifient que les champs ajoutés en v12/v13 sont bien retirés au terme de la chaîne.
6. `retrait-gp-journal.test.ts` (nouveau) — 60 tours à forte économie (techs Monnaie/Monarchie des deux joueurs) : **aucun** GP de canal science/production.

Tous les anciens tests R-123 « spawn au seuil T-30 » (Scientifique, Mogul/Explorateur, Ingénieur, ordre d'alternance, re-soustraction du surplus, jalon) sont SUPPRIMÉS avec le mécanisme ; les pins `schemaVersion` de toute la suite sont portés à 23.

## 4. Vérification (M3)

- **Suite verte complète : 1126 tests** (rules 798 + web 253 + server 75) — même total que la baseline.
- **Typecheck 4/4.**
- **`schemaVersion` 23** (test d'épinglage + état vivant à 23 lu dans le panneau debug du navigateur).
- **e2e solo sur wrangler dev** (`botSolo-e2e.mjs`) : TOUS LES CONTRÔLES PASSÉS — victoire par domination au tour 31, bot jouant chaque tour, parties 2 joueurs inchangées.
- **Simulation 60 tours** (forte production/science) : 0 GP d'accumulateur — journal archivé.
- **Partie solo réelle en navigateur** (Edge headless CDP, méthode 7g) : ville fondée, 15 tours joués, menu-ville et journal capturés.
- **Zéro diff 3D** : aucun fichier `render3d`/`structures3d`/3D dans le diff.

## 5. Captures (`dev-logs/captures-retrait-gp-accumulateurs/`)

- `01-menu-ville-sans-jauges-accumulateurs.png` — menu-ville : only croissance (R-63) + culture (paliers T-27) ; les 3 jauges R-123 ont disparu.
- `02-journal-tour15-propre.png` — journal au tour 15 : fondation, croissances, fins de tour — **aucune entrée GP de rendement**.
- `03-journal-simulation-moteur-60-tours.txt` — journal de la simulation moteur 60 tours (0 GP d'accumulateur).

## 6. Interprétations & notes

- Le retrait porte sur l'**obtention** uniquement : les compteurs `player.greatPersonsByType` continuent d'être incrémentés à chaque obtention de GP (tous canaux) mais ne sont plus lus par aucun seuil (l'escalade T-30 n'existe plus). Conservés pour l'historique/le vol de GP installé — simplifiable plus tard si Erik le souhaite.
- Le champ `canal` du journal (CULTURE-FRONTIERES) est conservé ; son type est resserré au compilateur.
- RULES.md mis à jour : R-123 marquée partiellement abrogée (Leader T-31 maintenu), tableau §8.7 (canaux d'accumulateurs « ABROGÉ 14/09 »), mention migration 22→23, table des constantes (T-30 retirée), trait `gpFrequents` (T-27 seul), note 7l C5, exemption Confucius.

## 7. Fin de session

Validation locale avec captures faite **avant tout commit** (règle établie). **Rien n'est committé** — commit/push sur demande explicite d'Erik. Main remise.
