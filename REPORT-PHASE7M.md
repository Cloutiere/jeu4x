# REPORT-PHASE7M — Nucléaire (ICBM/SDI/Manhattan) & espionnage jeu de base

**Date :** 05/09/2026 · **Commit :** `7ddcbf9` (push `main`, **CI Deploy : success**, prod health 200, assets 7m servis en prod) · **Baseline :** 659 tests verts → **Livrable : 711 tests verts** (rules **610**, server **38**, web **63**), `pnpm typecheck` vert, `schemaVersion` **16**.

---

## 1. Livrables (L0→L4, dans l'ordre du handoff)

- **L0 — RULES.md** : nouvelle section **§8.11** « Nucléaire & espionnage jeu de base — Phase 7m » (**R-138..R-144**) avec le **Bloc 0** (C13/C14) en tête ; amendements : R-30 (ville + défenseur + **1 espion par propriétaire**), R-43 (exceptions espion), R-119 (révisée : défense canon 0/0/2, renvoi §8.11), R-80 (RNG consulté **en Phase C** : duels + sélection des bâtiments détruits), §3.1 note roster, §8.4 ligne SDI « ✅ (7m) », §11 constantes **T-33/T-34/T-35** (source `espionnage.json`).
- **L1 — Moteur** (`packages/rules`) :
  - **R-138** : Manhattan activé (`grantsUnit: 'icbm'`) → ICBM instanciée dans la ville constructrice (case libre sinon adjacente, événement `UnitProduced` — canal réutilisé documenté) ; unicité structurelle via R-129 ; ICBM **`strategic: true`** → exclue de `isProducible`/`canSetProduction` (jamais en file, jamais rush-buyable) ; données auditées : **0/0/40** (4→40), PV 1, vision 2 🔶 ;
  - **R-139** : ordre **`Launch { unitId, target }`** (`orderShapeError` **EN PREMIER**), résolu **en tête de Phase C** ; validations : unité stratégique du joueur, cible existante **visible** (fog évalué à la résolution), ≠ Démocratie ; refus → `NukeLaunched{outcome:'refused', reason}` **missile conservé** ; lancement → missile consommé (cause `mission`), aucun coût de PM ;
  - **C13 (Bloc 0)** : ville ciblée **survit** — pop `min(pop, 2)` 🔶, **⌊n/2⌋ bâtiments** détruits (Fisher-Yates seedé, **Palais exclu**), **merveilles préservées**, **GP installés préservés**, **TOUTES les unités du rayon 1 (7 cases, deux camps) détruites** (cause `nuke` — GP « en attente » C13.6 compris), aucun changement de terrain ;
  - **C14** : rien à coder — la frappe ne déplace aucune unité, la domination exige toujours l'occupation (test e2e chaîné T3→T5) ;
  - **R-140** : Démocratie → tir **refusé** ; **pénalité culturelle −1 jalon** (T-33 🔶, `CultureMilestone` raison `nuke`) **annulée sous Despotisme** (`nuclearWithoutPenalty` — hook 7i activé) ; **la Muraille ne bloque pas l'ICBM** 🔶 ;
  - **R-141** : SDI → **interception garantie** du tir ciblant la case de la ville hôte (missile consommé, zéro dégât, `cityId` porté), **couverture locale** (test ville B non protégée), **exploit adjacent conservé** (unités du rayon tuées, ville intouchée) ;
  - **R-142..R-144** : espion **0/0/2** (défense 1→0), élimination **sans combat ni butin** hors ville, à l'abri en ville, **infiltration** par `Move` (ni attaque ni capture), espion **ne défend pas et ne capture pas** (garnison espion survit à la capture → devient infiltré ; infiltré détruit au rasement barbare 🔶), **réseaux** via `FormArmy` (R-44 préservé en ville), ordre **`SpyAction`** avec les **6 actions** et leur consommation, **duel d'espions** avant toute action hostile (matrice data-driven 🔶, perdant détruit, **sans garnison = succès automatique**, `leave` exempt) ;
  - nouvelles données **`espionnage.json`** + module `espionnage.ts` (`stolenGoldAmount`, `spyDuelWinChance`, `nukeCulturePenalty`) ré-exporté ; **migration 15→16** additive idempotente (`nukesLaunched: 0` par joueur).
