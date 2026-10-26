# REPORT-BOT-TC-OBSERVATION — Banc d'observation des guerres IA (25/10)

**Mission** (HANDOFF-BOT-TC-OBSERVATION, décisions Erik 25/10) : faire jouer les IA entre elles sur le banc T-D (même corpus 40 seeds × 3 difficultés × 150 tours), extraire les chroniques de guerre, produire un rapport d'observation avec valeurs de réglage proposées. **Aucun changement de comportement appliqué** — Erik tranche, l'application fera l'objet d'un mini-handoff.

## 1. Ce qui a été livré

- `apps/server/src/bancObservation.ts` — extracteur PUR (chronologies D2, métriques D3), boucle identique à `bancBotTd.simulerPartie` (mêmes RNG, mêmes décisions — zéro dérive du corpus).
- `apps/server/tests/banc-observation.test.ts` — L1 test-first : **13 verts** (fixture à guerre connue, métriques, déterminisme bit à bit). `tsc 0`.
- `apps/server/tests-banc/banc-bot-tc-observation.test.ts` — L2 banc complet (gate `BANC_BOT_TD`, ~4-6 min), **PASS ×2** (2e passe après correctif d'attribution, §2).
- **Artefact D6** : `devtmp/banc-bot-tc-observation.json` (chronologies complètes des 120 parties + métriques agrégées — réutilisable par les passes suivantes et le banc Jev).
- Zéro moteur, zéro `bot.json`/`civilizations.json`, `schemaVersion` 28 intouchée. Rien de committé (remise de la main).

Correctif d'extracteur en cours de mission (sensible au rapport) : quand une paire re-déclare la guerre après une paix, les propositions de paix étaient rattachées à la guerre FERMÉE de la paire au lieu de la guerre en cours — corrigé (guerre active d'abord, repli la plus récente), banc re-exécuté.

## 2. Vue d'ensemble (40 parties × 3 difficultés × 150 tours)

| Difficulté | Guerres/partie | Guerres/30t | 1re guerre (t) | Ratio décl. | Décl. plus fort | Durée moy. | Stériles | Paix prop. | Paix acc. | Captures | Élim. | Fins <t30 | Fins <t50 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| facile | 1,57 | 0,32 | 16,8 | 1,49 | 100 % | 35,3 | **75 %** | 352 | 27 | 1 | 0 | 0 | 0 |
| normal | 2,75 | 0,57 | 11,3 | 1,71 | 95 % | 20,3 | **89 %** | 481 | 79 | 0 | 0 | 0 | 2 |
| difficile | 5,20 | 1,06 | 9,0 | 1,95 | 85 % | 11,0 | **92 %** | 1041 | 187 | 0 | 0 | 0 | 0 |

