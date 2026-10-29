# HANDOFF-BOT-ARMEE — La guerre vraie : armées offensives, mur défensif, agressivité lisible

**Décisions Erik 26/10** (validées). La grande tranche : le bot raisonne en ARMÉE, le mur défensif tombe par les données (arbitré par le banc), l'agressivité des civs devient réelle. **Deux livrables séquentiels, chacun committé et déployé** (validation locale + banc AVANT commit ; Erik juge le ressenti en prod et le data-driven permet l'itération).

## 1. Préalables

- Lire `REPORT-BOT-TC-OBSERVATION.md` (P1-P6) et `REPORT-BOT-P7-CIVS.md` (agressivité noyée par l'éligibilité ; intensité vs fréquence), `botPolicy.ts` (T-A/T-B/T-C), §7.4 et les données de combat (bonus de ville, fortification T-17, valeurs d'attaque/défense), `bot.json`/`civilizations.json`, le banc d'observation (corpus 40×3, civs réelles P7 — artefacts `devtmp/banc-bot-p7-civs.json`).
- Baseline : suites vertes à jour, `schemaVersion` 28. Vérifier `git status` (sessions parallèles possibles).

## 2. Livrable A — L'armée et la campagne (bot)

- **D1 — Masse critique** : l'objectif « offensiver » assemble une ARMÉE (taille data-driven, ex. 3-4 unités, par difficulté) près de la cible AVANT d'attaquer — les unités désignées campent (Fortify/Vigilance) au point de ralliement jusqu'à effectif.
- **D2 — Cible de campagne** : la ville ennemie (en guerre) LA PLUS PROCHE, pas la capitale d'office ; la campagne PERSISTE (l'armée ne se disperse pas au tour suivant) jusqu'à capture, anéantissement ou rappel (menace capitale — BOT-EXPLORATION D3).
- **D3 — Rien d'autre ne bouge** : garnisons/patrouilles/économie T-A/T-B inchangées hors le détachement de l'armée.
- **Validation A** : tests d'assignation (rassemblement → offensive → persistance), banc — l'armée existe et attaque dans les captures god mode.

## 3. Livrable B — Le mur défensif par les données + agressivité lisible

- **D4 — Équilibrage 100 % data-driven** : l'agent PROPOSE et APPLIQUE un rééquilibrage (bonus défensif de ville, fortification, valeurs attaque/défense — toutes données) pour atteindre les cibles chiffrées du banc ci-dessous. Pas de code de règle nouvelle — des valeurs.
- **D5 — Cibles du banc (arbitre)** : ≥ **40 %** des guerres avec de vraies batailles de percée ; ≥ **10 %** avec au moins une capture de ville ; **0 écrasement** avant t30 ; parties moyennes restant > 100 tours (un jeu où tout meurt t40 est un échec) ; la défense du JOUEUR doit rester viable (l'agent le vérifie par scénarios scriptés : une capitale garnisonnée tient encore une attaque mineure).
- **D6 — Agressivité lisible** : le `seuilRatioGuerre` est modulé par l'`agressivite` de la civ (les agressives attaquent des voisins égaux — seuil abaissé ; les pacifiques exigent l'écrasement — seuil relevé) ; modulation data-driven, ρ visé ≥ 0,4 au banc (déclarations et batailles).
- **D7 — Paix inchangée** (P5/P6 au banc suivant), fog du bot inchangé, `schemaVersion` 28.

## 4. Mission (les deux livrables)

- **L1 — test-first** par livrable (assignation d'armée ; modulation d'agressivité ; propriétés du banc).
- **L2-A** : armée/campagne (bot seul) → validation locale (captures god mode `dev-logs/captures-bot-armee/` : rassemblement visible, offensive vers la ville proche) → **commit + push (CI déploie)**.
- **L2-B** : valeurs D4/D6 → banc (D5/D6 chiffrés, tableau avant/après) → captures → **commit + push**.
- **L3** : rapport `REPORT-BOT-ARMEE.md` (valeurs modifiées actuel→nouveau, tableaux du banc, 🔶, liste « à juger en jouant par Erik » — c'est LUI l'arbitre final du ressenti ; itération par edit de données au handoff suivant si veto).

## 5. Critères d'acceptation

1. En god mode : des armées se forment et conquièrent (captures observables) ;
2. Les cibles du banc D5/D6 atteintes (tableau au rapport) ;
3. La défense du joueur reste jouable (scénarios + ton œil) ;
4. Déterminisme, suites vertes, `schemaVersion` 28.

## 6. Périmètre interdit

Paix du gagnant (P5/P6 — banc suivant), T2/T3, Jev, toute règle de combat NOUVELLE (des valeurs, pas de mécanique), le fog du bot.

## 7. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
