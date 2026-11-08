# REPORT-JEV-V4 — Science débloquée, gainNet honnête, score de fin : le banc 3 et le premier classement des 16 civilisations

> **État** : exécuté le 29/09/2026, hors ligne (`sableuse/` uniquement — zéro changement moteur/serveur/jeu, dépôt intact). **ARRÊT POUR APPROBATION D'ERIK** : rien n'est committé (L5 du handoff — commit seulement après feu vert).
> **Budget** : mini-banc réel 0,0940 $ + banc 3 0,5146 $ = **0,6086 $** pour V4 ; cumul pilote ≈ **1,43 $** (garde-fou 2 $, cible ≤ 1,6 $ — respecté).

## 1. Ce qui a été construit (règles et formules, textes complets)

### D1 — Science débloquée par RÈGLE de harnais (`regle:conversion`)
La science était morte pour TOUT LE MONDE depuis la R-90 révisée (conversion par ville, défaut **or**, personne ne pose `SetConversion`). V4 applique, par le harnais, à la place du défaut, une politique déterministe **identique pour toutes les nations** (Jev, bots, contrôle — on mesure la civ, pas la règle) :

```
Pour chaque nation et chaque ville, chaque tour :
  - la ville qui A sa Bibliothèque (ou son Université, qui la remplace)
    OU la TERMINE (production en cours)  → conversion science ;
  - la CAPITALE, après le premier colon produit par le joueur → conversion science.
Changement journalisé `regle_conversion` (source: regle:conversion) ; idempotent.
```

