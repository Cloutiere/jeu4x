# HANDOFF-JEV-V3-BANC2 — v3 du pilote (« fonder » décidable) + banc 2 (parties longues, civs sans remise)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `docs/recherche/Intégration IA JEV Jeu 4X.md`, `REPORT-JEV-POC.md`, `REPORT-JEV-QUESTIONS-V2.md`, `REPORT-JEV-BANC.md` + `sableuse/bancs/banc-2026-09-28/RAPPORT.md` (les faits : 40/40 non décidées à 50 tours, 1,01 ville/joueur, zéro guerre inter-nations, `fonder` indécidable noul ≤ 0,42, science/progrès affichés 0 dans le condensé). La `sableuse/` est en place (banc résumable, 18/18 tests). **Outil HORS LIGNE** — interdit au serveur/prod/jeu distribué. Zéro changement moteur (`packages/rules` en consommation). Budget Erik : 5 $, garde-fou global 2 $ (consommé à date ~0,25 $ — journalisé), dev avec le faux client.

## 1. Objectif (verdict Erik sur le banc 1 : « ça fonctionne, mais Jev n'est pas encore intelligent »)

Rendre à Jev la décision qui lui manque (**fonder une ville, avec un gain net chiffré**), et rejouer un banc **où les parties se déplient** (plafond long) — les deux ensemble, car l'un valide l'autre. Critères d'intelligence mesurables en sortie (§5).

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — `fonder` v3, décisionnable** : le condensé ajoute pour les 2-3 meilleurs sites un **gain net estimé** calculé PAR LA SABLEUSE (formule simple et éditable : rendements du voisinage du site − coût de croissance/distance, + risque si ennemi/barbare connu à proximité) ; la question `fonder` est réécrite avec ces chiffres (« le site A rapporte X/tour net… ») ; seuil noul recalibré **sur les parties du banc 2** (pas à l'aveugle : commencer à 0,5, ajuster une fois les faits en main, consigné).
- **D2 — Banc 2 : plafond 150 tours** (D-doc banc 1 : 50 ne suffit pas à 5 nations). 40 parties (30 Jev + 10 contrôle) comme au banc 1, reprise/plan/budget identiques.
- **D3 — Civs SANS REMISE par partie** (le doublon Égypte/Égypte du banc 1 était un défaut du plan-generator) : 5 civs distinctes par partie, rotation équilibrée conservée, test qui verrouille l'unicité.
- **D4 — Bug d'affichage du condensé** : la science affichée et le progrès de recherche restaient à 0 alors que des techs se complètent (rapport banc 1, suspect sérialiseur) — diagnostiquer et corriger dans `condense.mjs`, **testé contre le faux client ET contre un extrait de vrai journal** (le moteur est exclu : si le bug venait du moteur, STOP et rapport).
- **D5 — Gel de l'adaptateur pendant le banc 2** (comme banc 1) : les réglages de v3 (seuil `fonder`, formule de gain net) sont figés AVANT les 40 parties ; le A/B v2-vs-v3 se fait sur 3-4 seeds communes avant le lancement.
- **D6 — Lecture d'intelligence** : le rapport qualitatif doit répondre À LA QUESTION D'ERIK — « Jev est-il intelligent ? » — avec des extraits : une fondation motivée (le gain net prédit vs le résultat observé quelques tours plus tard), une décision de production diversifiée, une réaction à une menace. Honnêteté obligatoire si la réponse est « toujours passif ».

## 3. Mission

### L0 — Préalables
- Baseline : tests sableuse verts, budget à date (journaux), dépôt intact (NE PAS toucher `CadreLobby.svelte`/`config.ts` — autre session).
- Diagnostique le bug D4 (condensé vs journaux réels du banc 1 : les `TechResearched` existent, le condensé affichait 0).

### L1 — v3 pilote
- D1 : formule de gain net (config éditable), condensé enrichi, `questions.json` v3 (v2 archivée), seuil initial 0,5 ; faux client enrichi ; tests (formule, traduction, unicité des ordres).
- A/B rapide : 3-4 seeds × {v2, v3} — la v3 doit faire fonder JEV (≥ 1 fondation par Jev sur ces seeds) sans replis massifs ; ajuster la formule si absurde (dans le budget, faux client d'abord).

### L2 — Banc 2
- D2/D3 : plan 40 parties, plafond 150 tours, civs sans remise ; D5 gelé ; exécution résumable ; garde-fou 2 $.
- Critère d'arrêt de contrôle : si 5 parties de fumée montrent des parties encore toutes non décidées à 150 tours ET des empires à 1 ville, STOP et rapport (le problème serait ailleurs — règle de croissance, pas le pilote).

### L3 — Analyse + lecture d'intelligence (D6)
- Agrégats (banc 1) + **critères §5** + extraits qualitatifs.
- Fiche de suffisance v3 (le format établi) : ce qui manque encore.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter : tableau A/B v2/v3, RAPPORT.md du banc 2, la lecture d'intelligence D6 (réponse directe à « Jev est-il intelligent ? »), coût cumulé. NE COMMITTER QU'APRÈS FEU VERT (jamais `journaux/`, `bancs/` complets ni `.env.local` ; les RAPPORT.md de banc sont committables).

### L5 — Rapport
- `REPORT-JEV-V3-BANC2.md` : formule de gain net (texte complet), seuils, A/B, banc 2, critères §5 chiffrés, fiche v3, 🔶, recommandation (le pilote est-il prêt pour servir de référence de calibrage ? prochains réglages ?).

## 4. Critères d'acceptation
1. Jev fonde LUI-MÊME des villes : sur les parties longues, moyenne ≥ 1,5 villes pour la nation Jev (vs 1,00 au banc 1), dont la majorité fondées par décision Jev (pas repli bot).
2. Au moins une guerre inter-nations observée dans le banc (contact existe à 150 tours) ; menace/attaque exercées.
3. Des parties DÉCIDEES : ≥ 20 % des parties ont un vainqueur (type de victoire quelconque) — sinon le critère d'arrêt L2 a joué et le rapport l'explique.
4. Bug d'affichage science/progrès corrigé et testé ; civs sans remise verrouillé par test ; A/B v2/v3 documenté.
5. Coût cumulé ≤ 2 $ ; 0 ordre illégal ; zéro changement moteur/serveur/jeu ; tests verts ; zéro secret.

## 5. Périmètre interdit
- Moteur/serveur/protocole/jeu distribué (formules et seuils dans la sableuse uniquement) ; toute retouche des règles de croissance (le « départ lent antique » est assumé comme fidèle — on allonge les parties, on ne change pas le jeu) ; le bot solo en jeu ; tout autre fournisseur IA ; commit de secrets/journaux bruts.
