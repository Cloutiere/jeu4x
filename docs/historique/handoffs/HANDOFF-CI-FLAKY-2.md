# HANDOFF-CI-FLAKY-2 — Durcir progen-carte-50.test.ts (corpus fixe de seeds)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4 et `REPORT-CI-FLAKY.md` (le modèle à suivre : corpus fixe, seeds fautives en non-régression, banc dev hors CI). Mission **test-only, micro** — zéro changement moteur/serveur/protocole, zéro valeur de règle.

## 1. Objectif (suite du CI-FLAKY, décision Erik 01/10)

`packages/rules` :: `progen-carte-50.test.ts` consomme encore du fast-check à graines aléatoires — le même risque de rouge CI intermittent qu'on vient d'éradiquer sur `progen-properties`. Le durcir sur le modèle éprouvé.

## 2. Mission

1. Remplacer le fast-check aléatoire par un **corpus fixe de seeds** (une trentaine, déterministe, incluant des seeds exigeantes — cartes denses, archipels, 3/4/5 sièges ; s'inspirer du corpus 61 de `progen-properties`) ; chaque seed garde les MÊMES assertions qu'aujourd'hui (rien n'est relâché).
2. Si des seeds du corpus échouent : **c'est une vraie violation** — ne pas l'éluder : l'exclure du corpus, la documenter, et remonter le cas à Erik au rapport (correctif moteur = mission séparée).
3. Vérifier la parité avec le banc dev existant (`devtmp/banc-ci-flaky.mjs` couvre 1v1 40×40 — ajouter 50×40 au banc si trivial, sinon consigner).
4. Suites complètes vertes, rejeux ×5 sans variation.

## 3. Critères d'acceptation
1. `progen-carte-50.test.ts` déterministe (rejeux identiques), assertions inchangées.
2. Zéro changement hors le fichier de test (+ banc dev si ajouté) ; suites vertes.
3. Toute seed en échec documentée, jamais éludée.

## 4. Périmètre interdit
- Moteur/serveur/protocole, le champ `seed` de l'e2e (parké — décision Erik), toute autre retouche.
