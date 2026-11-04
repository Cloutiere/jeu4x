# REPORT-HUTTE-EXPLORATION — Une hutte adjacente s'ouvre : l'exploration ramasse les bonus sur son chemin

**Mission** : HANDOFF-HUTTE-EXPLORATION (signalement Erik 04/11, partie ZWV7T5 — le guerrier de Jev contournait la hutte h9 alors ADJACENTE, `order: null`). Canon visé : au CivRev, les éclaireurs ramassent les bonus sur leur route.

---

## 1. Diagnostic L1 (gratuit, AVANT tout code) — DEUX mécanismes prouvés, empilés

Rejeu sur l'état prod réel (dump admin `/admin/game/ZWV7T5`, tour 5, téléchargé dans `devtmp/etat-ZWV7T5/` — sonde `devtmp/sonde-zwv7t5-u4.mjs`) :

**Trajectoire reconstituée (journal Jev t1-4)** : le guerrier u4 de Jev marche vers l'Ouest (25,5) → (24,5) → (23,5) → (22,5) → (21,5) pendant que h9 (22,6) reste ouverte. **Aucune question de déplacement n'est jamais posée à Jev** (0 question de mouvement dans les 4 journaux — le mouvement est 100 % botPolicy), et `rappeler` n'existe pas ici : u4 reçoit `rallier` vers c1 (-8,25) — il est membre de l'armée PROJETÉE (BOT-MARCHE D2, préparation de guerre en paix), pas un scout.

**(a) Le classement ignore les huttes** — 0 occurrence de « hutte » dans tout `botPolicy.ts` : ni le bloc patrouiller, ni le ⑤ explorer (case la plus lointaine ancrée capitale), ni les branches de ralliement ne voient `state.huts`. Le classement est structurellement aveugle.

**(b) L'anti-recul interdit le pas latéral** — objectif u4 = `rallier` cible (-8,25), dist 29. Le pas vers la hutte est **non-améliorant** : dIci = 29, via hutte = 29 → `pasVers`/`pasVersRoutier` choisissent (20,5) à l'Ouest (dist 28). Preuve que l'exception D2 est nécessaire ET suffisante : `pasVers(u4, hutte)` renvoie bien (21,6) quand la hutte EST la cible.

**Rejeu post-fix (même sonde, même état)** : objectif u4 = `{kind:'explorer', cible:(22,6)}` — la hutte — pas (21,6), amélioration stricte 2 → 0. Le cas Erik est corrigé bit-à-bit sur la prod.

## 2. Livraison (D1 + D2, tranche votée)

**D1 — la hutte connue est une cible PRIORITAIRE** (`botPolicy.ts`, helper `hutteConnueProche` + branche dans `assignerObjectifs`, insérée APRÈS les urgences soigner/attaquer/repli, AVANT patrouiller/garnison/rallier) :
- hutte dans `state.huts` (ouverte = spliced par `openHutAt` → quitte le classement naturellement), **connue** (case dans `me.vision.explored` — le bot ne triche pas), praticable pour la classe de l'unité (les navales ne montent pas sur une hutte terrestre), **LIBRE** (jamais d'entrée de combat non planifiée), à `dist ≤ hutteDetourMax` (adjacente toujours — dist 1), non réservée à un autre scout CE tour (`explorationReservees` — un scout par hutte) ;
- **data** : `hutteDetourMax: 3` dans les 3 profils de `bot.json` (justification : le détour doit rester « raisonnable » — dist ≤ 3 couvre l'adjacente et le pas d'approche du cas ZWV7T5 (dist 2) ; la hutte à 6 cases de détour reste à l'œil au banc comme prévu au handoff) ; type `BotProfileData` amendé (additif) ;
- **champ d'application** : l'armée de campagne active NE se disperse PAS (`!armee.has`) et le brouillon de garnison non plus (`!drafts.has`) — sa mission est la défense. Le rallié de PRÉPARATION (`armeeProjetee`), les scouts et les explorateurs ramassent — c'est le cas u4 ;
- l'objectif hutte est émis `{kind:'explorer', cible: hutte}` : les cases de résolution existantes (pas ROUTIER BFS wrappé, repli glouton) s'appliquent telles quelles, l'anti-recul devient naturellement favorable (la hutte EST la cible → amélioration stricte) ; au tour suivant la hutte étant ouverte, l'exploration reprend.

**D2 — le pas vers une hutte n'est jamais un pas arrière** (`filtrerMarcheBot`, 5e paramètre optionnel `huttes`) : un Move/MultiStep dont le chemin ENTRE dans une case hutte est conservé même s'il repartirait une unité en marche Jev EN ARRIÈRE. Zéro autre exception : le ping-pong reste mort (test dédié « même pas arrière SANS hutte → filtré »). Appelants passent `state.huts` : `game.ts` (prod) + `sableuse/src/partie.mjs` (harnais — importe `botPolicy.ts` directement, pas de copie bit-à-bit nécessaire).

**D3 — intouchés, respectés** : villages barbares (pas des huttes — test dédié), le reste du classement d'exploration, la doctrine D-B de CONFIANCE-EXPLORATION, gainSite, le moteur (l'ouverture de hutte existe : bonus à la POSE), `schemaVersion` 28 (aucune migration — champ de profil additif).

## 3. Tests FIRST (`apps/server/tests/hutte-exploration.test.ts`, 12 verts — 5 rouges avant implémentation)

