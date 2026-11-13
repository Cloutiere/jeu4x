# REPORT-DEFENSE-VILLE-C — Donner les yeux à Jev : condensé localisé + question défense (+ sonde ping-pong isolée)

**Mission exécutée le 13/11 (canon Erik : ordre C avant B — les chutes résiduelles sont dominées par le fog). Base : tranche A close `4e72dbd`, commit C `b96e401`.**

**VERDICT : TOUS LES CRITÈRES D'ACCEPTATION SONT ATTEINTS — pushé, Deploy SUCCESS, prod 200 (voir §5).**

---

## 1. Livré (`b96e401` — périmètre interdit respecté, zéro retouche mécanique tranche A)

- **L4 — Condensé localisé** (miroir EXACT port `condense.ts` / harnais `condense.mjs` — tests croisés bit-à-bit verts) :
  - chaque `menace` porte **`villeId`** (SA ville cible — `menacesVille` BFS portée de MARCHE réelle, tranche A ; repli : ville la plus proche à vol d'oiseau pour les menaces inatteignables, ex. derrière l'eau) + **`distanceVille`** à CETTE ville (champs historiques inchangés — bit-à-bit sur l'existant) ;
  - chaque `empire.villes[]` porte **`def {nbDef, force, deficit}`** : combattants d=0 (canAttack, hors embarquée/navale — **le colon n'est jamais un défenseur**, leçon p08), force totale, déficit au seuil data `seuilGarnison`.
- **L5 — Question défense dédiée** : `questions-joueur.json` (copies serveur/harnais IDENTIQUES, test de copie vert) + `confianceParQuestion.defense: 0,25`. Posée quand une ville est menacée à ≤ `defense.seuilQuestionDef` = **2 tours** de MARCHE (BFS) — jamais posée sans menace (test). Énumération fermée **rappeler / produireGuerrier / tenir / abandonner**, ville présentée = la PLUS MENACÉE (nb de menaces desc, déficit desc, tie id). Traduction PURE exportée `traduireDefense` (port + miroir mjs) : hors énumération / sous confiance → **repli mécanique zéro ordre** ; `rappeler` = Move EXISTANTS de ≤ 3 combattantes disponibles HORS plan défensif (se compose avec la garnison d=0 L1 — jamais en contradiction) ; `produireGuerrier` = SetProduction guerrier DANS la ville (si productible) ; `tenir`/`abandonner` = zéro ordre, audités.
- **Sonde ping-pong isolée** : marqueur `defense_plan {genre:'rappel', unites, villes}` au journal harnais ; la sonde (`devtmp/arbitre-defense-ville.mjs`) compte les oscillations A⇄B des unités sous fenêtre de rappel (tour du mouvement ou du segment précédent) SÉPARÉMENT du bruit.
- **L0 FIRST** : 12 tests (rouges avant fix — condensé localisé, def/garnison/leçon p08, question posée/absente, hors énumération, composition avec L1, 30 seeds). **Suites vertes : rules 1214 · server 474 · jev-port 52 (croisés bit-à-bit inclus) · sableuse 228 · web 793. `schemaVersion` 28 intacte.**

## 2. Banc C — mêmes seeds (n=10, `joueur-defense-c`, ~0,31 $ — budget ≤ 0,60 $ respecté)

| Critère | A3 (`4e72dbd`) | **C (`b96e401`)** | Verdict |
|---|---|---|---|
| **Chutes p1 totales ≤ 5** | 5 | **2** | **✓** |
| **Razes-fog réduites** (moitié des 5 fermées) | 5 chutes | **4/5 fermées** : p08 c3 (raze A3) fermée ; p02 fermée ; p07 fermée ; restent p05 c1 (capturée t28, élim précoce bot p2) + p10 c5 (raze barbare) | **✓** largement |
| Élims ≤ 1 | 1 | **1** (p05, bot p2) | ✓ |
| **Fondations ≥ 5,0** | 5,3 | **5,0** | ✓ (à la limite, canon : coût accepté) |
| Zéro suicide D3UUQJ (critère recadré A3 : 0 violation MÉCANIQUE) | 0 mécanique | **1 résiduelle de trajectoire** (p09 u82 sortie t59, capture t77 — escortes « dispo » lointaines jamais rappelées ; non comptée, canon A3 §1.2) | ✓ |
| **Ping-pong imputable au rappel : isolé** | non mesurable | **0 sur 119** (total A⇄B 119 < baseline 136 — tout le ping-pong vient du bruit quotas/marche, le RAPPEL ne ping-pongue PAS) | ✓ information |
| Banc bot | bit-à-bit ✓ | non requis (aucun chemin bot modifié — memo et condensé sont côté Jev) | ✓ |
| **Croissance d'input** (tarif input-only) | 5304 jetons/décision | **5363 (+59, +1,1 %)** · ~0,0002 $/décision · 0,0303 $/partie (vs 0,0301) | **chiffré ✓** |
| Victoires p1 | 2 | **2** (p04 en 108 tours — encore plus tôt) | bonus |

**Audit de la question** : 373 questions défense posées sur 1344 décisions (27,7 % des tours) — réponses Jev : **rappeler 270 · tenir 96 · produireGuerrier 7** (auditées au journal comme `tactique`).

## 3. Ce que la localisation a changé (qualitatif)

Le diagnostic montrait `menaces` sans ville et `def` null : Jev ne pouvait PAS choisir la ville à défendre. C est prouvé au journal : la question défense est posée 27,7 % des tours avec la ville cible, sa garnison et son déficit — et Jev répond `rappeler` dans 72 % des cas (elle suivait déjà le plan bot ; maintenant elle le VOIT et l'ENDOSSE ou le complète). Les 4/5 chutes fermées (vs A3) incluent des villes fondées/jeunes sous menace visible — le cas p08 c3 (raze A3, fondée t79 sous griffes vues) est fermé.

## 4. Écarts consignés

- Fondations 5,0 pile au plancher (−0,3 vs A3) : la question `rappeler` mobilise 3 combattantes — tension légère avec l'expansion, dans le coût accepté (canon A3 §1.3). Tranche B (L3 veto production) arbitrera la production, pas les fondations.
- La violation escort p09 u82 est de trajectoire (escorte lointaine jamais rappelée — hors portée L4/L5 ; consignée).
- Marqueur `defense_plan` journalisé au HARNAIS uniquement (les bancs) — la trace prod admin n'a pas ce canal sans retouche des événements moteur (L7 backlog). La sonde isolation ne fonctionne donc que sur journaux de banc.
- Fix mineur de robustesse : `menacesVille` appelée au condensé avec `diplomacy ?? { war: [] }` (fixtures partielles du harnais — zéro effet sur les états réels).
- Piège appliqué : cache vitest racine purgé avant la re-mesure ; UN SEUL worker 8787 ; ids recyclés gérés par cycles de vie dans la sonde.

## 5. Push + déploiement (mis à jour après push)

Pushed : `b96e401` (C) + ce rapport. **CI/Deploy : vérifiés** (run SUCCESS sur le push) — **prod 200** (`https://game-4x-server-prod.erik-ai-studio.workers.dev/`). Symboles vérifiés (`git show` + grep : `villeId`, `traduireDefense`, `defense_plan`, `seuilQuestionDef`).

**Passage de relais : tranche B (L3 — veto production quand ville menacée sans défenseur)**, à cadrer par le pilot. La localisation L4/L5 est en place : le veto tournera à vue.
