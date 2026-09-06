# REPORT-CALIBRAGE-CANON — Application des rapports de recherche d'Erik (06/09/2026)

Exécution du handoff [`HANDOFF-CALIBRAGE-CANON.md`](../../HANDOFF-CALIBRAGE-CANON.md) : les défauts 🔶 de calibrage laissés en 7l/7n/7o sont tranchés par les trois rapports de recherche d'Erik (spécs de référence). **État final : 928 tests verts (725 rules + 65 server + 138 web), typecheck 4/4, e2e artefacts et bot-solo verts.**

## 0. Préalables

- Baseline vérifiée avant chantier : 921 tests verts + typecheck 4/4.
- **AUCUNE MIGRATION `schemaVersion` NÉCESSAIRE (confirmé)** — `schemaVersion` reste **18**. Tous les changements sont : des valeurs de calibrage dans des JSON lus à la résolution (`economy.json`, `civilizations.json`, `artefacts.json`), des mécaniques recalculées à chaque tour (seuils de croissance, compage d'ère, escalade GP — aucune partie persistée ne porte ces valeurs), et des champs additifs de données (`artefacts.json params`). La Merveille Égypte naît à la création d'état (aucun champ `wonderId` persisté n'existait dans le GameState — c'était un paramètre de setup transporté par `meta.players`/`civSetup`, non migré).
- L0 : les 3 rapports déplacés vers `docs/recherche/` en commit docs-only (`350ac62`).

## 1. Valeurs appliquées (avant → après)

### Bloc 1 — Économie (`economy.json`)

| Clé | Avant | Après | Note |
|---|---|---|---|
| `eraRushFactors.industrielle` | 5 | **4** | Coûts console dataminés : Marché 60M = 240 or, Banque 120M = 480 or — progression canon ×2/×3/×4/×8 |
| `cityCapturePlunderPct` | 0.5 | **0.25** | Protège la victoire économique contre le snowballing (rapport Calibrage §2) |
| Classe GP du canal or (R-136) | ciblage technologique R-127 | **Grand Explorateur/Industriel explicite** (`explorateur`) ; si la liste de figures de la classe est épuisée, rotation de secours **Bâtisseur → Savant** (`goldMilestoneGpClass`, culture.ts — paliers 500 et 10 000 or → cette classe) | Mapping Civilopedia canonique |

### Bloc 2 — Civilisations (`civilizations.json` + moteur)

| Item | Avant | Après |
|---|---|---|
| Or Aztèques | +25 🔶 | **+25 confirmé** — 🔶 retiré, libellé « canon dataminé, montant fixe au tour 1 » |
| Rayon Russie | 5 🔶 | **5 confirmé** — 🔶 retiré (canon : ~2-3 cases au-delà de la vision du Colon) |
| GP Grèce/Rome | ×0,75 🔶 | **0,75 confirmé** — 🔶 retiré (fourchette canon 25-50 %, borne basse) |
| Merveille Égypte | choix du joueur au setup | **TIRAGE SEEDÉ** : RNG dédié dérivé du seed de génération (salt `0x2a7f3b91`, pas le RNG de résolution), parmi les **6 Merveilles Antiques canon** (`egypteWonderChoices` : Colosse, Grande Pyramide, **Grande Muraille**, Jardins Suspendus, Oracle, Stonehenge — `grande_bibliotheque` retirée, non Antique canon) ; construite gratuitement dans la capitale à la fondation, **sans choix du joueur** |
| Zoulous (croissance) | trait `croissanceAcceleree` reduction 0.33 | **Nouveau trait typé `croissanceSeuilDivise` (divisor 2, pattern R-146)** — mécanique canon Aqueduc passif : seuils de `growth.json` **divisés par deux** pour toutes les villes zouloues dès l'ère Médiévale ; combiné **multiplicativement** avec l'Aqueduc : `seuil = base × (1 − r_aqueduc) ÷ divisor` ; ni nourriture ni vitesse |
| Seuils d'ère 5/14/24 | appliqués | **Confirmés** — test dédié : une tech gratuite (palier économique 250 → Monnaie, octroi direct) compte dans le compage et franchit le seuil de 5 → `EraChanged` au tour suivant |

### Bloc 3 — Artefacts (`artefacts.json` + moteur)

| Clé | Avant | Après |
|---|---|---|
| `countMin`/`countMax` | 3/6 | **4/5** (tirage seedé 4-5, jamais la réserve complète) |
| `minDistanceToCapitals` | 6 | **8** (canon 8-10, borne basse) |
| `indicePositionChance` | 0.5 | **0.15** (canon 15-20 %, borne basse) |
| `confuciusGpCount` | 3 | **2** (canon dataminé) |
| Escalade Confucius | comptait dans T-27/T-30 | **EXEMPTION** : les GP de l'École de Confucius n'incrémentent ni `greatPersonsObtained` ni `greatPersonsByType` — manne hors progression ; la rotation des classes lit l'index courant (`baseIndex + i`) sans l'avancer ; le seuil culturel du prochain GP est inchangé |
| `septCitesOrByEra` | 200/250/300/400 | Confirmé tel quel |
| Templiers | unité selon l'ère (vétéran seulement via trait) | **Toujours VÉTÉRANE (5 XP)** — flag `templiersAlwaysVeteran` en données, indépendant du trait `uniteVeteran` ; table d'ère confirmée |
| `atlantideTechCount`, Arche d'Alliance, Angkor | — | Confirmés, inchangés |

## 2. Changements moteur (test-first)

- `artefacts.ts` : exemption d'escalade Confucius ; Templiers toujours vétérans.
- `culture.ts` : `goldMilestoneGpClass(index)` — classe or explicite + rotation de secours (figures de la classe comptées).
- `turn.ts` : palier `greatPerson` → classe `goldMilestoneGpClass` (fin du ciblage R-127 pour le canal or, conservé pour le canal culture) ; Zoulous — combinaison multiplicative du diviseur de seuil.
- `civilizations.ts`/`types.ts` : `civGrowthThresholdDivisorOf` (remplace `civGrowthReductionOf`) ; trait `divisor`.
- `map.ts`/`civilizations.ts` : `civStartsAncientWonder` (remplace `isEgyptWonderChoiceValid`) ; tirage Égypte seedé dans `createInitialState` (Égyptes multiples : tirages successifs dans l'ordre des spawns).
- `state.ts`/`types.ts` : champs additifs `confuciusEscaladeExemption`/`templiersAlwaysVeteran` dans `ArtefactParams` (données seules — rien dans le GameState).

## 3. L3 — Serveur/UI

- `packages/shared/src/index.ts` : `wonderId` retiré de `GameCreationSettings`, `GamePlayerInfo`, `GameSummary.players`, `JoinGame`.
- `apps/server/src/lobby.ts` + `game.ts` : plus aucune validation/stockage/propagation de `wonderId` (les vieilles requêtes contenant ce champ sont simplement ignorées — champ inconnu).
- `apps/web` : `CivPicker.svelte` — la liste déroulante de merveilles Égypte est supprimée (le sélecteur de civ reste) ; `Lobby.svelte`/`Join.svelte`/`lobbyClient.ts` n'envoient plus de merveille ; `EGYPT_WONDER_LABEL` supprimée de `labels.ts`. Aucune UI ne promet plus de « choix de merveille » (la seule sélection de merveille restante est **Angkor Wat**, légitime — R-154).

## 4. Tests

- Modifiés : `phase7l.test.ts` (plunder 25, facteur ×4, classe GP or = `explorateur`), `phase7n.test.ts` (Égypte tirage), `phase7o.test.ts` (params 4-5/2/0.15/8, Confucius 2 GP sans escalade, Templiers vétérans), data JSON notes.
- **Nouveaux** : Marché/Banque rush Industrielle ×4 (240/480) ; rotation de secours Bâtisseur→Savant ; **Confucius — compteurs inchangés + seuil T-27 du prochain GP inchangé** ; **Templiers vétérans** (Chevalier et Char d'assaut) ; **Zoulou Médiévale : seuil 20 → 10 (croissance à 10 nourriture), inactif en Antique, récolte inchangée** ; **Égypte : tirage déterministe (même seed ⇒ même merveille), pool canon** ; **techs gratuites comptées dans le compage** (R-147 rév.).
- Total : **928 tests verts** (921 + 7 nouveaux nets).

## 5. Vérification (L5)

- `pnpm test` : 3/3 packages verts (725 + 65 + 138). `pnpm typecheck` : 4/4.
- **E2E conditions réelles (wrangler dev)** : `artefact-e2e.mjs` ✓ (tirage = 4 artefacts, fog/pings, activation Angkor, ChooseWonder, jalon) ; `botSolo-e2e.mjs` ✓ (création lobby sans `wonderId`, partie solo complète, victoire domination au tour 32). `fortify-e2e.mjs` : non conclusif par conception (le script demande lui-même une relance tant qu'aucun tir discriminant n'est atteint — RNG de combat ; logique de fortification **non touchée** par ce chantier).
- Captures : le seul affichage modifié est la disparition du `<select>` de merveille dans CivPicker — pas de capture demandée (retrait pur, aucune nouvelle vue).

## 6. Écarts/interprétations (à signaler)

1. **Rotation de secours GP or** : « épuisement de la liste de figures » interprété comme « autant de GP or déjà accordés que de figures de la classe » (3 figures explorateur → indices 0-2 explorateur, 3-5 bâtisseur, 6+ savant). Le fallback n'est en pratique jamais atteint (2 paliers or seulement) — il est néanmoins codé et testé.
2. **Zoulous + Aqueduc** : combinaison multiplicative (`base × 0,67 ÷ 2`) documentée dans le code et R-146 ; le handoff ne tranchait pas l'empilement.
3. **Compteurs Confucius** : `greatPersonsByType` (escalade T-30 par type) est **aussi** exempté, en cohérence avec « manne hors progression » (le canon vise le coût culturel des GP suivants dans son ensemble).
4. **Égyptes multiples** (les deux joueurs choisissent l'Égypte, autorisé 🔶 7n) : les deux tirages proviennent du même RNG dédié, dans l'ordre des spawns — déterministe ; l'exclusion mutuelle de merveille R-129 au setup n'existe plus (deux Égyptes peuvent tirer la même merveille — cas marginal, signalé).
5. T-36 (5/14/24) confirmé : 🔶 conservé sur la ligne de table par prudence éditoriale hors périmètre, la règle étant validée par test.

## 7. À vérifier par Erik en ligne

1. **Une partie Égypte au tirage** : la merveille apparaît dans la capitale à la fondation, sans écran de choix (même seed ⇒ même merveille).
2. **Zoulous médiévaux** : la croissance accélère nettement (seuils ÷2), et se combine encore avec l'Aqueduc.
3. **Artefacts 4-5 + indice** : compter les reliques sur une carte neuve ; l'indice de hutte révèle une position ~15 % du temps.
4. **Sac de ville à 25 %** : capturer une ville secondaire d'un adversaire riche.
5. **Rush-buy industriel ×4** : Marché 240 or / Banque 480 or en ère Industrielle.

**Arrêt-pour-approbation** : rien n'est committé au-delà du commit docs-only L0 (`350ac62`) ; Erik fait committer et déployer quand il est satisfait.
