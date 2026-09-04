# RAPPORT PHASE 7n — Civilisations & traits + corrections 7m (Bloc 0)

**Date :** 06/09/2026 · **Commit :** `53c2fbf` · **Tests :** 759 verts (658 règles + 63 web + 38 serveur) · **Typecheck :** vert · **`schemaVersion` :** 16 → **17**

---

## 1. Livrables

### Bloc 0 — corrections 7m (décisions d'Erik du 06/09, test-first)
- **C15 — distinction canon rétablie** : la règle « ville survit, pop 2, merveilles préservées » s'applique à la **capitale seule** ; une **ville ordinaire est RASÉE** — effacée de la carte, bâtiments et merveilles détruits (jalon perdu par merveille, miroir du rasement barbare R-97), garnison anéantie (C13.4 conservé) et **cratère** : nouveau terrain `cratere` (terrain.json) **stérile** (rendements 0/0/0, ressource effacée 🔶) et **non fondable** 🔶 (défaut : permanent — le canon est muet). Les tirs hors ville ne créent pas de cratère.
- **C16 — arrondi vers le HAUT** ⌈n/2⌉ (5 bâtiments → 3 détruits), Palais exclu, sélection seedée R-80 inchangée.
- **C17 — la Grande Muraille bloque l'ICBM** : portée **empire** (toute ville du propriétaire), missile **consommé**, aucun dégât, nouvel outcome `blocked` (raison `grandeMuraille`) ; obsolescence globale R-128 appliquée ; 🔶 les tirs sur les cases adjacentes restent possibles (exploit R-141 conservé) ; une frappe bloquée n'est ni une détonation (pas de pénalité culturelle, `nukesLaunched` inchangé).
- **C18 — destruction de bâtiment par espion** : coût `round(marteaux × 0,5)` 🔶 **débité au lancement, non remboursé** ; réussite `clamp(0,9 − marteaux/500 ; 0,4 ; 0,9)` 🔶 (RNG seedé, consulté **après** le duel R-144 — un espion perdant le duel ne paie pas) ; **échec = espion + or perdus** ; trésorerie insuffisante = action sans effet (aucun débit, espion survit 🔶) ; merveilles non ciblables, Palais exclu (inchangé).

### L0 — Spécification (RULES.md)
- **Bloc 0 C15–C18** documenté en tête de §8.11 (avec la mention des révisions du 05/09).
- **Nouvelle section §8.12 — Civilisations & traits (R-145..R-150)**, base : doc d'Erik **fait foi**.
- **Constantes** : T-36 (seuils d'ère 5/14/24 🔶) et T-37 (ratio d'écrasement base 6 🔶) ajoutées à la table §11 ; ligne « Cratère » dans la table des terrains §2.

### L1 — Moteur (`packages/rules`)
- **`civilizations.json`** : les 16 civs (id, nom FR, dirigeant, avantage de départ, 4 bonus d'ère **cumulatifs**, unités uniques) + params globaux 🔶 (`overrunBaseRatio` 6, `startRevealRadius` 5, `orDepartDefault` 25, `gpThresholdMult` 0,75, `egypteWonderChoices` — liste fermée des 6 merveilles de l'ère Antique).
- **`eras.json`** : seuils d'ère 5/14/24 🔶 (T-36).
- **`civilizations.ts`** (nouveau) : catalogue fermé de **traits typés** + helpers purs partagés moteur/UI (`playerHasTrait` réel — remplace le stub 7l, `activeTraitsOf`, coûts, stats, overrun, etc.).
- **Ère par comptage (R-147)** : `player.era` persisté, recalculé en **fin de Phase C** (`processEraChanges`) — transition **au tour suivant**, cascade déterministe (les techs gratuites du palier peuvent franchir le suivant), événement **`EraChanged`** (public). Remplace `techEraOf` partout : pop de fondation, facteurs de rush, injection Explorateur, bonus de civ, Overrun.
- **Unités uniques (R-148)** : 24 entrées `units.json` (`uniqueTo` + `replaces`) — remplacement au menu dès la tech (pattern R-111), unités de départ et gratuites (huttes, réserve C7, Premier découvrir, paliers) comprises ; obsolescence **partagée** avec l'unité remplacée (dérivée, pas dupliquée) ; uniques aériens en données seules (`implemented: false`).
- **Traits actifs (R-149)** : tous implémentés moteur — voir la liste R-146 de RULES.md (dont `villagesVilles` Mongols : hutte → **ville pop 1** au lieu de la récompense, fallback récompense si fondation illégale T-09 🔶 ; `commerceCaptures` via le champ ville `wasCaptured` ; Overrun ajouté au combat §7 avec `sDef > 0` exigé 🔶 et **soutien naval exclu du ratio** — interprétation 🔶, testée contre le comportement R-118).
- **Avantages de départ (R-150)** : `createInitialState(map, seed, civSetup?)` — ordre déterministe : techs → gouvernement → bâtiments capitale → merveille Égypte (validée par `isEgyptWonderChoiceValid`) → or → GP (classe R-127 rotation, sans jalon) → révélation Russie → remplacement des unités de départ → vétérans Allemagne.
- **Migration 16 → 17** additive et idempotente : `civId: 'neutre'` par joueur (aucun trait pour les parties existantes), `era` recalculée au compage, `wasCaptured: false` par ville.

