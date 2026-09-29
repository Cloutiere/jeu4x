# HANDOFF-JEV-QUESTIONS-V2 — De Jev « pilote à colons » à Jev pilote complet (condensé enrichi + questions sérieuses)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `docs/recherche/Intégration IA JEV Jeu 4X.md` (directives Jev), `REPORT-JEV-POC.md` (LA matière première : fiche de suffisance §6, métriques §3, 🔶 §8) et la `sableuse/` livrée (harnais, condense, adapter-jev, faux-jev, journal, questions.json, rejouer). **Outil HORS LIGNE** — toujours interdit au serveur, à la prod, au jeu distribué. Zéro changement moteur (`packages/rules` en consommation seule ; une seule exception tolérée : exposer une valeur de site si elle existe déjà en pur, sinon la calculer DANS la sableuse). Budget Erik : 5 $, garde-fou 2 $ maintenu, dev avec le faux client.

## 1. Objectif (suite logique du POC, décision d'Erik du 28/09)

Le POC a validé la tuyauterie mais Jev n'a piloté qu'UN domaine (production de colons) avec 21 replis de tête. Cette mission applique la **fiche de suffisance d'information** du POC : enrichir le condensé, concevoir les questions v2 SUR CES FAITS, et prouver l'amélioration par comparaison A/B v1/v2 sur les mêmes seeds — dont un **scénario à contact forcé** pour enfin exercer menace/attaque. Critère de réussite : Jev pilote les domaines avec peu de replis après l'ouverture, distributions tranchées, décisions diversifiées et sensées au regard du journal.

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Condensé enrichi** (ajouts pilotés par la fiche §6 du POC, toujours « fetch precisely », cible ≤ ~3 000 jetons) :
  - rendements nets par tour **par ville** (nourriture/production/science/or) ;
  - file de production courante de chaque ville + **coût et rendement des candidats** proposés ;
  - **valeur des 2-3 meilleurs sites de fondation** (score calculé DANS la sableuse : rendements du voisinage, distance, sécurité — formule simple consignée et éditable) ;
  - puissance militaire connue du rival (unités visibles, rapport estimé) ;
  - état de la recherche (tech en cours, tours restants estimés, 2-3 candidates suivantes avec coûts).
- **D2 — Questions v2** (dans `questions.json`, éditable, 1 appel/tour toujours) : les 4 existantes **réécrites avec les nouvelles données dans les instructions** (ex. « fonder » : comparer la valeur des meilleurs sites au gain de garder toutes les ressources dans la capitale) + **2 nouvelles** : `produire` (Choice parmi les candidats de la ville avec coûts) et `rechercher` (Choice parmi les techs candidates — Jev choisit UNE fois, le harnais s'y tient, contrairement au bot actuel). Conception guidée par les directives du doc (littéral strict, pas d'arithmétique, critères départageables).
- **D3 — Scénario à contact forcé** (pour menace/attaque, jamais testées au POC) : parties où les capitales sont proches (seeds à spawn serrés) et/ou une position de test injectée AU NIVEAU DU HARNAIS (unités ennemies visibles en frontière — outil hors ligne, injection locale acceptable, clairement étiquetée `scenario:test` dans le journal). Aucune modification du moteur.
- **D4 — Évaluation A/B** : rejouer les MÊMES seeds avec questions v1 puis v2 ; tableau comparatif : taux de repli par phase (ouverture/milieu/fin), couverture des domaines pilotés, distributions plates, diversité des choix de production, ordres illégaux, coût/latence. La v1 reste disponible dans le dépôt de la sableuse (questions v1 archivées) pour rejouabilité.
- **D5 — Déterminisme et journal inchangés** : même format JSONL (les nouvelles décisions s'ajoutent avec leur question), rejouabilité conservée (les `motif` couvrent les nouveaux ordres), garde-fou budget actif, faux client enrichi des nouvelles questions pour le dev gratuit.
- **D6 — Zéro impact dépôt** : tout dans `sableuse/` ; `packages/rules`/`apps/server` intacts ; tests du dépôt verts (aucune raison qu'ils bougent).

## 3. Mission

### L0 — Préalables
- Baseline : `npm test` sableuse vert, tests du dépôt verts, budget restant estimé (le journal du POC consigne la consommation).
- Relis §6 et §8 du REPORT-JEV-POC ; vérifie les primitives disponibles dans le condensé actuel.

### L1 — Condensé enrichi (D1)
- Étendre `condense.mjs` (valeurs calculées par la sableuse, formules simples éditable dans une config) ; tailles mesurées (moy/max octets) au journal.
- Tests faux-client : condensé présent, bornes de taille, formules de valeur de site (unitaires sur fixtures).

### L2 — Questions v2 + adapter (D2)
- Réécrire `questions.json` (v2) ; archiver la v1 (`questions.v1.json`) ; étendre l'adapter (6 questions, routage, fusion d'override par sujet comme au POC) ; faux client enrichi.
- **Recherche tenue** : le harnais mémorise le choix `rechercher` et ne re-questionne que si la tech est complétée (vs le bot qui re-tire chaque tour).

### L3 — Scénario à contact forcé (D3)
- Config de scénario (`scenario: contact`) : spawns serrés et/ou injection harnais d'une position de test ; journal étiqueté.

### L4 — Parties + évaluation A/B (D4)
- Au minimum : 2 seeds × {v1, v2} sans contact (comparaison contrôlée) + 2 parties v2 à contact forcé. Budget sous garde-fou.
- Tableau A/B (D4) + lecture qualitative (3-4 décisions commentées, comme au POC) + fiche de suffisance **v2** (ce qui manque ENCORE, question par question — le POC a montré la valeur de ce format).

### L5 — ARRÊT POUR APPROBATION D'ERIK
Présenter : tableau A/B, décisions commentées (notamment UNE décision de menace/attaque en situation de contact), fiche v2, coût total consommé depuis le début. Verdict : le pilote est-il assez bon pour le banc de calibrage 5 nations ? NE COMMITTER QU'APRÈS FEU VERT (jamais `journaux/` ni `.env.local`).

### L6 — Rapport
- `REPORT-JEV-QUESTIONS-V2.md` : enrichissements D1 (formules), questions v2 (textes complets), scénario contact, tableau A/B, fiche v2, 🔶 (seuils, formule de valeur de site, garde-fous), recommandation pour le banc.

## 4. Critères d'acceptation
1. Sur les mêmes seeds, la v2 réduit nettement les replis d'ouverture vs v1 (chiffres au rapport) et pilote ≥ 4 domaines (production, fondation, recherche + posture, et menace/attaque si contact).
2. Scénario à contact forcé : menace `Score` réagit (≠ 0) et au moins UNE décision d'attaque analysée dans le journal.
3. Recherche : une tech complétée dans la partie (le choix est tenu), contrairement au POC.
4. Coût total ≤ 2 $ depuis le début ; latence compatible banc ; 0 ordre illégal ; rejouabilité conservée.
5. Zéro changement moteur/serveur/jeu ; suites vertes ; zéro secret au dépôt.

## 5. Périmètre interdit
- Moteur/serveur/protocole/jeu distribué (même l'exposition de valeurs : calculer dans la sableuse) ; le banc de calibrage 5 nations (chantier SUIVANT) ; un correctif du bot prod (sujet séparé, noté par Erik) ; tout autre fournisseur IA ; commit de secrets/journaux.
