# HANDOFF-HORLOGE-DISTANCE — L'horloge de paix connaît la distance + conquêtes mesurées par ère

**Décisions Erik 28/10** (sonde PAIX-RYTHME : le siège est sain, la guerre meurt avant l'arrivée de l'armée — marche 15-25 tours, guerre fermée à 8-16). Deux leviers validés : l'horloge de paix devient **fonction de la distance de la cible**, et le banc mesure les conquêtes **par ère**. Les spawns NE bougent PAS (décision Erik).

## 1. Préalables

- Lire `REPORT-PAIX-RYTHME.md` (D3 horloge, sonde `devtmp/sonde-paix-rythme.mjs`), la paix T-C/PAIX-RYTHME (`toursPaixMin`, 2×, guerre vide), BOT-ARMEE/PAIX-RYTHME (cible de guerre cohérente, armées de siège R-31), le banc P7 (artefacts, 40×3).
- Baseline : suites vertes à jour, `schemaVersion` 28. Vérifier `git status`.

## 2. Décisions (Erik 28/10 — non négociables)

- **D1 — Durée minimale de guerre modulée par la distance** : `duréeMin = toursPaixMin + distanceCible × facteurMarche` (données, ex. facteur 1) — la distance de la CIBLE DE GUERRE au moment de la déclaration (wrap, espace colonne). La paix « administrative » (guerre jamais bataillée) reste à `duréeMin` ; la paix du gagnant (2×) s'applique au-dessus. Déterministe, tout dans `bot.json`/données de paix.
- **D2 — Conduite inchangée** : armées de siège R-31 (PAIX-RYTHME), cible de guerre pondérée, valeurs de combat et villes — rien d'autre ne bouge. Spawns intouchés (décision Erik).
- **D3 — Métriques du banc PAR ÈRE** : l'analyse découvre les percées/captures par ère (Ancienne/Médiévale/Industrielle/Moderne) — la conquête est-elle un phénomène de milieu/fin de partie (frontières qui se touchent) ou absente partout ? Tableaux par ère au rapport.
- **D4 — Cibles du banc (révisées, cohérentes avec D3)** : les cibles 40 %/10 % s'évaluent **sur les guerres de l'Ère Médiévale et au-delà** (l'agrégat toutes-ères reste rapporté pour comparaison historique) ; 0 écrasement, parties > 100 tours, défense joueur viable, ρ ≥ 0,4 — inchangés.
- **D5 — Sondes conservées** : `sonde-paix-rythme.mjs` étendue (durée de guerre vs distance de cible — vérifier la relation D1 sur les données).

## 3. Mission

- **L1 — test-first** : durée minimale modulée (fixtures par distance : proche = brève, loin = longue), paix du gagnant au-dessus, guerre vide à duréeMin, détermination du rapport, déterminisme.
- **L2 — moteur/paix** (D1) — serveur/données.
- **L3 — banc 40×3 civs réelles** : tableaux par ère (D3), cibles D4, avant/après horloge ; captures god mode `dev-logs/captures-horloge-distance/` (guerre longue jusqu'au siège, armée formée, capture si observée).
- **L4 — commit + push (CI déploie)**, rapport `REPORT-HORLOGE-DISTANCE.md` (tableaux par ère, verdict : la conquête émerge-t-elle ? 🔶, liste « à juger en jouant par Erik »).

## 4. Critères d'acceptation

1. Les guerres lointaines durent le temps de la campagne (relation distance→durée prouvée par la sonde) ;
2. Les cibles D4 atteintes — ou l'échec localisé par ère et documenté ;
3. Canon et spawns intacts ; déterminisme, suites vertes.

## 5. Périmètre interdit

Spawns/génération, valeurs de combat/villes, R-31/R-71, le joueur, T2/T3, Jev, `schemaVersion`.

## 6. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