### L2 — Serveur
- Choix de civ **à la création** (hôte, `settings.civId` + `wonderId` Égypte) et **au join** (invité, `JoinGame.civId` + `wonderId`), validés contre les données (civ inconnue / merveille invalide ou **déjà prise par l'hôte** → refus) ; stockés dans `meta.players` (diffusés au `Welcome` et dans les résumés lobby) ; `createInitialState` reçoit le `civSetup` par engineId (crash-recovery inchangé : même seed + mêmes civs → même état).
- **Bot** : `BOT_CIV_ID` (défaut 🔶 `zoulous`) — joue une civ déterministe.

### L3 — UI + assets
- **`CivPicker.svelte`** : 16 cartes (nom, dirigeant, avantage de départ, résumé des 4 bonus d'ère, unités uniques) + menu de la Merveille Antique pour l'Égypte 🔶 ; intégré au Lobby (hôte, section Créer) et à la page Join (l'invité **choisit sa civ avant de rejoindre** — bouton de confirmation).
- **Game.svelte** : badge civ dans la barre supérieure — nom, **ère (compage)** et **civ adverse publique** (canon) ; tooltip listant les traits actifs (inactifs marqués « ○ (inactif) »).
- **Playback** : bandeau « **Ère Médiévale !** » (toast 2 s) à l'événement `EraChanged`.
- **CityPanel** : menus de production filtrés par remplacement R-148 (uniques réservés à leur civ, standards remplacés retirés).
- **Art des uniques** : **alias teintés** 🔶 (sprite de l'unité remplacée, accent joueur) — `UNIQUE_UNIT_ALIASES` dans `textures.ts` ; un PNG `unite_<id>.png` ajouté plus tard prendra automatiquement la main. Texture `cratere` générée (sol brûlé, fissures) + asset `tile_cratere` optionnel.

### L4 — Vérification
- **759 tests verts** (baseline 711 → **+48**, dont ~30 nouveaux pour la 7n : intégrité des données, ères, cumulativité, remplacement, avantages de départ, traits, overrun, migration 17, fog).
- **Live GUI vs bot** (dev 5174/8787) : partie `P463A8` créée avec **Zoulous** (hôte) vs **Amérique** (bot) ; vérifié via dump admin : `schemaVersion 17`, `p1=zoulous/p2=amerique` propagés lobby → GameDO, **guerrier_impi** en unité de départ avec **mp 2** (trait d'ère), guerrier standard côté Amérique (mp 1), badge « Zoulous · Ère Ancienne · Adversaire : Amérique » dans le DOM ; captures dans `dev-logs/captures-7n/` (sélecteur 16 civs + badge en partie).
- **CI deploy** : `53c2fbf` poussé sur `main` — statut en fin de rapport.

---

## 2. Décisions de tranche (défauts retenus — veto Erik possible)
1. **Ère par comptage** (défaut canon du handoff, tranché en L0) : 5/14/24 🔶 ; l'ère est **persistée** et la transition s'applique **au tour suivant** ; les techs de départ **comptent** (canon).
2. **Bonus d'ère « Ancienne » actif dès le début** — lecture retenue du doc : on entre dans l'ère Antique au setup ; une civ en Moderne cumule départ + 4 bonus (doc §Cumulativité). Les parenthèses « (5 Techs) » des en-têtes de colonnes du doc sont décalées d'un cran (artefact de mise en forme de la source).
3. **« +14 » du doc = piège de citations** (PILOT-HANDOFF §2 : les numéros de citation sont collés aux chiffres) : « +14 » = « +1 [4] ». Cross-check CivFanatics/Fandom : **Impi +1 M, Longbow +1 D, Samouraï +1 A, Obusier +2 A** — implémentés comme **traits d'ère** (les uniques gardent les stats de leur unité remplacée, canon Fandom), les ids d'uniques étant inclus dans les types ciblés.
4. **France Industrielle** : le +2 attaque s'applique aux **Canons ET à l'Obusier** (le doc le mentionne aux deux endroits).
5. **Écrasement (Overrun)** : mécanique **générale** ajoutée au combat (base canon 6:1 pour tous) ; le trait Zoulou abaisse à 4:1. `S_def > 0` exigé 🔶 (ratio indéfini contre une défense nulle) ; **le soutien naval ne compte pas** dans le ratio 🔶 ; mêlée uniquement (jamais pour un attaquant à distance).
6. **Mongols « villages→villes »** : tranché selon le handoff — **ouvrir une hutte fonde une ville pop 1** au lieu de la récompense RNG (fallback : récompense normale si fondation illégale). Les villages R-96 restent des camps destructibles pour l'or.
7. **Deux joueurs peuvent choisir la même civ** 🔶 (aucune interdiction canon tranchée) — mais pas la **même Merveille Antique** d'Égypte (exclusivité mondiale R-129).
8. **`rushHalfPrice` Amérique** : scope **unités seulement** (canon : « achat accéléré d'UNITÉS ») — le hook 7l, inactif jusqu'ici, est restreint en conséquence.
9. **Espagne « trésors ×2 »** : mappé sur l'**or des huttes** 🔶 (les artefacts sont la phase suivante).
10. **Traits inactifs documentés** (données portées, UI grisée, moteur ignore) : routes (3 civs), caravanes (2), élite auto (Allemagne), Loyauté (Japon/Russie).

## 3. Écarts doc/moteur & audit externe (signalés)
- **CivFanatics** (civilopedia civilisations) : bonus conformes au doc d'Erik sur les 16 civs. Deux écarts de **libellé/valeur** signalés : « **85mm Gun** » (CivFanatics) vs « **Canon 88mm** » (doc — retenu, doc fait foi) ; Montagnes « **+2 food** » (CivFanatics) vs « **+2 Production** » (doc — retenu ; StrategyWiki confirme la production).
- **Fandom (List of units)** : aucune colonne de stats différenciée pour les uniques → uniques = stats de l'unité remplacée ; les deltas du doc sont les bonus d'ère (décision 3 ci-dessus).
- **Obsolescence des uniques** dérivée du `replaces` (moteur) plutôt que dupliquée dans `techs.json` — un seul point de vérité ; les `unlocks` de techs.json listent bien les uniques (tests d'intégrité R-86 respectés).
- **Auto-assignation initiale des citoyens** classée sur les rendements de BASE (sans bonus de terrain civ) 🔶 — les bonus s'appliquent à la récolte ; évite de perturber le déterminisme des cartes existantes.

## 4. 🔶 À calibrer (édition de données + push)
- `eras.json` : seuils 5/14/24.
- `civilizations.json` params : `overrunBaseRatio` 6, `startRevealRadius` 5 (Russie), `orDepartDefault` 25 (Aztèques), `gpThresholdMult` 0,75 (Grèce/Rome), `egypteWonderChoices` (liste des 6 merveilles proposées à l'Égypte).
- `espionnage.json` C18 : `destroyBuildingGoldFactor` 0,5 ; `destroyBuildingSuccessBase/Divisor/Min/Max` (0,9/500/0,4/0,9).
- Zoulous `croissanceAcceleree` 0,33 (miroir Aqueduc — le canon dit « type Aqueduc » sans valeur).

## 5. À vérifier en ligne par Erik (login OAuth — stub coupé en prod)
1. **Lobby** : sélection de civ à la création (16 cartes) — le choix est affiché dans la liste des parties en attente.
2. **Join** (avec son 2e compte) : l'écran de join demande la civ + confirmation ; refus de la même Merveille Antique d'Égypte si l'hôte l'a prise.
3. **En partie** : badge « Civ · Ère · Adversaire : … » dans la barre supérieure (tooltip = traits actifs/inactifs) ; menu de production de ville — l'unité **unique** remplace la standard dès la tech (test visuel avec Zoulous/Angleterre/Mongols) ; production d'un Impi (sprite aliasé du Guerrier teinté accent joueur).
4. **Transition d'ère** : bandeau « Ère Médiévale ! » au franchissement de 5 techs (tour suivant) + tech gratuite du palier (ex. Arabie → Mathématiques).
5. **Migration** : reprendre une partie créée avant la 7n — les deux joueurs sont « Sans civilisation » (aucun trait), l'ère est recalculée au compage, aucun crash.
6. **Bloc 0** : frappe ICBM sur une ville ordinaire (rasement + cratère stérile/non fondable) vs capitale (survit, ⌈n/2⌉ bâtiments) ; Grande Muraille → tir `blocked` ; espion : destruction de bâtiment avec coût affiché et réussite variable.

## 6. Interprétations d'implémentation (documentées dans le code)
- Le cratère retire la **ressource** de la case (sémantique « stérile » 🔶) ; les villages/huttes ne sont pas affectés par les frappes (entités de carte, hors rayon d'unités) — aucune ressource ne réapparaît (cratère permanent 🔶).
- Un espion **perdant un duel** C18 ne débite pas l'or (l'action n'est pas tentée) ; trésorerie insuffisante = échec sans effet 🔶.
- `EraChanged` est **public** (miroir `GovernmentChanged` — l'ère est une info publique, canon).
- L'**auto-assignation** initiale ignore les bonus civ (voir §3) ; les bonus s'appliquent à la récolte (tileYield) et à la régénération PM.
- Les gains d'or d'hutte Espagne : `amount × 2` (multiplicatif avec un éventuel futur artefact 🔶).

## 7. Reste à faire (hors périmètre 7n — déjà consigné)
- **Art dédiée des 24 uniques** (`generate.py` : 24 planches `unite_<id>.png` — l'alias est actif en attendant, le PNG prend la main automatiquement).
- Périmètre interdit respecté : espionnage avancé (BACKLOG idée 5), artefacts (phase suivante), spike visuel 3D, thème nanotechnologique, territoire/flip culturel, promotions/XP — aucune modification au-delà du Bloc 0.

## 8. Environnement & incidents de session (transparence)
- Les serveurs de dev ont été tués deux fois par mes propres pipes `| head` (SIGPIPE) — cause première d'une fausse piste de debug (« hooks absents ») : le worker 8787 était simplement arrêté. Redémarrés en tâches durables en fin de session.
- **`requestAnimationFrame` ne tourne pas dans le navigateur intégré de l'agent** (rAF timeout 2 s) → le rendu Pixi (et donc la sélection au clic sur canvas) ne peut pas être validé **dans cet environnement** ; les vérifications GUI ont été faites au niveau DOM/état (badges, menus, dumps admin). La validation visuelle finale reste à faire par Erik en ligne (§5).
- Hook de test `window.__game` ajouté à `GameCanvas.svelte` **dev uniquement** (`import.meta.env.DEV`) : pilotage déterministe de la sélection/caméra pour les futures vérifications GUI automatisées.

## 9. Arrêt
Phase 7n livrée, poussée (`53c2fbf`), remise de la main au pilot. Prochaines étapes planifiées : **phase Artefacts** (Angkor Wat, Arche d'Alliance, École de Confucius, Atlantide — couplée à la génération procédurale), puis spike visuel 3D.
