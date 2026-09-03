# HANDOFF PHASE 7h — Gouvernements, Civilisations & merveilles

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**510 tests** : rules 427, server 33, web 50), `RULES.md` §8.6 (naval/espionnage R-117..R-119, livrés en 7g), documents d'Erik : « Civilization Révolution Technologies et Déblocages.md » + « Culture dans Civilization Revolution.md » (§Interactions Systémiques — gouvernements). `schemaVersion` actuel : **11**.

État 7g (livré) : naval complet (mouvement côte/océan R-107, transport 1 terrestre par Galère/Galion, naufrage, soutien naval `S_att` R-118), Espion + `SpyMission` vol de GP installé (R-119, jalon `gpStolen`, escalade inchangée), production navale côtière, UI/sprites/bot, migration v10→v11 (`aboard`/`cargo`). Session réelle : 3 vols de GP in-vivo (journal `dev-logs/captures-7g/`).

## Mission — livrables dans l'ordre

### L0 — Règles écrites (RULES.md, test-first)

- **R-121 · Gouvernements** (base : StrategyWiki CivRev Governments + doc d'Erik §Interactions) : Dépot → Monarchie → Communisme / Fondamentalisme / Démocratie (choix via une action immédiate type `SetGovernment`, un seul à la fois). Effets data-driven (`governments.json`) :
  - **Monarchie** : culture du Palais ×2 (champ `palaceCultureMult`) ;
  - **Communisme** : +50 % production des villes, **Temples/Cathédrales neutralisés** (culture per-citoyen à 0), apparition de GP de culture stoppée 🔶 à confirmer avec la source ;
  - **Fondamentalisme** : +50 % attaque terrestre, Bibliothèques/Universités neutralisées ;
  - **Démocratie** : 🔶 selon source (production/trade) — trancher avec Erik.
- **R-122 · GP restants** (or/science/production/combat) : débloqués par seuils (or : trésor cumulé 🔶 ; science : techs découvertes 🔶 ; production/combat : 🔶) — même mécanique R-114 (alternance ou tirage seedé 🔶), effets à l'installation (critère de victoire Banque mondiale = 20 000 or 🔶 — tranche à cadrer).
- **R-123 · Merveilles à effets complexes** : Grande Bibliothèque (1 tech gratuite 🔶), Oracle (1 GP 🔶), Grande Muraille ( 🔶 ), Himeji (+50 % attaque 🔶), Magna Carta (Tribunaux produisent de la culture 🔶), Hollywood ( 🔶 ) — data-driven (`wonders.json`, nouveaux champs d'effets), à cadrer avec Erik avant implémentation.
- **R-124 · Victoire scientifique** : Vaisseau spatial (4 composants, R-66 `implemented: false` → actifs) → `Victory(reason:'science')`.
- **R-125 · Détection/contre-espionnage** (reporté de 7g) : Remparts + espion défensif 🔶 — trancher les règles de détection avant implémentation.
- Migration **schemaVersion 11→12** selon les champs retenus (`government` par joueur, GP restants, composants du vaisseau en villes…).

### L1 — Moteur (test-first, pur, déterministe R-80..R-82)

1. Phase A : gouvernements (état + effets sur la culture R-113, la production R-63, l'attaque §7.4) ; neutralisations de bâtiments data-driven.
2. Phase B : GP restants (spawn à seuils, installation R-115 réutilisée, effets à l'installation) ; Himeji/Fondamentalisme dans `S_att`.
3. Phase C : merveilles complexes (effets à la complétion + permanents) ; vaisseau spatial (composants + victoire) ; contre-espionnage si R-125 tranchée.
4. Tests citant R-121..R-125 + e2e (victoire scientifique, Monarchie ×2 Palais, vol contré).

### L2 — Serveur

Contrat `SetGovernment` (action immédiate, même forme que `SetResearch`/`SetConversion`), validation GameDO (`orderShapeError` — leçon 7f/7g : **toute nouvelle forme d'ordre/item passe d'abord par là**), admin dump (gouvernement, composants), bot : choisit un gouvernement quand débloqué, vise le vaisseau en fin de partie.

### L3 — UI

Panneau gouvernement (bouton de bascule + effets), menu de production des composants du vaisseau, sprites GP restants + composants (generate.py + sync-art + LICENSES), toasts (gouvernement changé, composant livré, victoire scientifique).

### L4 — Vérification & livraison

1. e2e : victoire scientifique complète, bascule Monarchie → culture ×2, Communisme → temples neutralisés.
2. GUI locale vs bot : captures (`dev-logs/captures-7h/`) — **leçon 7g : l'automatisation headless des clics canvas est fragile ; préférer des captures « journal + barre supérieure » et des scénarios courts**.
3. Déploiement prod via CI ; vérifications en ligne pour Erik.

## Critères d'acceptation

1. R-121..R-125 dans `RULES.md`, couvertes par tests citant leur identifiant ; migration v11→12 testée ; suites vertes (≥ 510).
2. e2e victoire scientifique + gouvernements complet.
3. Gouvernements jouables (Monarchie au minimum), GP restants actifs selon la tranche, merveilles complexes cadrées.
4. Déployé en prod, vérifié.

## Périmètre interdit (cette session)

Conversion culturelle passive (territoire — toujours en suspens), ICBM/SDI au combat, aériens (Chasseur/Bombardier), Caravane/Milice, procédurale (6b livrée). Toute interprétation : documenter + signaler.

## En suspens (à proposer à Erik en fin de 7h)

- **Territoire/frontières** (prérequis de la conversion culturelle passive) — proposition attendue depuis 7f.
- **D2 culture-ressources** (Encens +2, Soie +3 — champ `culture` en données, ignoré).
- **Sauts technologiques** (majorité des prérequis + finissable ≤ 10 tours — différé depuis 7e).
- **Merveilles complexes non cadrées** (si Erik les reporte encore : les garder en données).

## Fin de session

Rapport habituel (`REPORT-PHASE7H.md`) + captures + handoff Phase 8 (polish/équilibre/esthétique — ou selon priorités d'Erik).
