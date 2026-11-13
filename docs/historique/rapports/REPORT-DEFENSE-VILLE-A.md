# REPORT-DEFENSE-VILLE-A — Tranche A (L1 garnison d=0, L2 rappel hystérésis, L6 hygiène de fondation)

**Mission exécutée le 12/11 — HANDOFF-DEFENSE-VILLE-A (canon Erik, cadrage fe0b990). Baseline 2094d10** (rules 1200 / server 464+jev 40 / web 793 / sableuse 228, schemaVersion **28 intacte**).

**⚠ ARRÊT-POUR-APPROBATION** — 2 critères d'arbitrage ne passent pas (razes ≠ 0 ; ping-pong ≠ 0) et un indicateur de garde a glissé (violations escort 0→2). Chiffres complets ci-dessous, **commit LOCAL, rien poussé** (précédent JEV-ESCORTE 651c8a5). Pas d'itération solo sur les seuils — remise de la main.

---

## 1. Livré (implémentation)

- **L1/L2 moteur partagé** — `packages/rules/src/defenseVille.ts` (pur, data-driven) : `defenseDuBot`, `garnisonDeficit` (combattant = canAttack, hors embarquée/navale — **le colon n'est jamais un défenseur**, leçon p08), `menacesVille` (portée de MARCHE réelle au BFS — `porteeMarche` de `escortColon` EXPORTÉE, règles escort inchangées), `fondationProcheBarbare`, `menaceDansBande`.
- **Table `bot.json defense`** : `menaceDist 3`, `hysteresisMarge 2`, `fondationBarbareDist 3`, `seuilGarnison 1`. Hystérésis SANS ÉTAT (schemaVersion intacte) : bande de dissolution `menaceDist + hysteresisMarge` — le rappel ne se lève que menace DISSOUTE (consigné : sans état persisté, la bande fait aussi office de rayon de DÉCLENCHEMENT élargi — voir §4 écarts).
- **botPolicy** : `planDefenseVille(state, me, profile)` → `{rappels, maintiens}`. Priorités canon **garnison > rappel > escort > exploration** insérées après ② attaquer, avant repli/hutte/patrouille/drafts/chasse/exploration. **Maintien anti ping-pong** : la combattante déjà SUR la tuile d'une ville menacée est tenue en garnison (objectif `garnison` — c'est ELLE que le rappel amène ; au-delà du seuil, le surplus reste libre, canon planGarnison). **Exclusions canon** : le scout (jamais un défenseur — non-régression exploration), l'armée de campagne ENTIÈRE (la poussée de campagne garde — le rappel de la capitale assaillie reste TB-SIEGE B2 via planGarnison), embarquées/navales.
- **Veto au-dessus de Jev** (zéro nouvelle question LLM) : `filtrerOrdresJevDefense` retire les Move/MultiStep/Attack des unités défensives de la décision Jev (Fortify/Heal/Hold/Sleep passent) — branché dans **game.ts** (prod, miroir discipline fondation) et **sableuse/partie.mjs** (harnais).
- **L6 hygiène de fondation** : sites à d ≤ 3 d'un barbare visible ÉCARTÉS de `sitesCorrects`/`candidatsFondation` (port `jev/joueur.ts` + miroir harnais `joueur.mjs`) ; un site programmé (`memo.fondationEnCours`) tombé sous les griffes lève le memo. **gainSite inchangé** (périmètre interdit respecté) ; l'arbitrage de production bot (`arbitrerProduction`) laissé bit-à-bit (l'essai d'un veto L6 local cassait le PIVOT escort — périmètre interdit — revenu en arrière, suite escort-colon-policy verte).
- **L0 FIRST** : `packages/rules/tests/defense-ville.test.ts` (11) + `apps/server/tests/defense-ville-policy.test.ts` (10) — rouges avant fix, verts après (rappel déclenché, hystérésis d 2→4 persiste, dissoute → patrouille reprend, maintien, colon exclu, priorité aux plus menacées, 30 seeds déterministes, filtre Jev).

## 2. Suites complètes (vertes)

| Suite | Résultat |
|---|---|
| packages/rules | **1211 verts** (76 fichiers) |
| apps/server | **464 verts** (45 fichiers ; 1 e2e flaky préexistant, vert au re-run) |
| jev-port (`vitest.jev.config.ts`) | **40 verts** |
| sableuse | **228 verts** |
| web | **793 verts** (aucun changement UI) |

## 3. L'arbitre chiffré — mêmes seeds du banc joueur-escorte (n=10, ~0,31 $)

