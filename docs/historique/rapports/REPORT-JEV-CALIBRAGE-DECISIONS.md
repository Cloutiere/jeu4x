# REPORT-JEV-CALIBRAGE-DECISIONS — Jev v2 : la guerre argumentée, la conversion, la paix au juste prix

**Décisions Erik 28/10** (« go »), exécuté le 27-28/10. Trois leviers de reformulation (config + harnais sableuse, zéro moteur), puis re-banc de comparaison v1/v2 sur le même corpus (10 seeds, civs P7 du seed, 150 tours, difficulté normal).

## 1. Les trois leviers implémentés

- **L1 — La conversion** : la question `convertir` est reformulée en critères plats (une ville n'est candidate SCIENCE que si sa science/tour est sous le seuil `conversionScienceMin` 2 — le goulot de l'empire est nommé dans le critère) ET la règle `regle:conversion` du harnais devient le PLANCHER de repli : une réponse conversion INDÉCISE (sous le seuil 0,5) applique la règle (bibliothèque posée/en cours ou capitale post-colon → science) pour la SEULE nation de Jev — le bot standard n'est pas touché (`regles.conversion.actif` reste `false` globalement, D2 respecté). Le harnais partage `memo.colonProduit` avec `joueur.mjs` (partie.mjs).
- **L2 — La guerre argumentée** : fini le menu de tous les rivaux — UNE cible pré-triée (le voisin le plus faible : forces visibles, puis distance, puis techs), décision OUI/NON, rapport de forces EXPLICITE dans le condensé (nouveau champ `rapportForces` par rival, nos forces visibles / les siennes, arrondi 0,1) et dans le libellé (« rapport 3× en notre faveur »). Miroir de la question « attaquer » du banc v2 qui passait à 0,85.
- **L3 — La paix au juste prix** : la question `compensation` passe de `score` à paliers (jamais levés) à un CHOIX dans une FOURCHETTE injectée par tour : prix indicatif = miroir exact de la grille T2 (`prixPaixBase` 15 × fierté × rapport de forces borné, données `negociation` de bot.json, agressivité de la CIV ennemie — canon T2), avec palier mi-prix et palier généreux (×2), le tout plafonné trésorerie et dédupliqué. Le libellé nomme « PRIX INDICATIF — ce que l'ennemi exige probablement ».

Tests-first (L1 du handoff) : 7 nouveaux tests `sableuse/tests/joueur.test.mjs` (rapportForces au condensé, question guerre cible unique, fixtures forces 4× → oui / 0,25× → non avec faux client piloté par le rapport, fourchette plafonnée trésorerie + déterminisme, choix `or:N` → paix avec N or, repli conversion indécis vs `aucun` confiant, reformulation convertir). Fausse LLM partout — zéro appel réel, zéro budget.

## 2. Re-banc v2 (L2) — `sableuse/bancs/joueur-v2-2026-10-27/`

10 parties, mêmes seeds/civs que v1, plafond 0,50 $ → **coût réel 0,170 $** (0,017 $/partie), 0 erreur API. Rapport complet dans le dossier (`RAPPORT.md` + journaux JSONL hors git).

## 3. Comparaison v1/v2 (L3 — même corpus, mêmes métriques)

| Métrique | v1 (joueur-2026-10-27) | **v2 (joueur-v2-2026-10-27)** |
|---|---|---|
| Victoires Jev | **0/10** | **2/10** (parties 4 et 10 — par conquête, villes bot 0) |
| Guerres DÉCLARÉES par Jev | **0** | **37** (0 refusées par le moteur) |
| Conversions | 2/1 368 tours | 10/1 172 tours (100 % décisions, 0 repli) |
| Propositions de paix | 220 (toutes paix sèche, 0 acceptée) | 794 — **24 avec or, 10 acceptées AVEC or** |
| Paix sèche | 220 proposées / 0 acceptée | 770 proposées / 1 acceptée |
| Échanges de techs | 0 | 0 (inchangé — question jamais choisie) |
| Score moyen Jev | 294 | **494** (bot : 117 → 144 ; Jev domine le score dans 9/10 parties) |
| Tours moyens | 138 | 117 |
| Jetons/décision | 3 426 | 3 152 |
| Replis | 12/1 378 | 25/1 172 |
| Coût/partie | 0,0207 $ | 0,0170 $ |

### Verdict : Jev gagne-t-il des parties et fait-il des guerres maintenant ?

**OUI aux deux.** Les trois critères d'acceptation du handoff sont atteints : Jev déclare des guerres (37 vs 0 — le verrou n'était PAS la confiance mais la forme de la question), convertit (10 décisions réelles vs 2), et gagne ses 2 premières parties du corpus — toutes deux par conquête (allemagne vs zoulous t66, france vs russie t30), le pattern exact de l'anecdote v1 (la seule conversion science → 16 techs → seule capture) désormais reproductible : Jev domine le score dans 9/10 parties (494 vs 144 en moyenne bot).

### Anecdotes

- **Partie 10 (france vs russie)** : guerre déclarée t15 (le pic de lancement — plusieurs guerres démarrées t10-15 quand le rapport de forces devient lisible), victoire par conquête t30.
- **Partie 4 (allemagne vs zoulous)** : guerre déclarée, conquête complète t66 — Jev v2 tient une campagne complète.
- **La paix au juste prix fonctionne mais est rarement payée** : 770/794 propositions sont des paix sèches (`or:0`) — quand Jev est dominant, la paix administrative s'obtient de toute façon (11 acceptées : 10 AVEC or, 1 sèche) ; quand il est perdant, le prix indicatif grimpe et Jev refuse de payer. Contre-propositions : 5.
- **Passivité résiduelle** : les échanges de techs restent à 0 (question jamais choisie — même avec la fourchette, le dialogue échoue) et 3 parties se soldent par un équilibre 1 ville/1 ville à t151 : Jev ne fonde JAMAIS de deuxième ville (la fondation reste au bot tactique, qui ne fonde quasiment pas en 1v1).

## 4. Recommandation

**Itération 3 recommandée avant tout branchement lobby** (verdict nuancé : la guerre et la conversion sont RÉSOLUES ; les verrous restants sont (a) la fondation — Jev ne s'étend jamais, plafond structurel à 1 ville en 1v1, (b) l'échange de techs — jamais choisi, (c) la paix payée en position perdante). Le lobby peut être branché pour une FUMÉE humaine — Jev v2 est un adversaire qui attaque — mais le 1v1 vs bot reste dominé par le plafond de 1 ville : la levier suivant est d'ouvrir la fondation à Jev (question dédiée ou critère produire:colon argumenté), pas la diplomatie.

Budget réel de la mission : **0,170 $** (plafond 0,50 $ ; garde-fou campagne 10 $ intact, compteur `coutReelAvant` inchangé).

## 5. Traces

- Harnais : `sableuse/src/joueur.mjs` (rapportForces, prixPaixSuggere, cibleConversionRepli, questions v2), `sableuse/src/partie.mjs` (memo.colonProduit), `sableuse/questions-joueur.json` (instructions v2 + seuil conversionScienceMin).
- Tests : `sableuse/tests/joueur.test.mjs` — 22 verts ; suite sableuse complète **58 verts** (6 fichiers).
- Banc v1 : `sableuse/bancs/joueur-2026-10-27/` (référence, inchangé) ; banc v2 : `sableuse/bancs/joueur-v2-2026-10-27/` (journaux hors git).
- Zéro impact prod : moteur/serveur/web intouchés, `schemaVersion` 28, bot standard inchangé.
