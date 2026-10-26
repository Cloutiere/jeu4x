# REPORT-PAIX-RYTHME — Armées de siège (canon R-31), cible pondérée, paix du gagnant (27/10)

**Mission** (HANDOFF-PAIX-RYTHME, décisions Erik 27/10) : D1 armées de siège par `FormArmy` canon, D2 cible de guerre pondérée = cible de campagne, D3 paix du gagnant + paix administrative des guerres vides, D4 régénération en RÉERVE. **D1-D3 livrés et verts ; cibles D5 NON ATTEINTES — échec PROUVÉ, dossier nerf (D4) + leviers au §5.**

## 1. Ce qui est livré

- **D1 — armées de siège (canon R-31, aucune valeur touchée)** : au siège (membres de l'armée au rayon de ralliement de la cible de campagne), les **trios homogènes** (même type, hors armées) reçoivent `fusionner` (co-localisés → ordre `FormArmy`, porté par le premier id) ou `converger` (marche vers le rendez-vous, `FormArmy` émis DÈS la convergence pour l'exemption R-44 — entrée sur le RDV occupé). Le rendez-vous = l'hex du membre le plus proche de la cible. L'ARMÉE formée (9 PV, entité unique) marche (`offensiver`) et frappe ; le siège priorise la garnison (priorite 5, BOT-ARMEE).
- **D1bis — ralliement RÉPARTI** (découverte de sonde) : le rendez-vous UNIQUE embouteillait la colonne (sonde 27/10 : jamais plus de 1-2 membres au rayon). Chaque membre reçoit maintenant UN hex distinct de l'anneau (`anneauRalliement` — géométrique, STABLE d'un tour à l'autre, rang = distance à la cible, tie id R-81).
- **D1ter — conscription par appariement** (découverte de sonde) : l'ancienne boucle par ordre d'id rappelait les MARCHEURS de campagne pendant que les recrues à domicile restaient chez elles — l'armée se vidait en marche. Nouveau `planGarnison` : villes en ordre canonique (capitale d'abord), unités AU PLUS PRES de chacune, scout rappelé d'office à l'URGENCE (canon BOT-EXPLORATION D3), et une unité **au contact d'une ville ennemie n'est brouillée qu'en dernier recours** (elle assiège).
- **D2 — cible pondérée** : `score = forces × (1 + poidsDistanceCibleGuerre × dist wrap capitales)` — le plus faible PARMI LES PROCHES ; `cibleCampagne` = la ville la plus proche DE CETTE cible (fin de la marche divergente). Donnée : `poidsDistanceCibleGuerre` **0,3** (×3 profils).
- **D3 — paix du rythme** : `chanceAccepteFaible` ABROGÉE (jamais déclenchée en 1581 occasions) ; réponse DÉTERMINISTE : paix du **GAGNANT** au-delà de `toursPaixGagnant` (2) × `toursPaixMin` ; paix **administrative** d'une guerre **jamais bataillée** à `toursPaixMin` (le bot la propose même en position de force — les propositions répétées n'usent personne, zéro re-tirage). Les batailles sont comptées par paire : `diplomacy.batailles` (champ OPTIONNEL — `schemaVersion` 28 intouchée), incrémenté par le moteur à chaque échange entre paires en guerre, remis à zéro à la paix.
- **D4 — régénération R-71 INCHANGÉE** (réserve respectée — voir verdict §4).
- **D6 — joueur inchangé** : `FormArmy` reste disponible tel quel ; R-31/R-71 et toutes les valeurs de combat/villes intactes.

## 2. Validation

- L1 test-first : `bot-paix-rythme.test.ts` 15 verts (trios homogènes, isArmy exclus, rdv, émission FormArmy, **ArmyFormed bout-en-bout moteur**, batailles comptées, paix vide/gagnant/déterministe, pondération) ; tests BOT-ARMEE/BOT-TC/BOT-EXPLORATION/BOT-TA recalés au nouveau canon (25+23 verts).
- Suites : **server 289 verts** (+4 skip), **rules 1101 verts**, `tsc 0` (turbo 4/4), web intact.
- Banc d'arbitrage 40×3×150, civs réelles P7 : artefact `devtmp/banc-paix-rythme.json`, comparateur `devtmp/banc-paix-analyse.mjs`.

## 3. Tableau D5 (arbitre) — AVANT (BOT-ARMEE 26/10) / APRÈS (PAIX-RYTHME)

| Métrique D5 | Avant | **Après** | Cible | Verdict |
|---|---|---|---|---|
| 0 écrasement avant t30 | 0 | **0** | 0 | ✓ |
| Parties moyennes > 100 tours | 141,6 | **144,2** | > 100 | ✓ |
| ρ agressivité ↔ batailles | 0,53 | **0,57** | ≥ 0,4 | ✓ |
| ≥ 40 % guerres avec percée | 3,7 % | **3,6 %** | ≥ 40 % | ✗ NON ATTEINTE |
| ≥ 10 % guerres avec capture | 3 (0,7 %) | **3 (0,5 %)** | ≥ 10 % | ✗ NON ATTEINTE |
| Guerres stériles | 87 % | 92 % | — | dégradé |
| Durée moyenne des guerres | 13,9 | 12,1 | — | dégradé |