Sur 381 guerres : 293 finies en paix, **84 encore ouvertes à t150**, 4 éliminations, **1 seule capture de ville en 120 parties**. 93 paires sur 120 se sont fait la guerre PLUSIEURS fois (jusqu'à 8 re-déclarations).

## 3. Verdicts — checklist de calibrage d'Erik

### 3.1 Fréquence — ✅ gradation correcte, ⚠ cadence « difficile » en ping-pong

La gradation suit exactement les leviers : première guerre à t9,0/11,3/16,8 (miroir de `tourMinGuerre` 8/10/15), guerres/partie 5,20/2,75/1,57 (miroir du produit agressivité 0,5 × `facteurAgressivite` 1,5/1,0/0,6). Mais en difficile, une guerre démarre tous les ~28 tours et **93 paires / 120 re-déclarent (max 8 fois)** : la diplomatie devient un va-et-vient mécanique guerre→paix à `toursPaixMin`→re-déclaration dès `delaiEntreGuerres` (12 tours) écoulé.

**Anecdote** (difficile, seed 3538506724) : p1 déclare t9 à forces ÉGALES (2 contre 2), aucun combat jamais ; paix acceptée t19 (durée 10) ; re-guerre ; p2 propose la paix 10 fois entre t31 et t61 ; paix t61. Deux cycles complets sans une seule bataille.

### 3.2 Cible — ✅ le voisin le plus faible est bien visé

Le déclarant est plus fort que sa cible dans 85-100 % des déclarations (ratio moyen 1,49-1,95). Les 15 % de déclarations « à la faiblesse » en difficile viennent de `seuilRatioGuerre` 0,5 : le bot attaque un voisin DEUX FOIS plus fort. Ex. (difficile, seed 2644100516) : p1 déclare t109 à 19 contre 38 — paix administrative 8 tours plus tard, aucun combat.

### 3.3 Conduite de guerre — ❌ DÉFICIENT : la guerre est un état diplomatique, pas une campagne

- **75-92 % de guerres STÉRILES** (déclarées sans AUCUNE bataille).
- Progression vers la capitale cible (distance min du déclarant, mesurée sur les 381 guerres) : 262 guerres n'ont JAMAIS approché à moins de 10 cases ; seules 20 ont approché à ≤2 (et 20 des 45 guerres avec batailles à ≤3).
- Les guerres qui se battent sont des GRINDS : 20-99 batailles, pertes mutuelles massives (39/33, 28/27, 21/19), **jamais de percée** — 84 guerres encore ouvertes à t150.
- Bilan militaire total : **1 capture et 4 éliminations en 120 parties** — concordant avec le banc carte-multi « sans victoire structurelle » (R-187) et le botSolo non convergé (mur de garnisons + circulation).

L'objectif offensif D2 (armées excédentaires → capitale ennemie) ne se manifeste pas : les garnisons/patrouilles absorbent les unités et la défense de ville reste dominante. **C'est le principal chantier — et il est hors `bot.json`** (comportement d'assignation, pas seuils).

**Anecdotes** :
- « Verdun » (facile, seed 2896796234) : p2 déclare t17 à 2 v 2, puis **99 batailles, 72 unités détruites des deux côtés**, jamais à moins de 4 cases de la capitale, guerre ENCORE OUVERTE à t150.
- La seule vraie campagne (facile, seed 3802591813) : p2 déclare t16, 18 batailles, atteint la capitale (distance 1), élimine p1 à t62 — l'unique guerre où déclaration → offensive → conquête a tenu la promesse.
- Déclaration de façade (difficile, seed 2644100516) : p2 déclare t149 à 50 contre 20 — deux tours avant la fin du banc, zéro combat.
- Pari sur un cadavre (normal, seed 2062669699) : p1 déclare t44, et p1 lui-même est éliminé t46 sans bataille — la guerre déclarée contre un voisin qui meurt d'autre chose.

### 3.4 Paix — ❌ DÉFICIENT : une horloge, pas une négociation

Mesure exacte sur les 1581 propositions refusées / 293 acceptées :

| Difficulté | Prop. avant `toursPaixMin` | Acceptées avant | Prop. après | Acceptées après |
|---|---|---|---|---|
| facile (20) | 325 | **0** | 27 | 27/27 |
| normal (12) | 402 | **0** | 79 | 79/79 |
| difficile (8) | 854 | **0** | 187 | 187/187 |

- **`chanceAccepteFaible` est un paramètre MORT** en bot-vs-bot : il ne peut déclencher que si le DÉCIDEUR est écrasé, or le bot ne propose que perdant — le décideur est donc toujours le plus fort, et `deciderPaix` refuse avant même le tirage. 0 acceptation « faiblesse » sur 1581.
- À `toursPaixMin`, l'acceptation est automatique : la durée médiane des guerres finies en paix est EXACTEMENT 20/12/8 (14/27 facile, 63/79 normal, 131/187 difficile).
- Le perdant supplie (jusqu'à 10 refus de suite, séries de 5-7 banales) ; le gagnant n'a AUCUNE raison d'accepter : la guerre stérile ne lui coûte rien.

**Anecdote** (facile, seed 1007635584) : p2, perdant à rapport 0,28-0,49, propose la paix 5 fois entre t26 et t34 — 5 refus. Paix enfin acceptée t96 (durée 76 !). Re-guerre t137 : 8 nouveaux refus jusqu'à t150. Le perdant passe ~60 tours en guerre qu'il veut quitter.
**Anecdote** (facile, seed 4043360095) : guerre déclarée t17, paix refusée 4 fois, puis paix à… t150, dernier tour du banc.

### 3.5 Écrasement — ✅ aucun (peut-être TROP)

0 partie finie avant t30, 2 avant t50 (sur 120) ; tours moyens 145-148. Aucune civ ne domine militairement — cohérent avec l'absence de conquêtes (3.3). La menace « un bot me dévore avant t30 » n'existe pas dans l'état actuel.

### 3.6 Difficultés — ⚠ la gradation est diplomatique, pas militaire

La difficulté change la FRÉQUENCE des guerres (1,57 → 5,20/partie) et la longueur des guerres (35 → 11 tours), mais pas leur RÉSULTAT : captures ≈ 0 et éliminations ≈ 0 à toutes les difficultés. Jouer en difficile = subir plus de déclarations, pas un bot plus capable de conquérir.

**Anecdote d'écrasement propre** (normal, seed 993235891) : p1 déclare t46 à 23 contre 4 (ratio 5,75) — élimination en 1 tour sans bataille (marche sur la capitale vide). Le moteur SAIT écraser un faible ; il ne le fait quasiment jamais parce que les offensives ne partent pas (3.3).

## 4. Agressivité déclarée vs observée par civ — ⚠ non mesurable sur ce corpus

Limite structurale : le banc crée les parties SANS `civSetup` → les deux bots sont `civId: 'neutre'` (agressivité 0,5). **Le champ `agressivite` par civ (0,25 → 0,9) n'est donc JAMAIS exercé sur le banc** ; toute la gradation observée vient du `facteurAgressivite` du profil. Mesuré : 1,59 déclarations par ligne de joueur avec agressivité 0,5 — cohérent avec le produit 0,5 × facteur, mais le comportement aztèque (0,9) vs inde (0,25) reste inconnu.

## 5. Réglages proposés — **NOT APPLIED** (décision Erik)

| # | Point | Actuel | Proposé | Justification (chiffres) |
|---|---|---|---|---|
| P1 | Conduite de guerre — offensives | objectif `offensiver` : armées excédentaires vers la capitale | Prioriser l'offensive sur la garnison : augmenter le quota d'« excédentaires » (ex. toutes les unités au-delà de `garnisonsCapitale` TOTAL, pas par ville) et cible = ville ennemie LA PLUS PROCHE (pas la capitale) | 75-92 % de guerres stériles ; 262 guerres sans jamais approcher à 10 cases de la capitale ; 1 capture/120 parties |
| P2 | Fréquence difficile — ping-pong | `delaiEntreGuerres` 12 | 20-25 | 93/120 paires multi-guerres (max 8) ; guerre tous les ~28 tours = va-et-vient guerre→paix→guerre |
| P3 | Cadence difficile | `facteurAgressivite` 1,5 (+ `tourMinGuerre` 8) | 1,2 (+ `tourMinGuerre` 10) | 5,2 guerres/partie ≈ une déclaration tous les 28 tours ; cible raisonnable ~2,5-3 |
| P4 | Cible difficile | `seuilRatioGuerre` 0,5 | 0,7 | 15 % de déclarations contre un voisin 2× plus fort, systématiquement stériles |
| P5 | Paix — paramètre mort | `chanceAccepteFaible` 0,6/0,75/0,85 | Abroger, OU le retourner : le GAGNANT accepte la paix au-delà de 2× `toursPaixMin` (nouveau champ, ex. `toursPaixGagnant` 24/24/16) | 0/1581 acceptations avant `toursPaixMin` — le perdant supplie jusqu'à 60+ tours ; le gagnant n'a aucun coût à la guerre stérile |
| P6 | Paix — horloge | acceptation automatique à `toursPaixMin` | Garder (base saine) mais conditionner à une guerre NON stérile (≥1 bataille) OU à un rapport défavorable | Médiane de durée = exactement 20/12/8 : des guerres sans un combat se ferment « administrativement » à l'horloge |
| P7 | Banc — civs réelles | `createInitialState(map, seed)` sans `civSetup` → 2× « neutre » | Assigner des civs du corpus (déterministe par seed) au banc d'observation | `agressivite` par civ 0,25-0,9 jamais exercée (§4) — P1-P6 ne calibrent que le facteur de profil |

Non proposé (hors périmètre de seuils, renvois) : le mur défensif/circulation qui bloque TOUTE conquête (botSolo 🔶 déjà cadré, R-187 carte-multi) — P1 ne suffira pas si la défense reste imbattable ; T2 (négociation) pour une vraie paix.

## 6. Pièges consignés

- Cache vitest `apps/server/node_modules/.vite` purgé avant chaque re-mesure (piège BOT-TC, toujours actif).
- Banc = ~4-6 min, gate `BANC_BOT_TD`, pool Node via `vitest.banc.config.ts` — jamais dans la config CI principale.
- `devtmp` : résoudre depuis le FICHIER (import.meta.url) — piège `~/devtmp` (C:\Users\Erik\devtmp ≠ ZCodeProject/devtmp) toujours actif.
- Re-déclaration d'une même paire : rattacher les propositions de paix à la guerre ACTIVE (correctif livré dans l'extracteur, §1).

## 7. Arrêt

Rapport remis, aucun changement de comportement, rien de committé. Fichiers ajoutés (non trackés) : `apps/server/src/bancObservation.ts`, `apps/server/tests/banc-observation.test.ts`, `apps/server/tests-banc/banc-bot-tc-observation.test.ts`, artefact `devtmp/banc-bot-tc-observation.json`. La main est à Erik pour trancher P1-P7 (mini-handoff d'application à venir).
