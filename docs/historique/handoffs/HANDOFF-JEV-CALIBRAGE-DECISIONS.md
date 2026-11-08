# HANDOFF-JEV-CALIBRAGE-DECISIONS — Jev v2 : la guerre argumentée, la conversion, la paix au juste prix

**Décisions Erik 28/10** (« go » — suite directe du banc joueur). Trois leviers du rapport (config + reformulation de questions, zéro moteur), puis re-banc de comparaison v1/v2. Budget plafond **0,50 $** pour cette mission (estimation agent ~0,2 $ ; le garde-fou global de campagne reste 10 $).

## 1. Préalables

- Lire `REPORT-JEV-BANC-JOUEUR.md` (verdicts, les 3 leviers, pièges : fuite de déclaration corrigée, portes PAR DOMAINE) et le harnais (`sableuse/src/joueur.mjs`, `questions-joueur.json`, `banc-joueur.mjs`, journaux `sableuse/bancs/joueur-2026-10-27/`).
- Baseline : suites sableuse 51 verts, `schemaVersion` 28. Vérifier `git status`. Clés en env uniquement (jamais le git).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **L1 — La conversion** (gros gain) : réactiver la règle `regle:conversion` du harnais comme PLAchercher de repli (si la réponse de Jev est indécise, la règle s'applique — miroir du repli bot) ET reformuler la question « convertir » en critères plats (villes non pleine, science < seuil par tour) — la partie 8 a prouvé le potentiel (16 techs).
- **L2 — La guerre argumentée** : remplacer la question « voulez-vous la guerre ? » par un choix à critères pré-triés : cible = voisin le plus faible, rapport de forces présenté EXPLICITEMENT dans le condensé (miroir de la question « attaquer » du banc v2 qui passait à 0,85) ; la décision est « oui/non sur cette cible » plutôt qu'un score de confiance.
- **L3 — La paix au juste prix** : la question compensation expose une FOURCHETTE suggérée (miroir du prix indicatif T2, plafonné trésorerie) au lieu du score à paliers jamais levé ; Jev choisit dans la fourchette.
- **D2 — Rien d'autre** : moteur/serveur/web intouchés, le bot standard inchangé, mêmes seeds du corpus, mêmes civs P7, température reproductible, journal complet identique en forme.

## 3. Mission

- **L1 — tests-first harnais** : nouveaux formats de questions/réponses, repli règle conversion, guerre-à-critères (fixture : forces 3× → oui ; forces 0,5× → non), fourchette de compensation, déterminisme, fausse LLM (zéro appel réel dans les tests).
- **L2 — re-banc** : les 10 mêmes seeds Jev v2 vs bot standard, plafond 0,50 $, artefacts `sableuse/bancs/joueur-v2-<date>/`.
- **L3 — comparaison v1/v2** (même corpus, MÊMES métriques) : score/victoires, guerres DÉCLARÉES par Jev (v1 : 0), conversions (v1 : 1/1 368), paix avec or (v1 : 0/220), coût/partie ; anecdotes ; verdict « Jev gagne-t-il des parties et fait-il des guerres maintenant ? ».
- **L4** : rapport `REPORT-JEV-CALIBRAGE-DECISIONS.md` (tableau v1/v2, verdict, recommandation branchement lobby ou itération 3), commit du harnais (jamais de clés), arrêt, remise de la main.

## 4. Critères d'acceptation

1. Jev v2 déclare des guerres (v1 : 0) et convertit (v1 : 1) — mesurable au banc ;
2. Comparaison v1/v2 propre sur le même corpus, coûts documentés ;
3. Zéro impact prod, zéro secret, suites sableuse vertes.

## 5. Périmètre interdit

Moteur/serveur/web, le bot standard, le lobby (branchement = décision d'Erik après verdict), T2, `schemaVersion`.

## 6. Fin de session

Rapport + verdict, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik ni des secrets.