God mode (devtmp/paix-rythme-gui.mjs → dev-logs/captures-paix-rythme/) : guerre déclarée ✓ ; **ARMÉE FORMÉE NON OBSERVÉE en 80 tours** (le bot était à 19-23 cases, guerre fermée à t69+8 par la paix administrative) — 🔴 ; captures de ville non obtenues.

## 4. Pourquoi les cibles ne sont pas atteintes — la chaîne de preuve (sondes devtmp/sonde-paix-rythme.mjs, sonde-marche.mjs)

1. **La géométrie du banc** : 1v1 sur 40×40 = spawns à 15-20 cases. La marche coûte 15-25 tours (1 case/tour, embouteillages de colonne compris).
2. **L'horloge de paix D3** ferme toute guerre vide à `toursPaixMin` (8/12/20) et toute guerre bataillée à 2× (16/24/40) — la guerre se ferme AVANT que l'armée arrive. Les guerres qui durent (impasse : personne ne perd assez pour proposer) sont les seules où l'armée approche — sonde : membres à dist 4-5 après ~60 tours de guerre.
3. **La marche reste le verrou** : rangs qui permutent en approche, chasse aux barbares pendant les Paix qui disperse l'armée aux coins de la carte, colonnes qui s'embouteillent — le bot ne déplace qu'1 unité/tour vers la cible effective. Ce verrou préexiste (consigné BOT-ARMEE) et n'est pas levé par D1-D3.
4. **Conséquence** : la fusion D1 (canon, testée bout-en-bout) n'a quasiment jamais l'occasion de se produire au banc — `FormArmyEmis = 0` sur des parties entières, non par bug mais par aucune rencontre armée×siège dans la fenêtre de guerre.

**Verdict D4 (attendu du handoff)** : les armées ne suffisent PAS en l'état — le nerf de régénération (R-71 : +1 PV/tour, +2 en ville → ex. 1 PV/2 tours, +1 en ville) ne changerait RIEN à ce stade car le problème est en AMONT (la guerre se ferme avant le siège). Le nerf ne devient pertinent qu'après les leviers §5. **Dossier remis à Erik, R-71 non touchée (réserve respectée).**

## 5. Leviers proposés pour le prochain banc (décision Erik)

1. **Horloge suspendue au siège** : ne pas compter les tours de paix quand des unités assiégeantes sont à ≤ 2 d'une ville ennemie en guerre (la guerre « vit » tant que le siège tient) — levier minimal, ciblé, canon-adjacent.
2. **Armée permanente hors guerre** : la campagne se constitue en Paix près de la frontière (au lieu de chasser les barbares aux coins) — la déclaration part d'une armée déjà en place (le siège démarre à t+2, pas t+20).
3. **Marche coordonnée** : le bloc d'armée avance comme un groupe (les followers suivent la tête au lieu de re-planifier chacun) — chantier de pathfinding, plus coûteux.
4. D4 en réserve : si 1-3 ne suffisent pas, rouvrir R-71 (1 PV/2 tours, +1 en ville).

## 6. À juger en jouant par Erik

1. **Le rythme des paix** : les guerres vides se ferment désormais à 8/12/20 tours (bot-vs-bot ET bot-vs-joueur — la proposition administrative du bot est acceptée automatiquement par la cible humaine, consigné 🔶 : le joueur ne répond pas aux propositions du bot en l'état du DO). Si ce rythme est trop tôt/tard → `toursPaixMin` / `toursPaixGagnant` (données).
2. **Le poids de distance (0,3)** : les guerres se déclarent contre des voisins proches même un peu plus forts (578 guerres au banc contre 430 — cadence en hausse). À l'œil en multi.
3. **La paix administrative en position de force** : un bot fort ferme une guerre vide qui traîne — vérifier que c'est le ressenti voulu en jouant.

## 7. Fichiers

- rules : `state.ts` (diplomacy.batailles optionnel), `diplomatie.ts` (`bataillesDe`/`compterBataille`, purge à la paix), `turn.ts` (comptage au combat), `types.ts` + `data/bot.json` (`toursPaixGagnant` 2, `poidsDistanceCibleGuerre` 0,3 ; `chanceAccepteFaible` supprimée).
- server : `botPolicy.ts` (`groupesFusion`, `anneauRalliement`, `cibleGuerrePonderee`, `deciderPaix` déterministe, `planGarnison`, objectifs `fusionner`/`converger`), `game.ts` + bancs (deciderPaix sans rng).
- tests : `bot-paix-rythme.test.ts` (15), recalage `bot-armee`/`bot-tc`/`bot-exploration`/`bot-ta` ; banc `tests-banc/banc-paix-rythme.test.ts` (gate BANC_BOT_TD).
- devtmp (non suivi ou artefacts) : `banc-paix-rythme.json`, `banc-paix-analyse.mjs`, `paix-rythme-gui.mjs`, `sonde-paix-rythme.mjs`, `sonde-marche.mjs`, `dbg-garnison*.mjs`.
- Pièges consignés : `deciderPaix` a PERDU son paramètre rng (3 sites d'appel + tests recalés) ; le comparateur lit `civilizations.json` pour l'agressivité (pas d'import ESM en .mjs).

## 8. Arrêt

Un commit poussé (CI déploie). Rapport remis ; D4 en réserve, leviers §5 au verdict d'Erik.
