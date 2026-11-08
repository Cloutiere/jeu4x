# REPORT-JEV-V3-BANC2 — v3 du pilote (« fonder » décidable) + banc 2 (150 tours, civs sans remise)

> Mission HANDOFF-JEV-V3-BANC2 — outil HORS LIGNE (sableuse uniquement), zéro changement moteur/serveur/jeu.
> **Statut : exécutée en entier (L0→L5), ARRÊT POUR APPROBATION D'ERIK (L4). Rien de committé.**

## 1. Ce qui a été livré

- **D4 (bug d'affichage)** — corrigé dans `sableuse/src/condense.mjs`, testé contre le faux client ET contre un extrait de vrai journal du banc 1 :
  - `empire.science` lisait `me.science`, champ qui **n'existe pas** côté moteur → toujours 0. Remplacé par `empire.scienceReserve` (= `scienceStored`).
  - `recherche.enCours` restait affiché APRÈS complétion (le harnais re-émet SetResearch du memo ; le moteur vide alors `scienceProgress`) → « alphabet 0/20 » en boucle, trompeur. Désormais `enCours` n'est montré que si la tech n'est pas déjà débloquée, avec `reserve`, `scienceParTour`, `techsCompletees`.
  - **Pas de STOP** : le fait sous-jacent « science ≈ 0/tour au départ » est canon moteur (R-90, conversion défaut **Or**, pas de Bibliothèque tôt) — c'est une vérité de jeu, désormais montrée honnêtement à Jev au lieu d'être masquée par le bug.
- **D1 (`fonder` v3, décisionnable)** — formule du **gain net** dans `configCondense.gainSite` (éditable, sableuse uniquement), texte complet :

  ```
  gainNet(site) = partCouronne1 × (somme rendements couronne 1)
                + partCouronne2 × (somme rendements couronne 2)
                − penaliteDistance × distance(colon → site)
                − penaliteRisque × (ennemis connus à ≤ rayonRisque cases du site)

  valeurs (v3 gelées pour le banc 2) :
    partCouronne1 = 0,5   partCouronne2 = 0,25
    penaliteDistance = 2  rayonRisque = 4  penaliteRisque = 3
    seuilRentable (texte de question) = 2 / tour
  ```

  La question `fonder` est réécrite sur ces chiffres (`questions.json` v3, v2 archivée `questions.v2.json`) ; **seuil noul abaissé 0,7 → 0,5** (point de départ annoncé, non re-ajusté après coup — D5 gel) ; l'adaptateur refuse de fonder un site à gainNet ≤ 0 et vise le meilleur gainNet.
- **D3 (civs sans remise)** — `attribuerCivs` tire 5 civs **distinctes** par partie ; verrouillé par test (`banc.test.mjs`).
- **D2 (banc 2)** — plafond **150 tours**, 30 Jev + 10 contrôle, plan seed 20260929, reprise/budget identiques, exécution **résumable** (40/40 faites du premier coup).
- **Métriques neuves** : paires de guerres inter-nations calculées par le harnais (hors barbares) ; fondations DÉCIDÉES par Jev (ordres FoundCity traduits) distinguées du simple compte de villes ; `src/analyse-v3.mjs` (extraits qualitatifs D6) ; recalcul gratuit des guerres par rejou moteur (`guerres.json` en sidecar, jamais dans les journaux bruts).
- **v3.1 (découvert PAR le banc 2, corrigé après coup)** : boucle de rejets FoundCity — le colon fonde sur une case où une ville ennemie **invisible sous le fog** a été créée → rejet silencieux du moteur → l'adaptateur re-proposait la même case à l'infini. Correctif : liste noire par partie (`memo.casesFondationEchouees`), plus jamais de FoundCity sur une case ayant échoué ; test dédié.

## 2. A/B v2 vs v3 (4 seeds communes du banc 1, vrai client, plafond 50 tours)

| Seed | v2 (banc 1) : villes Jev / fondations décidées | v3 : villes Jev / fondations décidées | replis v3 | coût v3 |
|---|---|---|---|---|
| 1929164 | 1 / 0 | 1 / 3 | 0/41 | 0,0042 $ |
| 1937083 | 1 / 0 | 4 / 4 | 0/51 | 0,0057 $ |
| 1945002 | 1 / 0 | 2 / 2 | 0/51 | 0,0057 $ |
| 1952921 | 1 / 0 | 1 / 2 | 0/51 | 0,0055 $ |

**La v3 fait fonder Jev lui-même sur 4/4 seeds, sans replis massifs, 0 rejet sur ces parties.** Critère A/B atteint → gel (D5) → lancement du banc 2.

## 3. Banc 2 — résultats (40 parties, `sableuse/bancs/banc-2-2026-09-29/RAPPORT.md`)

- **Expansion** : nation Jev **5,33 villes** en moyenne (vs 1,00 au banc 1 ; contrôle 1,06 = capitales seules). **160 villes fondées sur 30 parties = 100 % par décision Jev** — le bot seul ne fonde JAMAIS (preuve par le bras contrôle). Critère ≥ 1,5 : **largement atteint**.
- **Décidées** : **1/40 (2,5 %)** — critère 20 % NON atteint. Le critère d'arrêt L2 n'a pas joué (fumée gratuite 150 tours : 2/5 décidées, guerres présentes). La seule partie décidée : contrôle, `razedCapital` t107. Lecture : la lenteur antique est assumée (périmètre interdit : on ne touche pas à la croissance) ; à 150 tours les empires vivants font 1-8 villes et personne n'écrase personne. Le plafond reste le mauvais levier : le jeu 5-nations bot-vs-bot ne converge pas, il stagne.
- **Guerres inter-nations** : **4/40 parties** (p4|p5 ×2, p2|p4, p3|p5) — contact et combat existent, mais la grande majorité des combats est dirigée contre les barbares. Jev exerce menace/attaque dans les parties où des ennemis approchent (extraits : fortification sur menace ×3, rapport 0,33 → production guerrier).
- **Replis** : 77/3 959 appels (2 %) — le routage par domaine tient à 150 tours.
- **🔶 Rejets** : **446/611 ordres FoundCity rejetés** (boucle fog, §1 v3.1) — c'est le principal défaut du banc tel que joué. 160 fondations ont quand même abouti (5,33/partie). Corrigé en v3.1 APRÈS le banc ; le banc n'a PAS été re-joué (économie 0,56 $, décision à voter).
- Coût banc : **0,5564 $** (0,0185 $/partie Jev), latence moy 175 ms / max 467 ms — la v3 est 2× moins chère par appel que prévu grâce aux questions dynamiques déjà en v2.

## 4. Critères d'acceptation (§4 du handoff), chiffrés

| # | Critère | Verdict |
|---|---|---|
| 1 | ≥ 1,5 villes Jev, majorité par décision Jev | **ATTEINT** — 5,33 villes, 160/160 fondations décidées par Jev (🔶 73 % des ordres rejetés, corrigé v3.1) |
| 2 | ≥ 1 guerre inter-nations, menace/attaque exercées | **ATTEINT (faible)** — 4/40 parties, Jev réagit aux menaces observées |
| 3 | ≥ 20 % de parties décidées | **NON ATTEINT** — 1/40 ; expliqué §3 |
| 4 | D4 corrigé/testé, civs sans remise testée, A/B documenté | **ATTEINT** — 26/26 tests verts |
| 5 | ≤ 2 $, 0 ordre illégal, zéro changement moteur, tests verts, zéro secret | **PARTIEL** — coût 0,82 $ ✓, moteur intact ✓, secrets ✓ ; 🔶 446 ordres illégaux (FoundCity fog), corrigé v3.1 non re-banché |

**Coût cumulé du pilote** : 0,0932 (POC+v2) + 0,1459 (banc 1) + 0,0211 (A/B) + 0,5564 (banc 2) ≈ **0,82 $** / garde-fou 2 $.

## 5. Lecture d'intelligence (D6) — « Jev est-il intelligent ? »

**Réponse honnête : Jev v3 a cessé d'être passif — il est devenu un acteur d'expansion motivé et chiffré — mais il n'est pas encore intelligent au sens plein : il ne gagne jamais, il ne fait pas la guerre, et sa prédiction économique reste grossière.**

Extraits (journaux banc 2) :
- **Fondation motivée** : partie-004 (japon), Jev fonde t0 avec gainNet prédit 9,3, t21 prédit 10,5, t32 prédit 9,5 — la décision porte un CHIFFRE et le site choisi est le meilleur candidat, pas le premier de la liste. partie-003 : à t80 Jev accepte un site à gainNet 3 seulement (fin de bonnes terres) — la décroissance de l'appétit suit la formule.
- **Prédiction vs réel (honnêteté)** : gainNet prédit 6,5-10 ≈ rendements « ville peuplée » ; rendements réels mesurés 3 tours après fondation : **3-6**/tour — la formule surestime d'un facteur ~2 en ville jeune (pop 2 ne travaille que 2-3 cases). À calibrer (pondérer par la pop) ou à étiqueter « à maturité » dans la question.
- **Diversification de production** : colon quand menace < 2 (partie-001 : colon, guerrier alternés), guerrier quand menace ≥ 2 (partie-006, rapport 0,5 : trois tours de suite production guerrier) — la règle de départage de la question `produire` est suivie sur les faits, pas récité.
- **Réaction à menace** : partie-002 t20, puissance 1 vs 3 : fortification + production militaire ; partie-007 t66, menace ×3 : unités vers les villes.
- **Ce qui manque encore** : 0 victoire en 30 parties ; aucune initiative offensive hors réaction ; la science reste structurellement bloquée par le canon R-90 (conversion défaut **Or** — aucune nation, bot compris, ne pose `SetConversion`) : la question `rechercher` porte sur un flux ≈ 0 et les 0,77 techs/partie viennent surtout de la tenue de recherche sur des techs à 20 fioles.

## 6. Fiche de suffisance v3 (ce qui manque encore)

1. **Rejets fog** — v3.1 corrigé mais non validé en vraies parties ; à couvrir par un mini-banc (5-10 parties, ~0,10 $).
2. **SetConversion** — sans lui, toute la branche science du condensé décrit un empire qui ne peut pas chercher. Proposition v4 : action `SetConversion` dans l'adapter (existe côté moteur, pur consommateur), question « convertir » par ville ou une règle simple (bibliothèque → science). C'est LE blocage de progression.
3. **Calibrage gainNet** — pondération par la pop de la ville jeune (facteur maturité) pour coller aux rendements réels ; re-ajustement du seuil `fonderMin` (0,5 n'a pas eu à être bougé : les noul montent à 0,75-0,95 sur sites rentables).
4. **Offensive** — `attaquer` ne se déclenche qu'en réaction (menace ≥ 2). Une lecture d'opportunité (ville ennemie faible à distance de marche) manque pour qu'un jour une partie soit DÉCIDÉE par Jev.
5. **Convergence des parties** — 1/40 décidées n'est pas un problème Jev mais un fait bot-vs-bot ; le banc a besoin d'un critère de fin alternatif (score à 150 tours) ou d'un plafond beaucoup plus long, sinon la lecture « qui gagne » restera vide.

## 7. Recommandation

Le pilote v3 **est prêt à servir de référence de calibrage** pour le domaine expansion (formule de gain net + condensé chiffré + tenue des décisions), à deux réserves près : re-bancher la v3.1 (liste noire) pour effacer les 446 rejets, et débloquer la science (SetConversion) avant toute lecture « intelligence » sur les ères supérieures. Prochains réglages proposés (à voter) : mini-banc v3.1 → pondération maturité du gainNet → v4 SetConversion → banc 3 avec critère de fin par score.

## 8. Fichiers

- Modifiés (sableuse uniquement) : `questions.json` (v3), `src/condense.mjs`, `src/adapter-jev.mjs`, `src/faux-jev.mjs`, `src/partie.mjs` (guerres + liste noire), `src/banc.mjs` (150 tours, sans remise, métriques), `tests/banc.test.mjs`.
- Neufs : `questions.v2.json` (archive), `tests/v3.test.mjs`, `src/analyse-v3.mjs`, `bancs/banc-2-2026-09-29/` (plan, etat, journaux, RAPPORT.md, guerres.json — journaux NON committés).
- **Aucun commit** (L4 : feu vert Erik requis). `CadreLobby.svelte` / `config.ts` intacts (autre session).