- **L2 — Serveur** : `orderShapeError` + `orderOwnerError` pour `Launch`/`SpyAction` (`buildingId` exigé pour `destroyBuilding`) ; fog inchangé mais **vérifié en tests** : `GoldStolen` ne révèle que le **montant** (la trésorerie adverse reste à 0 dans l'état filtré) ; **dump admin** : sections **`nucleaire`** (ICBM en jeu, Manhattan construit/chantier, SDI par ville, launches en brouillon, détonations) et **`espionnage`** (espions avec statut dérivé garnison/infiltration/réseau, SpyAction en brouillon) — le dump admin reste le seul à tout montrer (protégé ADMIN_TOKEN) ; bot : garde-fou `strategic` dans `pickProduction` ; 2 tests de forme + 1 mise à jour version.
- **L3 — UI** : UnitPanel — bouton **« ☢️ Lancer l'ICBM… »** (unité stratégique), mode ciblage carte (`nukeArmed` dans l'UiState → clic = `nukeTarget`), **modale de confirmation « action IRRÉVERSIBLE »** avec avertissement SDI dynamique (« interception GARANTIE si la ville est visée ; cibler une case adjacente contourne le bouclier ») ; **menu d'actions d'espionnage** quand un espion ami est infiltré (6 boutons, désactivation contextuelle : production absente, aucun bâtiment non-Palais, défenseur non fortifié, `select` de bâtiment) ; badges **« 🕵 Garnison »/« 🕵 Infiltré dans »** + badge carte (œil ambré) ; GameCanvas — fx **explosion nucléaire** (onde orange + flash), playback/toasts/libellés FR pour les **7 nouveaux événements**, annonces différenciées tireur/victime ; `feedback.ts` — ordres `Launch`/`SpyAction` écartés signalés ; art — **`unite_icbm`** écrit dans `generate.py` (registre + EXPECTED), generate + sync-art exécutés, `UNIT_IDS` + `espion` + `icbm`.
- **L4 — Vérification** :
  - **e2e moteur** (suites `phase7m` 22 tests + `phase7m-spy` 18) couvrant : frappe complète C13, SDI interception + **exploit adjacent**, interdiction Démocratie, vol d'or **débit/réception**, duels d'espions (les deux issues, **déterminisme par graine**), consommation correcte (hostile exécutée consomme ; échec sans cible survit ; `leave` survit), migration 16 idempotente, et un **e2e chaîné 5 tours** : Manhattan → ICBM instanciée → déplacement 3 cases (40 PM, R-72) → frappe directe capitale (survit, pop 2, ⌊2/2⌋ bâtiment, garnison morte, pas de victoire) → occupation par la légion → **Victory domination** ;
  - **live GUI vs bot sur 5174** : partie `85SJDC` (Pangée), bot « Bot » rejoins, 3 tours résolus (dialogue unités sans ordre, journal `— Fin du tour 0, tour 1 —`, tour 3 stable, aucune erreur), captures `dev-logs/captures-7m/` (01 départ, 02 tour 1 résolu, 03 tour 3) ;
  - **dump admin live** : `schemaVersion: 16`, `nucleaire` + `espionnage` peuplés (valeurs initiales attendues) ;
  - **CI deploy : success** sur `7ddcbf9` ; **prod health 200** ; `/art/unite_icbm.png` et `/art/unite_espion.png` servis en prod (build 7m déployé).
- ⚠ Incident traité : un **serveur dev périmé** (workerd 07:27, avant les modifications) occupait 8787 — tué, redémarrage propre (le piège annoncé au handoff).

## 2. Décisions d'implémentation (écarts doc/moteur, tous documentés dans RULES.md §8.11)

