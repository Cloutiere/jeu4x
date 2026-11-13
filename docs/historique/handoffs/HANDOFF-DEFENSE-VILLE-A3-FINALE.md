# HANDOFF-DEFENSE-VILLE-A3-FINALE — Cooldown anti-ré-armement, puis push DANS LES DEUX ISSUES (fin de partie de la tranche A)

**Mission FINALE de la tranche A — pour l'agent de DEFENSE-VILLE-A/A2 (tes commits locaux `2f95e59` + `06193b9` + `36be6ae`, non poussés — c'est la base). Arbitrage Erik 13/11 : « itération bornée + fin de partie ». Il n'y aura PAS de A4 : cette mission se termine par un push, quelle que soit l'issue.**

## 1. Le canon validé (une mission, deux issues)

1. **Cooldown anti-ré-armement** : après dissolution d'une menace, le rappel défensif d'une même ville ne peut PAS se ré-armer pendant **5 tours** (tunable `bot.json defense`, ex. `cooldownRappel` 5) — ferme les cycles quitter/rentrer à la frontière de bande (ta propre diagnose). Le marqueur `JevMemo.defenseRappels` porte le cooldown ; statu quo bit-à-bit sans memo (bots) maintenu et re-prouvé.
2. **Critère escort recadré (option (c), canon Erik)** : le critère de push est « **0 violation MÉCANIQUE** (escorte rappelée) » — **déjà atteint** ✓. Les violations résiduelles « escorte lointaine jamais rappelée » sont de la trajectoire LLM, n=10 : **consignées, non comptées**.
3. **Fondations 5,5** : coût accepté de la garnison/rappel (dans le bruit n=10 ; une ville qui ne meurt pas > une fondation de plus — arbitrage Erik implicite du cadrage A). Consigné, non critère.

## 2. Mission L0→L3

- **L0 — Tests FIRST** : cooldown — rappel ré-armé AVANT l'expiration → refusé (rouge avant fix) ; après expiration → ré-armé ; chaque ville a SON cooldown (2 villes indépendantes) ; statu quo sans memo re-prouvé ; suites L1/L2 non-régressives.
- **L1 — Code** : cooldown dans `defenseVille.ts`/memo + champ `bot.json` ; RIEN d'autre (pas de retouche escort, pas de seuil).
- **L2 — UNE re-mesure** (mêmes seeds, ~0,3 $) + sonde. **Les deux issues mènent au push** :
  - **Issue A** : ping-pong ≤ 136 → push net, critères verts ;
  - **Issue B** : ping-pong > 136 → push QUAND MÊME avec les métriques complètes consignées au rapport (élims < 3 ✓, chutes fermées ✓, banc bot bit-à-bit ✓ pèsent plus que le bruit LLM), et le dossier passe aux **tranches B/C** — consigne explicite au rapport : « fin de partie, aucune itération A4 ».
- **L3 — Push + déploiement** : suites complètes, captures locales, push des 3 commits locaux + ce suivi, vérifier Deploy SUCCESS + prod 200.

## 3. Fin de session

Rapport `REPORT-DEFENSE-VILLE-A3.md` à la racine : le tableau final AVANT/A2/A3, l'issue atteinte, écarts consignés, et le passage de relais aux tranches B (L3 veto production) et C (L4 condensé localisé + L5 question défense) — cadrées par le pilot ensuite. Puis arrêt, remise de la main.

**Pièges** : cache vitest RACINE ; banc tsx ; UN SEUL worker 8787 ; ids recyclés ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