| Test | Avant | Après |
|---|---|---|
| CAS ZWV7T5 reconstitué (hutte adjacente, 2 phases : pas d'approche puis ENTRÉE) | 🔴 | ✅ |
| hutte connue à portée de détour → cible prioritaire | 🔴 | ✅ |
| hutte HORS détour (dist 10 > 3) → pas prioritaire | ✅ | ✅ |
| hutte NON explorée → ignorée (le bot ne triche pas) | ✅ | ✅ |
| hutte OUVERTE (retirée de state.huts) → quitte le classement | 🔴 | ✅ |
| hutte réservée à UN scout par tour | ✅ | ✅ |
| défaut data `hutteDetourMax = 3` | 🔴 | ✅ |
| D2 : sans exception, l'ordre vers la hutte serait filtré | ✅ | ✅ |
| D2 : AVEC exception, le pas qui entre est conservé | 🔴 | ✅ |
| D2 : zéro autre exception (même pas SANS hutte → filtré) | ✅ | ✅ |
| cul-de-sac SANS hutte → jamais un pas non-améliorant (anti-piétinement tient) | ✅ | ✅ |
| village barbare → PAS ciblé par le ramassage (D3, R-65) | ✅ | ✅ |

Re-cals : AUCUN — les suites bot-exploration / oscillation-marche / bot-marche passent sans retouche (le classement d'exploration hors hutte est inchangé).

## 4. Suites AVANT push (toutes vertes)

- rules **1129** / server **430** (41 fichiers, dont les 12 nouveaux) / sableuse **228** / jev-port **40** ;
- typechecks `tsc --noEmit` : server + rules verts ; `bot.json` additif.

## 5. Banc UNIQUE `bancs/joueur-hutte-exploration-2026-11-04` (vanilla, les 5 seeds corpus de la baseline confiance-exploration, plafond 600, garde-fou 0,60 $)

**0,5058 $ ≤ 0,60 $, 0 erreur API — 5/5 lancées** : 3 victoires Jev SCIENCE (t310/t346/t309, non-régression ✓) + partie 3 gagnée razedCapital t46 (anomalie barbares déjà consignée au rapport JEV-CROISSANCE) + partie 5 coupe-budget t202 avec Jev ÉCRASANT (score 1405 vs 310, 8 villes vs 1).

**LE MÈTRE NOUVEAU — huttes ouvertes par Jev** (événements `HutOpened` des journaux, attribution `byPlayer`) :

| Partie | Jev (baseline) | Jev (fix) | bot p2 (fix) |
|---|---|---|---|
| 1 | 0 | 1 | 5 |
| 2 | 5 | 3 | 6 |
| 3 | 1 | 1 | 1 |
| 4 | 1 | 2 | 5 |
| 5 | — (non jouée) | 6 | 1 |
| **Σ** | **7 / 4 parties** | **13 / 5 parties** | 18 |

**Critère atteint** : significativement > 0 (13 huttes, moyenne 2,60/partie vs 1,75 baseline — et la baseline comptait un 5 hors norme sur le seed ping-pong u4, les 3 autres à 0-1). Récompenses Jev consignées : 4 × science 20, 129 or (36+38+36+19), 3 indices d'artefact, 1 guerrier.

**Non-régression anti-piétinement** (métrique ping-pong STRICT A⇄B, retours à la case t-2, calculée À L'IDENTIQUE sur les deux bancs) : **8,9 % → 14,0 % ≤ 15 %** (critère tient). Résiduel = les patrouilles cycliques CONSIGNÉES NON CORRIGÉES au §1.3 d'OSCILLATION-MARCHE (baseline p4 comptait déjà 321, dont u235 × 146) : les sites du fix (p1 : (10,13)⇄(11,13) × 59, (22,9)⇄(21,9) × 58…) sont des positions ORDINAIRES — AUCUN site n'entoure une hutte (les huttes P1/P4 ouvertes sont à (-5,20), (15,12), etc.) ; les trajectoires divergent dès t0 (Jev détourne → tout le plan bot diffère), la comparaison par seed est indicative, la classe est la même. Le mouvement total BAISSE (7 403 → 6 161 allers).

**Budget** : 0,5058 $ (détail 0,1061/0,1872/0,0056/0,1436/0,0633).

## 6. Résiduel consigné (NON corrigé — hors tranche)

1. Le ping-pong patrouille-cyclique (conception, test-verrou — §1.3 OSCILLATION-MARCHE) : 14,0 % au banc, ≤ critère 15 % ;
2. Le bot p2 ouvre encore plus de huttes que Jev (18 vs 13) — sa doctrine d'exploration est plus agressive (case la plus lointaine SANS ancre capitale par unité) ; à l'œil Erik ;
3. La hutte à 6 cases de détour (D1 « à l'œil au banc ») : `hutteDetourMax` 3 est le défaut — un essai 5-6 est un levier data pur si Erik veut des détours plus longs ;
4. La razedCapital t46 comptée victoire p1 (anomalie barbares déjà cadrée au rapport JEV-CROISSANCE).

## 7. Fichiers touchés

- `apps/server/src/botPolicy.ts` — `hutteConnueProche` (D1) + branche d'assignation + `filtrerMarcheBot(huttes)` (D2) ;
- `apps/server/src/game.ts` — l'appel passe `game.huts` ;
- `sableuse/src/partie.mjs` — miroir harnais, passe `etat.huts` ;
- `packages/rules/src/data/bot.json` — `hutteDetourMax: 3` × 3 profils ;
- `packages/rules/src/types.ts` — `BotProfileData.hutteDetourMax` (additif) ;
- `apps/server/tests/hutte-exploration.test.ts` — 12 tests FIRST ;
- `devtmp/sonde-zwv7t5-u4.mjs` + `devtmp/etat-ZWV7T5/` — diagnostic L1 (non commités, devtmp).