| # | Sujet | Décision |
|---|---|---|
| 1 | **Timing du duel** | Le canon (§4.1) fait du duel un préalable « d'accès au menu » ; l'implémentation retient la variante du **handoff 7m** : duel **avant chaque action hostile** (à la résolution). Conséquence : l'infiltration est gratuite et silencieuse ; le duel tranche à l'action. |
| 2 | Espion & villes | L'espion **ne défend pas** la ville (une ville défendue uniquement par un espion est capturable) et **ne capture pas** (ville investie par un espion seul : aucune capture). À la capture, la garnison espion de la victime **survit et devient infiltrée** chez le captreur ; au rasement barbare, l'infiltré disparaît 🔶. |
| 3 | Butin des espions | Un espion capturé/enlevé (dans un sens comme dans l'autre) ne rapporte **aucun butin** 🔶 (le canon n'en mentionne pas — T-12 reste propre aux colons). |
| 4 | Données auditées | `icbm` : mouvement **4 → 40** (canon 0/0/40), vision 0 → 2 🔶, `implemented: true`, `strategic: true` ; `espion` : défense **1 → 0** (canon 0/0/2 ; le texte 7g/R-119 « 0/1/2 » était un écart — signalé) ; `ecriture.firstToDiscover` : `implemented: true` (l'**Espion gratuit** du Premier découvrir était déjà actif depuis 7g via `units.json` — désormais cohérent en données, testé) ; SDI/Manhattan : **conformes** au canon (200/Supraconducteur, 750/Théorie atomique). |
| 5 | Résolution de `Launch` | En **tête de Phase C** (la frappe précède économie/espionnage/captures — les unités du rayon disparaissent avant tout) ; ordre des refus : cible inexistante → invisible → Démocratie (ordre du R-139). |
| 6 | Pénalité culturelle | Sur **détonation uniquement** (interception = pas de frappe 🔶) ; plafonnée aux jalons disponibles (jamais négative) ; Despotisme annule (`nuclearWithoutPenalty`, actif). Interaction ONU : retomber sous 20 jalons **suspend** le chantier (déjà implémenté 7f — non cassé). |
| 7 | Grande Muraille | Ne bloque **ni l'ICBM** ni l'**infiltration** d'un espion 🔶 (ni l'un ni l'autre n'est une « attaque »). L'entrée dans une ville **vide** protégée par la Muraille reste bloquée pour les non-espions (inchangé 7k). |
| 8 | Terrain après frappe | **Aucun changement** : ni cratère ni conversion océan→production (C13 unifiée ne porte pas les effets terrain du canon §1.3) 🔶 — écart signalé, réversible à l'acceptation. |
| 9 | Instanciation ICBM | Canal `UnitProduced` réutilisé (pas de nouvel événement) — l'ICBM n'a jamais été dans une file ; « perte si aucune case libre » (miroir R-114) 🔶. |
| 10 | Kidnapping | Fenêtre de la ville (case ou adjacente — miroir R-115), choix déterministe (sur place → (q,r) → unitId) ; le GP transféré est **repositionné à la capitale du voleur** (case libre sinon adjacente, sinon reste sur place) ; **zéro jalon, zéro escalade** (miroir C2). |
| 11 | Échec vs exécution | Action hostile **exécutée → espion consommé** ; **sans cible valable → échec sans effet, espion survit** (miroir R-119-7g 🔶) — l'UI désactive les boutons sans cible. `leave` sans case adjacente libre : sans effet, espion conservé. |
| 12 | Réseaux | Fusion via `FormArmy` existante (aucun nouveau code) ; l'exception de co-location R-44 est préservée **dans les villes** (un réseau peut s'y former) ; un réseau peut infiltrer/garnir comme entité unique. |
| 13 | Migration 15→16 | Champ additif `nukesLaunched: 0` (statistique/audit R-139). Aucune autre transformation : l'ICBM est une unité absente des états migrés, l'infiltration/garnison sont **dérivés de la position** (espion sur case de ville), les ordres vivent hors état. Idempotente, testée. |
| 14 | Infiltration & R-30 | Un espion entre dans une ville **amie** (garnison) ou **ennemie** (infiltration) sans combat ; **un seul espion par propriétaire et par ville** (un second est bloqué — test) ; la Muraille ne l'arrête pas 🔶. |

## 3. 🔶 À calibrer (veto Erik — données `espionnage.json`, zéro code)

