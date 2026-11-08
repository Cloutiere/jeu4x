# HANDOFF-JEV-CONTACT-GUERRE — Jev ne déclare la guerre qu'après un contact réel

**Décisions Erik 29/10** (vision Zii : la guerre est l'ABOUTISSEMENT d'un arc relationnel, pas un mouvement d'ouverture — constaté en fumée : Jev déclare immédiatement). Fix au harnais, même méthode v2/v3. Budget plafond **0,40 $** (garde-fou campagne 10 $ intact).

## 1. Préalables

- Lire le harnais v3 (`sableuse/src/joueur.mjs` — question guerre argumentée L2, `partie.mjs`, `condense.mjs` — bloc diplomatie), `REPORT-JEV-EXPANSION.md` (v3 : fondations, 6 villes), le banc canon `sableuse/bancs/joueur-v3-2026-10-27/`.
- Baseline : suites sableuse vertes, `schemaVersion` 28. Vérifier `git status`. Clés en env uniquement.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Contact réel préalable** : pas de question guerre tant que le candidat cible n'est pas RENCONTRÉ (vision : une unité/ville adverse vue au moins une fois — l'état de rencontre existe côté harnais à créer à partir de la vision) ET qu'un délai minimal de coexistence est écoulé depuis la rencontre (donnée, ex. 10 tours).
- **D2 — L'arc avant la guerre** : la question guerre intègre l'âge de la relation (données : « rencontre depuis N tours », « aucune provocation ») — une guerre devient d'autant plus probable que la relation est longue ET le rapport de forces favorable ; les critères restent plats (méthode v2).
- **D3 — Intouchés** : conversion/paix/fondation v3, moteur/serveur/web, bot standard, `schemaVersion` 28, même corpus.

## 3. Mission

- **L1 — tests-first** : état de rencontre à partir de la vision (fixture), question guerre masquée avant rencontre (zéro déclaration), délai minimal, arc âge-de-relation au condensé, fausse LLM, déterminisme.
- **L2 — re-banc v4** : 10 seeds identiques, plafond 0,40 $, artefacts `sableuse/bancs/joueur-v4-<date>/`.
- **L3 — comparaison v3/v4** : guerres déclarées AVANT rencontre (v3 : immédiates — métrique à 0 visée), guerres totales, fondations (non-régression v3 : 2,2+ villes/partie), victoires, score, coût ; anecdotes ; verdict « Jev fait-il des guerres d'adulte maintenant ? ».
- **L4** : rapport `REPORT-JEV-CONTACT-GUERRE.md` (tableau v3/v4, verdict, 🔶), commit du harnais (jamais de clés), arrêt, remise de la main.

## 4. Critères d'acceptation

1. ZÉRO déclaration avant rencontre + délai (métrique du banc) ;
2. Jev reste belliqueux APRÈS l'arc (non-régression des 37 guerres de v2 à l'échelle v3) ;
3. Fondations v3 préservées ; coûts documentés ; zéro impact prod.

## 5. Périmètre interdit

Moteur/serveur/web, bot standard, lobby, Zii (tranche suivante), `schemaVersion`.

## 6. Fin de session

Rapport + verdict, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik ni des secrets.
