# HANDOFF-ESCORTE-SONDE — Sonde raffinée sur journaux archivés (suite de JEV-ESCORTE)

**Mission de SUIVI pour l'agent qui a livré JEV-ESCORTE (ton commit local `651c9a5`, non poussé — c'est la base). Canon Erik validé le 12/11 : « (a)+(c) accepter + sonde raffinée ».**

## 1. Préalables

- Verdict Erik sur ton arrêt : les 5 pertes comptées par la sonde brute sont **0 violation du canon** (3 = colons tenus en ville capturés AVEC la ville — le canon est respecté, le verrou est la défense-de-ville, HORS périmètre ; 2 = ennemis hors vision — indévaluable par construction). La livraison EST acceptée ; la sonde doit compter des **violations de règle**, pas des pertes.
- Baseline : ton commit local `651c9a5` (rules 1200, server 453, suites vertes, bancs archivés), rien poussé.

## 2. La mission (petite, zéro coût LLM)

- **Raffiner la sonde** (script de sonde des journaux sableuse, pas le moteur) pour compter uniquement les **violations du canon escort** :
  1. **exclure les captures en ville** (colon jamais sorti — le canon le veut en ville ; sa mort est un échec de DÉFENSE, pas d'escorte) ;
  2. **dédupliquer les ids d'unités recyclés** dans les journaux (piège documenté : les ids réapparaissent entre parties/événements — le compte doit suivre le cycle de vie réel d'UN colon : production → sorties de ville → mort/capture, pas un simple compteur d'événements) ;
  3. ne compter comme violation qu'un colon **sur route**, tué par un ennemi **connu** au moment de la décision (l'hors-vision est la limite fog documentée — consigné, pas compté).
- **Re-jouer la sonde raffinée sur les journaux ARCHIVÉS du banc joueur-escorte** (`sableuse/bancs/joueur-escorte/`) — AUCUN re-banc LLM, aucune partie nouvelle, coût 0 $.
- **Résultat attendu** : compte raffiné = **0 violation**. Si > 0 : **arrêt-pour-approbation** avec le cas détaillé (partie, tour, colon, ennemi, décision de risque) — PAS d'itération code.
- **Conserver la sonde brute à côté** (les deux comptes au rapport : brut = pertes, raffiné = violations) pour la comparaison baseline.

## 3. Fin de session

Une fois le compte raffiné obtenu : **pousser `651c9a5` + la sonde raffinée + le rapport complété** (`REPORT-JEV-ESCORTE.md` §4 amendé avec le compte raffiné), vérifier **Deploy SUCCESS + prod 200** (API GitHub — `gh` absent de la machine). Rapport final, arrêt, remise de la main.

**Pièges** : suites complètes avant push (rules 1200 / server 453) ; chaque commit porte ses symboles (`git show` + grep, leçon `704ec5b`) ; cache vitest racine ; UN SEUL worker 8787 ; ne jamais committer les secrets.