1. **Moitié des bâtiments** : arrondi **⌊n/2⌋** (proposition handoff appliquée) — Palais exclu, sélection seedée rejouable.
2. **Pénalité culturelle** : **−1 Jalon** par détonation (T-33) — alternative « −X culture cumulée » non retenue ; annulée sous Despotisme.
3. **Part d'or volée** : **50 %** (T-35), arrondi au plus proche, plafonné à la trésorerie.
4. **Matrice de duel** (T-34) : isolé vs isolé **0,5**, réseau vs isolé **0,9**, réseau vs réseau **0,5** — cellule **isolé vs réseau = 0,1** (complétion symétrique, non documentée par le canon).
5. **Mode de sélection du bâtiment** : le **`buildingId` porté par l'ordre** (UI = `select` parmi les bâtiments non-Palais) — le canon ne précise pas le mode.
6. Vision de l'ICBM : 2 (canon muet) ; détonation interceptée = pas de pénalité ; `leave` exempt de duel.

## 4. Vérifications en ligne pour Erik (login OAuth sur la prod — `game-4x-server-prod.erik-ai-studio.workers.dev`)

La prod sert déjà le build 7m (health 200, sprites `unite_icbm`/`unite_espion` présents). Scénario de vérification conseillé (partie test, Tech partie rapide ou dump admin pour tricher) :

1. **ICBM — instanciation** : compléter le **Projet Manhattan** (750, Théorie atomique) → l'ICBM apparaît sur la case de la ville constructrice (`UnitProduced` au journal) ; vérifier qu'elle est **absente des menus de production** (stratégique) et **non rush-buyable**.
2. **ICBM — lancement** : sélectionner le missile → bouton **« ☢️ Lancer l'ICBM… »** → la barre passe en mode ciblage → cliquer une case visible → **modale de confirmation** (« IRRÉVERSIBLE », avertissement SDI si la cible en a une) → confirmer → à la résolution : explosion, `NukeLaunched`/`CityNuked` au journal, toast, ville survit (pop 2, moitié des bâtiments, merveilles/GP intacts), **toutes** les unités du rayon détruites, **aucune capture**.
3. **Démocratie** : adopter la Démocratie → le bouton reste actif mais la résolution **refuse** le tir (`NukeLaunched refused`, missile conservé, toast « Ordre non exécuté » évité — le refus est explicite au journal).
4. **SDI** : construire une SDI dans une ville → tir direct dessus = **interception garantie** (missile perdu, zéro dégât) ; tir sur une case **adjacente** = pas d'interception (unités du rayon détruites, ville intacte).
5. **Espion** : produire un Espion (Écriture ; l'**Espion gratuit** du Premier découvrir Écriture doit apparaître) → l'entrer dans une ville ennemie → **menu d'actions** dans le panneau → tester vol d'or (50 % — la victime reçoit le toast **avec le montant**), sabotage (marteaux à zéro, réserve C7 intacte), destruction de bâtiment (liste sans Palais/merveilles), fortifications, **partir discrètement** (non consommé) ; vérifier qu'un espion **en garnison chez vous** déclenche un **duel** (journal `SpyDuel`) contre l'infiltrateur.
6. **Fog** : la trésorerie adverse reste masquée (aucune fuite hors le montant volé) ; un espion ennemi hors vision n'apparaît pas.

## 5. Périmètre respecté

Espionnage **avancé** (BACKLOG idée 5) : infiltration disparaissante, XP/points d'espionnage, bâtiments de contre-espionnage, menu de renseignement, fenêtre d'annulation, vol de tech/unités, assassinat — **non implémenté** ; civilisations (7n), artefacts, flip culturel — non touchés ; aucun recalibrage au-delà du Bloc 0. `SpyMission` 7g (vol de GP installé à distance ≤ 1) **conservé tel quel** — les deux mécaniques coexistent.

## 6. Arrêt

Serveurs dev (8787/5174) et bot test arrêtés. Travail commité `7ddcbf9`, poussé, CI Deploy **success**, prod à jour. **Remise de la main au pilot** — prochains jalons proposés : acceptation 7m (arbitrages 🔶 ci-dessus), puis cadrage « Espionnage avancé » (BACKLOG idée 5) ou 7n (civilisations).
