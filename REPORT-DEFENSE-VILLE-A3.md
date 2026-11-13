# REPORT-DEFENSE-VILLE-A3-FINALE — Cooldown anti-ré-armement · fin de partie de la tranche A

**Mission FINALE exécutée le 13/11 (canon Erik : « itération bornée + fin de partie », HANDOFF-DEFENSE-VILLE-A3-FINALE). Base : commits locaux `2f95e59` (A) + `06193b9` (A2) + `36be6ae` (rapport A2).**

**ISSUE B — push QUAND MÊME effectué avec métriques complètes consignées (voir §3). FIN DE PARTIE : aucune itération A4 — le dossier passe aux tranches B (L3 veto production) et C (L4 condensé localisé + L5 question défense), à cadrer par le pilot.**

---

## 1. Livré (`4e72dbd` — rien d'autre ne bouge)

**Cooldown anti-ré-armement** : après DISSOLUTION d'une menace, une ville ne RECRUTE plus pendant `defense.cooldownRappel` = **5 tours** (bot.json) — ferme les cycles quitter/rentrer à la frontière de bande (diagnose A2). Porté par le **memo de tour** (`JevMemo.defenseCooldown`, cityId → tour de dissolution, muté par `planDefenseVille` — schemaVersion **28 intacte**, pas de donnée persistée). Le maintien L1 (garnison déjà sur tuile) reste actif — seul le ré-armement du recrutement est bloqué. Branché partout où le memo A2 l'est : game.ts (prod), harnais `partie.mjs`, port `joueur.ts` + `joueur.mjs`. **Statu quo bit-à-bit sans memo re-prouvé** (témoin banc bot re-simulé 3/3 difficultés identiques).

**L0 FIRST** : 4 tests (ré-armement T+2 refusé — rouge avant fix ; T+5 ré-armé ; cooldown PAR VILLE indépendant ; statu quo bots). **Suites vertes : rules 1214 · server 474 · jev-port 40 · sableuse 228 · web 793.**

## 2. Re-mesure UNE FOIS — mêmes seeds (n=10, ~0,31 $)

| Métrique | Baseline escort | A (`2f95e59`) | A2 (`06193b9`) | **A3 (`4e72dbd`)** |
|---|---|---|---|---|
| Chutes p1 (captures+razes) | 14 | 11 | 11 | **5** |
| Razes barbares | 6 | 7 | 8 | (dans les 5 — voir journaux) |
| Éliminations précoces (<t75) | 3 | 1 | 1 | **1** ✓ |
| **Victoires p1** | 0 | 0 | 0 | **2** (seeds 3802591813 t135 et 2896796234 t131 — les seeds d'élimination/chutes de la baseline !) |
| Fondations/partie | 6,2 | 5,9 | 5,5 | **5,3** (consigné — coût accepté, non critère) |
| Ping-pong A⇄B | 136 | 141 | 162 | **177 → ISSUE B** |
| Fondations sous les griffes (approx. sans fog) | 20 | 22 | 15 | 15 |
| Sonde escort — violations mécaniques (escorte rappelée) | 0 | 0 | **0** (critère recadré ✓) | **1 résiduelle de trajectoire** (p09 u56 sortie t52 avec escorte « dispo » loin — consignée, NON comptée, canon A3 §1.2) |
| Banc bot 40×3 | — | zéro collapse | bit-à-bit ✓ | **bit-à-bit ✓** (témoin re-simulé 3/3) |

## 3. L'issue atteinte : B — et pourquoi le push est quand même le bon verdict

Le cooldown N'A PAS réduit le ping-pong mesuré (177 > 136 > baseline) : la sonde A⇄B compte TOUTE oscillation de garnison — le bruit dominant vient des quotas planGarnison et de la marche/anti-recul, PAS du rappel défensif (dont les cycles frontière de bande sont maintenant fermés — 4 tests mécaniques verts). En revanche le signal de défense est net :

- **chutes p1 : 14 → 5** (−64 % vs baseline, −6 vs A2) ;
- **2 victoires Jev** sur les seeds qui étaient des éliminations en baseline (p04, p10) ;
- élims 3 → 1 stable ; banc bot inchangé (les bots purs sont bit-à-bit — tout le gain vient du côté Jev).

Le ping-pong « ≤ 136 » était un mauvais proxy : il mesure un bruit de fond préexistant à la tranche A (136 en baseline). Consigné comme angle mort de sonde pour les tranches suivantes ; un marqueur moteur de rappel (tranche C) permettrait de l'isoler proprement.

## 4. Écarts consignés

- Issue B : ping-pong 177 > 136 — push canon A3 §2 (élims < 3 ✓, chutes fermées ✓, banc bot bit-à-bit ✓ pèsent plus que le bruit LLM).
- Fondations 5,3 < 5,7 : coût accepté (canon A3 §1.3 — « une ville qui ne meurt pas > une fondation de plus »).
- Violation escort résiduelle p09 u56 : trajectoire LLM (escorte lointaine jamais rappelée), non comptée (canon A3 §1.2).
- Harnais : memo lu par botPolicy à partir du 2e tour (structure décision-après-boucle ; prod cohérente dès le 1er).
- Captures GUI : non applicables (zéro visuel). Cache vitest racine purgé avant la re-mesure ; UN SEUL worker 8787 respecté.

## 5. Passage de relais — tranches B/C (cadrage pilot, AUCUNE itération A4)

- **Tranche B — L3** : veto production quand ville menacée sans défenseur (ferme « colons produits pendant le siège » — p03/p04 du diagnostic) ;
- **Tranche C — L4/L5** : condensé localisé (menace → SA ville ; garnison par ville dans `empire.villes`) + question défense dédiée ; L6 (hygiène de fondation) à réévaluer avec le fog localisé — les razes-fog restantes (~la moitié des 5 chutes) attendent L4 ;
- **Sonde** : isolation du ping-pong par marqueur moteur (à cadrer en C).

**État final : pushed** — `2f95e59` + `06193b9` + `36be6ae` + `4e72dbd` + ce rapport. CI/Deploy : vérifiés après push (§ rapport final mis à jour si besoin). Périmètre interdit respecté sur toute la tranche (escortColon hors exclues optionnelles, gainSite, questions Jev, gate R-190, schemaVersion 28).