- Implémentation : `sableuse/src/partie.mjs` (`changementsConversion`, consomme `applySetConversion` du moteur — zéro modification moteur).
- Config : `sableuse/questions.json → regles.conversion` (éditable).
- La question `convertir` (arbitrage or/science PAR Jev) reste une itération future ; le condensé expose désormais `empire.villes[].conversion` (l'orientation de chaque ville) pour s'y préparer.
- La question `rechercher` de Jev garde le choix de la tech (tenue jusqu'à complétion, inchangé v2).

### D2 — GainNet pondéré par la maturité
La formule v3 surestimait ~×2 les rendements réels d'une ville JEUNE. V4 ajoute à `configCondense.gainSite` (sableuse/src/condense.mjs) :

```
facteurMaturite: 0.5, actifMaturite: true
gainNet = maturité × (partCouronne1 × couronne1 + partCouronne2 × couronne2)
          − penaliteDistance × distance − penaliteRisque × ennemis(4 cases)
```

**GELÉ avant le banc 3.** Validation (mini-banc réel puis banc 3 — table prédiction vs réel) : chaque fondation Jev porte une prédiction journalisée (`gainNetPredite`) ; le harnais relève les rendements RÉELS de chaque ville à 10 tours d'âge (`rendement_jeune` — nourriture+production+science+or).

| Mesure | Résultat | Cible |
|---|---|---|
| Ratio moyen prédit/réel (banc 3, 96 fondations) | **0,57×** | ±50 % |
| Fondations dans [0,5 ; 1,5] | **50/96** | — |

Lecture honnête : la moyenne est dans la cible mais la distribution est large — la formule sous-estime désormais légèrement (les villes du jeu travaillent leurs meilleures tuiles d'abord, la couronne géométrique surestime le fond). Aucun site rentable n'est devenu non motivant (Jev fonde toujours : 4,3 villes pour la nation pilotée, 5,77 fondations décidées/partie).

### D3 — Score de fin à horizon fixe
Calcul pur (`sableuse/src/score.mjs`, testé), pondérations data-driven (`questions.json → score`) :

```
score = villes×10 + population×2 + techs complétées×30 + merveilles×100 + ⌊trésorerie/10⌋
```

Journalisé par joueur dans la ligne `fin` (`scores`), agrégé par le rapport du banc. **Le score ne remplace PAS les victoires** : les 4 parties décidées sont consignées (2 razedCapital, 1 science, 1 culture) ; le score classe les non-décidées.

### D4 — Faisabilité par victoire : 4/4 captées de bout en bout
`src/scenarios-victoire.mjs` — injections locales dans l'état moteur (harnais, hors ligne, étiquetées `scenario:victoire`, jamais mélangées au banc, sans Jev, ≤ 20 tours) :

| Scénario | Injection | Résultat |
|---|---|---|
| économique | trésorerie 20 000 + Banque mondiale en production (499/500) | Victoire économique tour 6 ✓ |
| scientifique | 4 composants du Vaisseau dans la capitale | Victoire science tour 3 ✓ |
| culturel | Nations Unies 499/500 + 20 jalons (R-116 : gelée en dessous) | Victoire culture tour 10 ✓ |
| domination | capitale ennemie sans défenseur ni production + envahisseur adjacent (R-65 : capture par occupation) | Victoire domination tour 3 ✓ |

Mini-rapport : `sableuse/bancs/scenarios-victoire/RAPPORT.md`. Chaque événement `Victory` est journalisé et agrégé par le rapport de banc (preuve : le banc 3 a AUSSI capté une vraie victoire science — voir §3).

## 2. Mini-banc de validation (7 parties réelles : 5 Jev + 2 contrôle, plan seed 4)

Critères du handoff — tous verts, **pas de critère d'arrêt déclenché** :

| Critère | Résultat |
|---|---|
| ~0 rejet fog FoundCity | 9 rejets de fondation / 7 parties (56 fondations) — TOUS sur des cases distinctes : la liste noire v3.1 a éliminé les boucles du banc 2 (446 rejets répétés) ; le résiduel est du fog RÉEL (ville ennemie invisible, une case à la fois). 🔶 détaillé §5. |
| Science visible (≥ 2-3 techs/empire à 150 tours) | **12,3 techs/empire** (min 7, max 18) vs ~0 au banc 2 |
| Score présent et plausible | oui, ordres de grandeur cohérents entre bras Jev et contrôle |
| Fondations toujours motivées | nation Jev : 5,2 villes ; 7 fondations décidées Jev/partie |
| Pas de replis massifs | 5 % des tours (35/649) |

Coût : 0,0940 $. **GEL** de l'adaptateur, des questions et des formules après ce mini-banc (comparabilité du banc 3).

## 3. Banc 3 — 40 parties (30 Jev + 10 contrôle, plan seed 7, 0 échec, 0,5146 $)

Rapport complet : `sableuse/bancs/banc-3-v4/RAPPORT.md`. Faits marquants :

- **La science fonctionne partout** : 11,1 techs complétées/empire en moyenne (min 4, max 18), 0/40 parties sous le critère. Et la science débloquée produit de VRAIES victoires : **le banc a enregistré une victoire SCIENCE naturelle (mongolie, tour 148 — Vaisseau lancé, 59 techs complétées dans la partie) et une victoire CULTURE (grèce, bras contrôle, tour 132)** — deux types jamais vus dans les bancs précédents, captés journal + rapport de bout en bout (preuve croisée des scénarios D4).
- 4/40 parties décidées (36 au plafond 150 tours) — c'est un fait du jeu assumé (D5) : le classement se fait PAR SCORE.

### Le classement des 16 civilisations (score moyen, horizon 150 tours)

| Rang | Civ | Score moy | Jev | Contrôle | n | villes | pop | techs | trésorerie |
|---|---|---|---|---|---|---|---|---|---|
| 1 | grece | 698,8 | 652,4 | 838,0 | 12 | 1,3 | 22,2 | 20,0 | 423 |
| 2 | rome | 542,3 | 565,0 | 497,0 | 9 | 0,8 | 9,2 | 16,8 | 131 |
| 3 | espagne | 513,9 | 459,3 | 841,0 | 14 | 1,0 | 10,9 | 15,3 | 237 |
| 4 | france | 509,2 | 539,4 | 343,5 | 13 | 0,7 | 8,2 | 15,3 | 273 |
| 5 | mongolie | 501,5 | 566,5 | 241,5 | 10 | 2,0 | 21,3 | 14,1 | 163 |
| 6 | japon | 476,2 | 444,5 | 539,7 | 9 | 0,7 | 8,2 | 14,3 | 237 |
| 7 | zoulous | 389,3 | 357,8 | 642,0 | 9 | 0,7 | 11,0 | 11,3 | 210 |
| 8 | chine | 388,9 | 380,6 | 409,8 | 14 | 0,6 | 7,5 | 11,8 | 150 |
| 9 | arabie | 355,5 | 429,3 | 60,5 | 10 | 2,3 | 17,0 | 9,8 | 49 |
| 10 | amerique | 351,1 | 379,8 | 222,0 | 11 | 1,3 | 11,8 | 9,7 | 232 |
| 11 | inde | 322,5 | 396,4 | 27,0 | 10 | 1,7 | 12,1 | 9,2 | 57 |
| 12 | azteques | 302,6 | 332,2 | 258,2 | 15 | 1,2 | 9,9 | 8,6 | 131 |
| 13 | angleterre | 299,3 | 260,5 | 384,6 | 16 | 0,6 | 6,3 | 9,2 | 52 |
| 14 | egypte | 288,3 | 261,6 | 375,0 | 17 | 0,8 | 7,7 | 8,6 | 80 |
| 15 | russie | 280,0 | 308,7 | 194,0 | 16 | 0,6 | 6,0 | 8,4 | 96 |
| 16 | allemagne | 269,0 | 299,3 | 208,4 | 15 | 0,7 | 7,9 | 8,1 | 42 |

**Comment chaque civ marque** (composantes moyennes) : la tête du classement marque par la **science** (grèce 20,0 techs — bonus de science du trait + règle de conversion ; rome 16,8 ; espagne/france 15,3). Le milieu de table marque par l'**expansion** (arabie 2,3 villes/partie, mongolie 2,0, inde 1,7 — les traits d'expansion/d'or deviennent visibles maintenant que la conversion existe). Aucune merveille complétée en 40 parties (coût 500 vs marteaux disponibles à 150 tours) — la composante merveille est à 0 partout.

### Anomalies candidates (banc de suivi ciblé recommandé, PAS un verdict — n = 10-17 par civ)

- ⚠️ **grèce écrasante** : 698,8 vs médiane 355,5 (+97 %), et la meilleure des DEUX bras (838 en contrôle). Le trait de science + la règle de conversion (mêmes règles pour tous, mais la grèce les monetise le mieux) en font la candidate n°1 pour un banc ciblé.
- ⚠️ **Écarts Jev/contrôle à examiner** : espagne 841 (contrôle) vs 459 (Jev) ; zoulous 642 vs 358 ; à l'inverse arabie 429 (Jev) vs 60 (contrôle) et inde 396 vs 27 — Jev **sauve** les civs à expansion que le bot seul n'exploite pas. Ceux-là sont probablement des effets de siège (qui croise qui) autant que de civ.
- Aucune civ « fantôme » au sens du critère (≤ 0,5×médiane) : allemagne ferme la marche à 0,76×médiane.
- 4 vainqueurs en 40 parties, tous différents (angleterre, mongolie, grèce, allemagne) — aucune civ ne monopolise les victoires.

### Lecture qualitative (extraits)

1. **Science débloquée (partie 16, seed 1992695)** : 5 `regle_conversion` au démarrage, 59 techs complétées dans la partie, la mongolie (bot du bras Jev) lance le Vaisseau au tour 148 — `Launch` puis `Victory reason:science`. Au banc 2, personne ne complétait UNE tech.
2. **Fondation maturité-corrigée (partie 20, seed 2024371)** : la capitale Jev (p2) fondée tour 0 avec prédiction gainNet 4,8 ; relevé à 10 tours d'âge : rendement réel 9. La prédiction est conservatrice, la ville est rentable — Jev fonde, le chiffre dit pourquoi.
3. **Faisabilité (scénarios D4)** : les 4 types de victoire atteints, détectés, journalisés, mini-rapport à l'appui — et la preuve « en vrai » par les victoires science/culture naturelles du banc 3.

## 4. « Jev est-il un instrument fiable ? » (réponse honnête)

- **Ce qui est maintenant fiable** : la science (10× plus de techs qu'au banc 2, conversions journalisées, 0 illégal moteur), l'expansion (5,77 fondations Jev décidées/partie, 96 prédictions relevées et comparées), la métrique de fin (score par joueur, classement lisible, vainqueurs consignés en parallèle). Le taux de repli reste bas (7 %).
- **Biais restants connus** :
  1. La règle de conversion est la même pour tous — c'est voulu (on mesure les civs SOUS une règle commune), mais le classement dépend de cette règle. Le **bras contrôle all-bot répond en partie** : la grèce domine les deux bras, l'écart espagne/zoulous contrôle-vs-Jev montre où Jev change le jeu. Un bras « règle alternative » (ex. capitale toujours en science) quantifierait la sensibilité — pas fait ici.
  2. Le condensé Jev est filtré fog : la nation Jev joue avec moins d'information que le plan bot complet — le classement Jev d'une civ inclut ce handicap, identique pour toutes les civs.
  3. Statistique honnête (D6) : 30 parties/civ max 17 — **détection d'anomalies, pas un verdict**. grèce est une candidate solide (dominante dans les deux bras), les queues de classement (russie, allemagne, égypte) sont dans le bruit.
  4. Le score pondère ce qui existe à 150 tours ; une civ à stratégie longue (merveilles, guerre tardive) est sous-payée par ces pondérations.

## 5. 🔶 Ouverts (pour la suite)

- 🔶 **Pondérations du score** (10/2/30/100/10) : une merveille jamais complétée en 40 parties = composante morte ; le classement est en pratique villes+pop+techs+or. À recalibrer si les parties s'allongent.
- 🔶 **Facteur de maturité** : ratio moyen 0,57× (dans la cible mais conservateur) ; 52 % des fondations dans [0,5 ; 1,5]. Un facteur 0,6-0,7 centrerait mieux — GELÉ ici, à retoucher uniquement avec un mini-banc de re-calibrage (rituel ci-dessous).
- 🔶 **Seuil fonder** (0,5) inchangé depuis v3 : la motivation à fonder a survécu à la maturité, pas re-touché.
- 🔶 **Rejets fog résiduels** : ~0,25 fondation rejetée/partie (cases toujours distinctes — le colon réessaie ailleurs). Prochaine marche : prédire les fondations impossibles (villes ennemies hors de vue) via la position RÉVÉLÉE des capitales au condensé, ou accepter le coût d'un tour par reconnaissance.
- 🔶 **`siegeJev` du plan non consommé** : le harnais (hérité des bancs 1-2) pilote toujours le siège p2 — la rotation des sièges Jev du plan.json n'est pas passée à `jouerPartie`. À brancher au banc de suivi (une ligne : `engineJev: 'p'+p.siegeJev`).
- 🔶 Science bloquée R-90 en PROD (constat OR-RUSHBUY) : hors périmètre de cette mission, mais la règle de harnais V4 est un candidat de règle bot pour le serveur si Erik le veut (ce serait un changement moteur/serveur — autre mission).

## 6. Recommandation

1. **Banc de suivi ciblé** (chantier suivant) : grèce (16 parties dédiées + contrôles) pour confirmer l'écrasement, et arabie/inde pour départager effet-civ vs effet-siège (en branchant `siegeJev`). Coût estimé < 0,30 $.
2. **Rituel de calibrage à chaque retouche de règle/formule** : retouche → mini-banc 7 parties (~0,10 $) → critères §2 → gel → banc. Le trio scénarios (gratuit) + mini-banc + banc est réutilisable tel quel (`banc.mjs`, `scenarios-victoire.mjs`).
3. **Question `convertir`** (arbitrage or/science par Jev, itération future déjà préparée par `villes[].conversion` dans le condensé) — c'est le prochain pas naturel pour mesurer si Jev bat la règle fixe.

## 7. Critères d'acceptation du handoff — bilan

| # | Critère | Statut |
|---|---|---|
| 1 | ≥ 2-3 techs/empire à 150 tours (vs ~0) | ✅ 11,1 en moyenne, min 4 ; civs science en tête du classement |
| 2 | Prédictions ±50 % + ~0 rejet fog | ✅ ratio moyen 0,57× (🔶 distribution large, table dans le rapport) ; rejets fog 446 → ~0,25/partie (cases distinctes) |
| 3 | 4 types de victoire captés (journal + rapport) | ✅ 4/4 scénarios + 2 victoires naturelles (science, culture) dans le banc |
| 4 | Classement des 16 civs lisible, anomalies + caveats | ✅ §3 (grèce candidate écrasante, caveats D6 en tête) |
| 5 | Coût ≤ 1,6 $, 0 illégal, 0 changement moteur/serveur/jeu, tests verts, 0 secret | ✅ ≈ 1,43 $ cumulés ; 35/35 tests sableuse verts ; `sableuse/` seule touchée ; journaux/bancs gitignorés, aucune clé |
