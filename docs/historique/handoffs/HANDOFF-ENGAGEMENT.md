# HANDOFF-ENGAGEMENT — Les règles d'engagement revues (Erik dicte, l'agent implémente test-first et valide dans le labo)

**Chantier gameplay majeur du chapitre 2D.** Erik implémente ses **règles d'engagement revues et corrigées** — il les **donne lui-même à l'agent en début de session**. Ce handoff NE contient PAS les règles : il encadre la méthode. Axes déjà tranchés par Erik : **une seule unité par case, de façon stable — le concept d'empilement est ABANDONNÉ** (il abroge des parties de BARBARES-PILES).

## 1. Préalables — l'agent prend connaissance (dans l'ordre)

1. **`REPORT-COMBAT-COMPORTEMENTS.md`** (historique des rapports) — la codification de référence du combat actuel : déclencheurs, choix du défenseur, échange R-51, issues R-52, collisions R-53, replis R-54/R-56, attaques répétées R-55, barbares R-95..R-99, unités pacifiques, villes, Grande Muraille, constantes, lecture du journal. **C'est l'état « avant »** ;
2. **`#/labo-combat`** (`REPORT-LABO-COMBAT.md`) — l'outil de test : placements libres J1/J2/barbares, programmation des deux côtés, résolution seedée reproductible, journal complet. **C'est le banc de validation des nouvelles règles** ;
3. `RULES.md` §6-§7 (R-40..R-61, R-95..R-99, R-149), BARBARES-PILES (commit `862dd69`) — ce qui va être partiellement abrogé ;
4. Baseline : suite verte, typecheck 4/4, `schemaVersion` courante (24), `git status` propre.

## 2. Méthode obligatoire (le rituel de cette session)

1. **Erik dicte ses règles d'engagement.** L'agent les **reformule en R-xx** (propositions de numéros/textes) et les présente à Erik avec **tout ce qu'il touche indirectement** (chaque abrogation, chaque écart découvert) — **arrêt-pour-approbation AVANT de coder** (modèle 7b) ;
2. **Implémentation test-first** : chaque règle dictée = tests écrits d'abord, citant la nouvelle R-xx ; les tests de l'ancien contrat réécrits ou supprimés avec justification ;
3. **Validation dans `#/labo-combat`** : chaque règle est démontrée par un scénario de labo (captures `dev-logs/captures-engagement/`) — c'est le banc d'essai prévu pour ça ; scénarios proposés par Erik en session ;
4. Seules les règles dictées par Erik sont implémentées — **aucune « amélioration » spontanée de l'agent** (une idée ? elle va dans le rapport, pas dans le code).

## 3. Conséquences connues du virage « une unité par case » (à traiter selon les règles dictées)

- **Abrogations attendues** : la pile de camp barbare (les gardes devront être spatialisées — adjacent au camp ? à cadrer avec Erik), le **drapeau d'empilement** (BARBARES-PILES M2), la **défense-de-pile R-52 rév.** (retour au défenseur standard), le **combat un par un enchaîné** de l'assaut de camp ;
- **Restent** (sauf ordre contraire d'Erik) : camps sans PV, capture du camp = récompense hutte seedée, gardes vs explorateur, escalation guerrier-only, aggro ;
- **Migration** : si l'état change (empilement, positions), `schemaVersion` → 25 idempotente — à signaler AVANT de coder ;
- **UI** : le drapeau d'empilement sort du rendu ; toute surcouche dépendante suit les nouvelles règles ;
- **R-96/R-97/R-99 révisées** par l'agent dans RULES.md (le pilotage relit à l'acceptation).

## 4. Vérification

- Suite verte forcée complète, typecheck 4/4, scénarios de labo pour CHAQUE nouvelle règle, partie solo réelle inchangée dans ses autres comportements, zéro diff 3D.

## 5. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-ENGAGEMENT.md` (y compris : les règles dictées reformulées en R-xx et validées, la liste des abrogations, les migrations, les constats de labo), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