Banc : `sableuse/bancs/joueur-defense-2026-11-12/` (plan bit-à-bit = celui de joueur-escorte ; journaux archivés). Sonde : `devtmp/arbitre-defense-ville.mjs` (chutes = CityCaptured **ET** CityRazed — piège diag #1 ; ping-pong = aller-retour A⇄B d'une unité p1 avec un bout du cycle à d ≤ 1 d'une ville p1 ; sous-les-griffes approxime SANS rejeu du fog — consigné).

| Critère (handoff) | AVANT (escorte) | APRÈS (defense) | Verdict |
|---|---|---|---|
| **Razes barbares 6 → 0** | 6 | **7** | **✗** |
| Chutes p1 totales (captures+razes) | 14 | 11 | tendance ✓, critère strict non posé sur ce total |
| Éliminations précoces < 3 | 3 | **1** | **✓** |
| Fondations ≥ 5,7/partie | 6,2 | **5,9** | **✓** |
| **Zéro ping-pong de rappel** | 136 oscillations | **141** | **✗** (bruit de fond non isolable du rappel — sonde honnête) |
| Zéro suicide D3UUQJ (sonde escort raffinée) | 0 | **2** (p02 u83 t60, p08 u108 t97 — colons capturés sur route) | **✗** |
| Banc bot 40×3 : zéro collapse | villes 1,9 / 1,9 / 1,9 | villes 2,0 / 1,9 / 1,9 ; unités 92/97/101 vs 88/102/94 | **✓** (pas de collapse ; tours moyens 121-141, guerres vivantes) |
| schemaVersion | 28 | 28 | ✓ |

Détail APRÈS par seed (vs AVANT escort) : p03 **2 chutes+élim → 0 chute** ✓ · p09 **1 raze → 0** ✓ · p05 élim t50 → élim **t28** ⚠ (capital Jev prise précoce par p2) · p04 2 chutes → 3 · p08 2 razes → 3 (dont c6 fondée t79, razée t80) · p10 3 razes → 1.

Le rappel DÉCLENCHE et CONVERGE (preuve p08 t77 : u47/u49/u54/u61 ordonnés vers la ville menacée ; p03/p09 fermées). La mécanique vit — ce sont les SEUILS/angles morts qui manquent (§4).

## 4. Diagnostic des échecs (chiffres, pas d'itération)

1. **Razes t+1 après fondation (p08 c6, p02 c3)** : le razeur était à d=1-2 du site MAIS **invisible à la décision** (ennemiVisibles flicker fog t77/78/79). L6 juge sur `etatFiltre` — le même angle mort fog que escort D5 (`siteBrume`). L4 (condensé localisé, tranche C) est le prérequis canon attendu.
2. **Déficit sans réserves** : rappel parti quand il y avait UNE combattante disponible ; villes jeunes sans AUCUNE combattante dans la bande restent nues (L3 veto production — tranche B — non livrée).
3. **Duels perdus** : le rappelé arrive, perd le duel (canon attaque = mort de l'un des deux), le suivant entre — même érosion que le diagnostic, juste retardée.
4. **Violations escort 0→2** : vraisemblablement des escortes rappelées en garnison (priorité canon garnison > escort) laissant le colon sur route — à trancher : exception escort au rappel, ou accepter le glissement (le colon est défendu par LA garnison).
5. **Ping-pong** : la sonde mesure toute oscillation de garnison (bruit de fond préexistant 136) ; le rappel avec bande n'a PAS créé de divergence nette (141) mais le critère « zéro » n'est pas démontrable avec les journaux actuels — il faudrait un marqueur de rappel côté moteur (tranche C) pour isoler.

## 5. Table `bot.json defense` effective

```json
"defense": { "menaceDist": 3, "hysteresisMarge": 2, "fondationBarbareDist": 3, "seuilGarnison": 1 }
```

## 6. Écarts consignés

- Hystérésis **sans état** (schemaVersion intacte) : la bande de dissolution sert aussi de rayon de déclenchement élargi (menace à d=4-5 tours déclenche le rappel dès le premier tour de présence, alors que le canon dit « déclenchement à d ≤ 3 »). Un vrai trigger/release exige de l'état (unités ou memo — tranche C ou bascule schema).
- L6 n'est PAS branché dans l'arbitrage de production botPolicy (conflit avec le pivot escort — périmètre interdit) : le bot seul peut donc encore produire un colon pour un site sous griffes ; le JOUEUR Jev est couvert (gate sites + memo).
- Sonde « sous les griffes » ne rejoue pas le fog (approximation comparative) : AVANT 20 → APRÈS 22.
- Captures GUI : non applicables (zéro changement visuel) — les suites e2e serveur/web font office ; ⚠ **CI/Deploy NON LANCÉS** (commit local — leçon 704ec5b : chaque commit porte ses symboles, vérifiés par `git show` avant remise).

## 7. Options à Erik (arrêt-pour-approbation)

- **(a) Pousser la tranche A telle quelle** (progrès nets : élims 3→1, p03/p09 fermées, banc bot sain) et cadrer la tranche B/C sur les angles morts §4 ;
- **(b) Retirer L6 du port Jev** (il a coûté 2 violations escort sans fermer les razes-fog) et repousser la hygiène de fondation à la tranche C (avec L4 condensé localisé) ;
- **(c) Revenir au cadrage** : poser le trigger d'état (marqueur de rappel) AVANT de re-mesurer le ping-pong.

**Commit local (non poussé). Périmètre interdit respecté** : gate R-190, escortColon (règles inchangées — `porteeMarche` exportée seulement), gainSite, questions Jev, gardien Fortify, `combatStrengthsOf`, ORACLE-VERDICT, Zii, schemaVersion 28.
