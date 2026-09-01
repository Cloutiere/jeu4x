# RAPPORT PHASE 7b — Refonte du menu de ville, conversion or/science, effets de bâtiments

Date : 01/09/2026. Handoff : `HANDOFF-PHASE7B.md` + validation d'Erik (`RAPPORT-PROPOSITION.md` §6). Tout le périmètre approuvé est implémenté, testé, déployé.

## 1. Livrables

### L0 — Règles (`packages/rules`, test-first)
- **`src/conversion.ts`** (nouveau) — source unique moteur/UI :
  - **R-90 révisée** : conversion binaire du commerce par ville — `conversion: 'gold' | 'science'` (défaut **or**, décision d'Erik) ; `conversionGains(commerce, conversion, buildings)` retourne `{gold, science}` ;
  - **R-88 Bibliothèque** : conversion or → `C` or + `max(1 ; round(C×0,2))` science (**même à 0 commerce : 1 science**) ; conversion science → `round(C×1,5)` science, 0 or. Arrondi au plus proche (round half up) ;
  - **`applySetConversion`** : action immédiate pure (ville existante, possédée, cible valide ; idempotent) ;
  - **R-89 Caserne** : appliquée dans le moteur à la complétion de production (unités vétérans, hors Colons).
- `buildings.json` : champ `effect` sur Bibliothèque/Caserne (libellés UI) ; `BuildingData.effect?` typé.
- **Migration `schemaVersion` 5→6** additive et idempotente (`city.conversion`, défaut or) — chaîne v1→v6 testée.
- **Tests** : `tests/conversion.test.ts` (23 tests) — R-88/R-89/R-90 (exemples validés par Erik : 5→5 or+1 sci ; 12→12 or+2 sci ; 12→18 sci), Phase C, SetConversion (refus ville ennemie/inconnue/cible invalide), capture → reset or, migration v6 + idempotence + chaîne complète. Tests legacy mis à jour (gel d'états antérieurs) : versions 5→6, R-61 curseur → R-90 conversion, villes de recherche en conversion `science` explicite.

### L1 — Moteur
- **Phase C** (`turn.ts`) : la répartition or/science utilise `conversionGains` — plus de curseur global (`player.scienceRatio` déprécié, conservé pour compat). Conséquence assumée : toute ville à ≥ 1 commerce produit 1 or OU 1 science — l'anomalie « science 0/tour » (7a §3.1) disparaît par construction.
- Fondation de ville : `conversion: 'gold'` (R-90). Capture : conversion réinitialisée à or.
- **R-89** : unité produite par une ville à Caserne → `veteran: true` (hors `colon`), testée via `resolveTurn` (Guerrier/Caserne → vétéran ; Colon → non ; sans Caserne → non).

### L2 — Serveur + protocole
- Contrat **`SetConversion {cityId, target}`** (`packages/shared`) — action immédiate, même contrat que `SetResearch` (traitée à la réception, persistée, **diffusion snapshot immédiate aux deux clients**, autorisée en phase « orders » même verrouillé, refusée pendant la résolution).
- Handler GameDO `handleSetConversion` (miroir `handleSetResearch`). Tests : conversion appliquée + diffusée + persistée (admin dump) ; conversion d'une ville ennemie rejetée. **24 tests serveur verts.**

### L3 — UI
- **Correctif de l'anomalie « clic sur une ville »** (cause racine 7b-A) : `tileEffectLabel` lit `tileBonus` sans guard → crash du rendu de CityPanel sur les villes (Bibliothèque/Caserne sans `tileBonus`), Svelte laissant l'ancien DOM. Corrigé + libellé d'effet via `b.effect`.
- **CityPanel restructuré** (maquette RAPPORT-PROPOSITION §4.2) : en-tête (badge Capitale), rendements N/P/C → or/science **selon la conversion** (source unique `conversionGains`), valeurs projetées en cas de réassignation en attente (style distinct), jauges croissance/production avec **durées en tours**, bloc citoyens, **bouton « Convertit le commerce en : Or ⇄ Science »** (action immédiate — actif même ordres verrouillés), bâtiments avec effet en tooltip, production à deux niveaux : item courant (barre + ETA) puis choix **catégorisés Unités / Bâtiments** (tours restants si choisie, verrouillés « Requiert : … » en fin de section, R-87).
- **Carte (R-90)** : les cases travaillées par une ville (et sa case de ville) affichent l'icône **or ou science** selon la conversion au lieu du commerce (icônes `icone_or`/`icone_science` chargées) ; cases non travaillées inchangées (potentiel).
- **Cycle « Rendements » à 3 états** : masqué → affiché ✓ → affiché **(seuls)** sans villes ni armées → masqué (exigence d'Erik : lire les rendements sous les entités).
- **Interaction** : un clic sur une ville **amie** interrompt un brouillon de déplacement armé et sélectionne la ville (le chemin déjà soumis reste actif) — teste la 2ᵉ cause de « menu inaccessible » ; les villes ennemies restent des étapes de chemin (assaut/capture).

### L4 — Vérification GUI (locale, vraie souris, partie vs bot)
1. Migration de la partie existante (v5) → villes à `conversion: 'gold'` ✔ (vérifié dans la partie réelle EADSH7).
2. **Clic sur la capitale vide → le tableau de bord s'affiche** (zéro erreur console — `__errs` vide), avec rendements 4/1/1 → 1 or / 0 science, jauge 16/20 « 1 tour », citoyens, production catégorisée.
3. **Bouton conversion** : bascule Or → Science vérifiée (état serveur `science`, panneau « 0 or / 1 science », bouton mis à jour).
4. **Cycle Rendements** : libellés « Rendements ✓ » / « Rendements (seuls) » / « Rendements », rendu canvas différenciant l'état sans entités (diff d'export PNG).
5. Captures : `docs/captures-7b/menu-ville-refonte.png`, `docs/captures-7b/rendements-sans-entites.png`.

## 2. Tests
- **297 tests verts sur le workspace** (baseline 7a : 271) : `packages/rules` 223 (+23 conversion), `apps/web` 50 (+1 interaction 7b), `apps/server` 24 (+2 SetConversion). `pnpm typecheck` : vert (4/4).
- Tests legacy mis à jour (gel d'états antérieurs) : `CURRENT_SCHEMA_VERSION` 5→6, R-61 curseur → R-90, villes des fixtures de recherche en conversion science explicite, fixture interaction en forme City v6.

## 3. Interprétations choisies (simples et déterministes)
- **Défaut or / reset à la capture** : décision d'Erik (AskUserQuestion du 01/09) — appliquée telle quelle.
- **Arrondis** : `round` half-up partout (`Math.round`, déterministe) — conforme à la convention « arrondi(12×20 %) » d'Erik.
- **SetConversion = action immédiate** (pas un ordre de tour) : miroir de `SetResearch`, visible en temps réel même ordres verrouillés. Choix de l'agent, annoncé à Erik dans la synthèse des décisions.
- **Clic ville amie interrompt le brouillon** : le pas-à-pas vers une ville amie passe désormais par le clic droit (le chemin complet reste soumis) — compromis documenté dans `interaction.ts` (priorité au menu de ville).
- **Rendements masqué** : mode « (seuls) » cache la couche entités (unités + villes) ; la sélection au clic reste fonctionnelle (l'état n'est pas filtré) — mode d'inspection transitoire.

## 4. Déploiement
- Push `5cadb5f` → CI (`deploy.yml`) → prod `https://game-4x-server-prod.erik-ai-studio.workers.dev` (§5 ci-dessous pour la vérification en ligne).

## 5. À tester en ligne par Erik (login OAuth réel)
1. **Menu de ville** : cliquer une ville (vide ou défendue — 1ᵉʳ clic unité, 2ᵉ clic ville) → le tableau de bord s'affiche (fin de l'anomalie 7a).
2. **Conversion** : bouton « Convertit le commerce en : Or ⇄ Science » — la répartition or/science du panneau bascule instantanément ; les cases travaillées sur la carte passent de l'icône commerce à or/science (mode Rendements).
3. **Bibliothèque** (après Alphabet) : en conversion or, la ville génère quand même `max(1 ; 20 %)` de science ; en conversion science, ×1,5.
4. **Caserne** (après Travail du bronze) : l'unité produite porte l'étoile ★ (vétéran) ; le Colon, non.
5. **Rendements (seuls)** : 3ᵉ clic sur le bouton — villes/armées masquées pour lire les icônes.
6. **Chemin → ville** : brouillon de déplacement en cours + clic sur une ville amie = sélection de ville (le chemin soumis reste affiché).

## 6. Suite logique (restes de la Phase 7)
Merveilles (effets + constructibilité), naval (Galère), Espion, ressources de terrain, suite de l'arbre (2ᵉ colonne du PDF), et les petits plus optionnels non retenus (ETA sur le sprite de ville, noms de villes).
