# HANDOFF-JEV-BANC-JOUEUR — Jev joue des parties entières : compétence et coût mesurés

**Décisions Erik 28/10** : GO, **budget plafond 10 $** (garde-fou élargi, arrêt automatique — rapport partiel acceptable), **10 parties** Jev vs bot standard, **même modèle/SDK que les bancs JEV précédents** (comparabilité des coûts). Hors ligne, zéro prod, zéro joueur réel.

## 1. Préalables

- Lire les livrables JEV (`jev-poc-livre` dc55be8, v2 e41b08f, v3/v4 94b2e51/9ee494e — le **condensé** existe, le SDK réel `@typesafe-ai/sdk` est branché, 0 rejet historique), `botPolicy.ts` (squelette tactique T-A/T-B — il EXÉCUTE, Jev DÉCIDE), DIPLOMATIE-T2 (interfaces de négociation), les validateurs (`orderShapeError` — toute décision illégale est ignorée).
- Baseline : suites vertes à jour, `schemaVersion` 28. Vérifier `git status` (sessions parallèles possibles). **Clés API : jamais dans le git** (env/.dev.vars local) — le banc lit l'environnement, échec propre si absente (rapport partiel).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Duel direct** : 10 parties 1v1 **Jev vs bot standard** (seeds fixes du corpus, civs réelles P7), 150 tours max ou victoire. Jev décide UNE FOIS PAR TOUR : recherche, conversion, orientation de production (militaire/éco), objectifs d'armée/campagne (cible + taille), et actes diplomatiques T2 (guerre/paix/échange) — **le bot standard exécute tout le tactique** (marche, combats, garnisons, travail des tuiles restant au bot T-B).
- **D2 — Décisions validées, repli permanent** : chaque décision passe par les formes canon (orderShapeError/handlers immédiats) ; illégale = ignorée + consignée ; échec API/timeout = ce tour joue au bot pur ; **compteur de budget par appel** — au plafond 10 $, arrêt immédiat du banc, rapport rendu avec les parties terminées (les autres marquées non jouées).
- **D3 — Mesures** : par partie — vainqueur/score (villes, pop, techs, trésorerie, PV militaires à la fin), guerres menées (héritage des métriques du banc), décisions acceptées/ignorées par catégorie ; par banc — coût cumulé, coût moyen/partie, tokens moyens/décision, latence moyenne ; **journal complet** par partie (condensé envoyé, réponse brute, décisions — artefact JSON réutilisable pour le futur Jev-négociateur du chat).
- **D4 — Jugement qualitatif** : l'agent lit les 10 parties (motif P7) et répond à LA question d'Erik : **« Jev joue-t-il mieux que le bot ? »** — anecdotes concrètes (bonne et mauvaises décisions : recherche aberrante, guerre juste, économie), verdict clair par domaine (économie, guerre, diplomatie).
- **D5 — Température 0** (ou config reproductible) + journal : chaque partie est auditable et rejouable décision par décision ; le RNG du moteur reste seedé comme toujours.
- **D6 — Zéro fuite** : le banc est dans devtmp/tests-banc (gate env), rien dans l'app, aucun changement au bot en prod, `schemaVersion` 28.

## 3. Mission

- **L1 — harnais test-first** : injection des décisions Jev dans le même pipeline que le bot (formes identiques), compteur de budget, repli bot pur, journal — tests avec une FAUSSE LLM locale (aucun appel réel dans les tests).
- **L2 — exécution du banc réel** : 10 parties × jusqu'à 150 tours, budget surveillé à chaque appel, artefacts D3.
- **L3 — analyse** : tableaux D3 + lecture qualitative D4 + VERDICT : (a) Jev est-il compétent ? (b) coût/partie réel ; (c) recommandation : brancher « Partie contre Jev » au lobby (et à quel prix/partie), ajuster le condensé, ou attendre.
- **L4** : rapport `REPORT-JEV-BANC-JOUEUR.md` (coûts, verdicts, anecdotes, décision recommandée), commit du CODE du harnais (jamais des clés, jamais les journaux lourds si > quelques Mo), arrêt, remise de la main.

## 4. Critères d'acceptation

1. Les 10 parties (ou moins si plafond budgétaire) jouées de bout en bout avec décisions Jev réelles ;
2. Le rapport répond à « meilleur ou pire que le bot ? » chiffres ET anecdotes à l'appui ;
3. Coût réel/partie établi, comparé à l'estimation ;
4. Zéro impact prod, zéro secret dans le dépôt.

## 5. Périmètre interdit

Branchement lobby/prod (Jev live — tranche suivante si verdict positif), toute modification du bot standard ou du moteur (hors harnais), le chat Jev (interfaces T2 seules), `schemaVersion`.

## 6. Fin de session

Rapport + verdict, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik ni des secrets.
