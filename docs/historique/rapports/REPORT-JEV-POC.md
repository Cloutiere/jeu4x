# REPORT-JEV-POC — Preuve de concept : une partie Jev contre le bot

> Mission exécutée selon `HANDOFF-JEV-POC.md` (décision d'Erik du 28/09). **Rien n'est committé** — L4 = arrêt pour approbation. La clé a été transférée dans `sableuse/.env.local` (gitigné) et `jev.txt` supprimé ; aucun secret au dépôt.

## Verdict en une phrase

**Le chemin complet « Jev pilote une nation » fonctionne de bout en bout** : 51 tours joués contre le bot pour **0,0022 $** (plafond 2 $, budget Erik 5 $), latence médiane **168 ms** par tour, **0 ordre illégal** sur les 30 tours où Jev a eu confiance — mais avec ce premier jeu de questions minimal, Jev n'a produit qu'UN type de décision (produire des colons), n'a jamais voulu fonder ni attaquer, et s'est mis en repli bot les 21 premiers tours.

## 1. Sonde (D2)

- Le nom du SDK du doc est faux : `typesafe-sdk` sur npm est un **placeholder vide** (v0.0.0, aucun fichier). Le vrai package est **`@typesafe-ai/sdk`** (v0.6.0, MIT, éditeurs `@typesafe.ai` — allie/diogo149). Endpoint et alias du doc corrects : `https://api.typesafe.ai/v1/systemone`, modèle `jev-latest`.
- Sonde réussie : clé acceptée, les 4 primitives (Choice/Score/2×Noul) en **un seul appel**, 365 ms, 477 jetons d'entrée, ≈ 0,00002 $.

## 2. Architecture de la sableuse (D1, D4, D6, D8)

`sableuse/` est un **projet npm autonome hors workspace** (zéro effet sur turbo/CI/builds) ; il consomme `@game/rules` en dépendance `file:` (source TS, comme le serveur) et `botPolicy` **tel quel** via import relatif — zéro modification du dépôt existant.

| Fichier | Rôle |
|---|---|
| `src/partie.mjs` | Harnais headless : génération mirror1v1 → boucle botPolicy (base pour TOUS) + overrides Jev (nation p2) → actions immédiates → `resolveTurn` → victoire/plafond. Comptage des ordres rejetés par vérification post-résolution. |
| `src/condense.mjs` | D6 : état filtré fog (`getFilteredState`) → condensé JSON (économie, unités, ennemis visibles, menaces, candidats fondation/attaque **pré-calculés** — zéro arithmétique laissée à Jev). Moy. 742 octets, max 1 064 (≪ 2 000 jetons visés). |
| `src/adapter-jev.mjs` | D4/D5 : 1 appel/tour (dispersion spéculative), routage à seuil (confiance < 0,65 → repli bot), traduction en ordres (fusion : l'override Jev remplace TOUS les ordres bot de même sujet). |
| `src/faux-jev.mjs` | D8 : faux client déterministe (hash de l'état → réponses plausibles), zéro appel — tout le développement du sérialiseur et les 7 tests sont gratuits. |
| `src/journal.mjs` | D7 : JSONL (`meta`/`tour`/`decision`/`evenement`/`motif`/`rejets`/`fin`) + compteur de coût ($0,042/M jetons d'entrée) + garde-fou 2 $. |
| `src/rejouer.mjs` | L3 : rejoue les `motif` du journal → même fin. Vérifié sur le journal RÉEL : `identique:true`. |
| `questions.json` | D5 : les 4 questions + seuils — éditables par Erik sans toucher au code. |

## 3. Métriques de la partie POC (seed 20260928, plafond 50 tours, mirror1v1 40×40)

| Métrique | Valeur |
|---|---|
| Tours joués | 51 (plafond atteint, pas de vainqueur — les deux empires croissent sans contact) |
| Coût total réel | **0,0022 $** (52 115 jetons d'entrée, 51 appels) |
| Latence / tour | médiane **168 ms**, p95 1,5 s, **max 9,8 s** (un pic — voir 🔶), moy 403 ms |
| Ordres illégaux (rejets) | **0** sur 30 tours d'override (après 2 bugs du harnais corrigés — voir §5) |
| Replis bot (confiance < 0,65) | 21/51 — **exactement les tours 1 à 21** |
| Distributions plates (directive n°3) | 0 |
| Durée murale | 21 s |

## 4. Décisions commentées (extraites du journal `sableuse/journaux/partie-20260928-*.jsonl`)

1. **Tour 1 — repli** : condensé 492 octets (1 ville, 1 unité, 0 ennemi, **0 candidat de fondation** — le fog est minuscule). Jev répond « économique » mais confiance **0,52 < 0,65** → repli bot intégral, consigné.
2. **Tour 21 — dernier repli** : même tableau, confiance 0,44. Pendant 21 tours l'empire est trop petit pour que Jev tranche avec assez d'assurance : c'est LE signal d'état insuffisant attendu par la directive n°3, pas un bug du client.
3. **Tour 22 — premier override** : confiance 0,77, posture « économique » → ordre traduit `SetProduction c2 colon`, exécuté sans rejet. À partir d'ici Jev pilote la production de la capitale **29 tours sur 30** (toujours « colon »).
4. **Tour 45 — régime de croisière** : confiance 0,93 ; Jev refuse systématiquement de fonder (noul fonder ∈ [0,40 ; 0,57], seuil 0,70) et d'attaquer (noul ≤ 0,16 ; menace moyenne 0,01 — correct : aucun contact en 50 tours). Résultat honnête : sur une partie sans guerre, la seule décision qui comptait était la production, et Jev a toujours choisi l'expansion économique.

## 5. Deux bugs du HARNUIS découverts et corrigés en cours de route (jamais du moteur)

- `pasVers` ignorait l'occupation allié (`tileKey(u)` appelé avec un hex au lieu de `(q, r)`) → 51 ordres de mouvement rejetés sur la seed 777 (faux client). Corrigé → 1 seul rejet résiduel puis 0.
- La fusion d'override ne remplaçait qu'UN des deux `SetProduction` que `botPolicy` émet parfois pour la même ville (le dernier gagne côté moteur) → l'override Jev était masqué. Corrigé (remplacement de toutes les occurrences du sujet).

## 6. Fiche de suffisance d'information (question par question — cahier des charges du futur jeu de questions)

| Question | Constat | Verdict |
|---|---|---|
| `posture` (Choice) | 4 options ; Jev a toujours répondu « économique » avec confiance 0,44→0,97. Sur cette partie sans contact, les 4 postures n'étaient pas départageables — l'état ne décrit ni croissance comparée ni opportunisme militaire. | 🔶 Ajouter au condensé : rendements/tour par ville, file de production courante, coût des items candidats, ratio de puissance avec le rival CONNU. |
| `menace` (Score 0-3) | Score ≈ 0 tout du long — correct (aucun ennemi vu) mais jamais testé en vrai. | À re-tester sur une partie avec contact (guerre déclarée dès le départ ? seed avec barbares proches ?). |
| `fonder` (Noul) | **0 candidat présenté pendant les 21 premiers tours** (fog trop petit : `sitesFondation` ne voit que l'exploré) → Jev refuse logiquement (noul ≤ 0,57). Une fois 5 candidats visibles (tour 45+), il refuse ENCORE (≤ 0,49) : la question ne décrit pas le bénéfice d'un site (pas de comparaison « valeur du site vs croissance de la capitale »). | 🔶 Inclure la valeur des 2-3 meilleurs candidats dans l'instruction/état ; sinon la question reste indécidable. |
| `attaquer` (Noul) | Jamais déclenché (seuil noul ≥ 0,80 ET menace ≥ 2). Jamais stimulé en 50 tours sans contact. | Idem menace : à re-tester avec contact. |

## 7. Recommandation

**Continuer vers la sableuse de calibrage** — les fondations (coût, latence, détermisme, journal, rejouabilité) sont validées et très loin des plafonds. Mais AVANT le banc 5 nations, un petit chantier de calibrage s'impose :

1. **Enrichir le condensé** (rendements/tour, coûts, comparaison des candidats) — c'est la cause racine des 21 replis et du choix monotone.
2. **Concevoir les questions sérieuses après les faits** (esprit D5) : la partie complète d'Erik sur le journal réel est la matière première.
3. **Re-tester menace/attaque avec une partie à contact forcé** (guerre immédiate ou barbares agressifs).

## 8. Points 🔶 (à vetoer)

- **Carte 40×40 mirror1v1** au lieu du « 20×20 » exemplifié par le handoff : `progen` clampe `libreLargeur` à ≥ 30 et mirror1v1 est fixé 40×40 (config la plus testée à 2 sièges). Le coût par tour étant indépendant de la carte, l'impact est nul sur le POC.
- **Jev en override du bot** (D4 assumé) : le plan bot sert de base garantie-légale, Jev remplace par domaine. C'est un pilote « partiel » — suffisant pour valider le chemin, à assumer si on veut un pilote intégral ensuite.
- **Pic de latence 9,8 s** sur 1 appel (p95 à 1,5 s) : sans impact à 1 appel/tour, à surveiller pour le banc (parallélisme).
- **Aucune tech complétée en 51 tours** par AUCUN des deux joueurs : le bot re-tire sa recherche au hasard chaque tour (`pickResearch`, R-85) et disperse sa science. Comportement du bot existant, pas du POC — signal utile pour le calibrage futur.
- **Faux positifs de mesure écartés** : un rejet n'est compté que si l'ordre n'a eu AUCUN effet visible (position inchangée, pas d'événement, file de production inchangée ET item non produit).

## 9. Critères d'acceptation

1. ✅ Partie complète terminée (plafond), journal JSONL exploitable (`sableuse/journaux/partie-20260928-*.jsonl`, gitigné, local).
2. ✅ Coût 0,0022 $ ≤ 2 $ ; latence compatible avec des centaines de parties (médiane 168 ms).
3. ✅ Taux d'ordres illégaux : **0** — documenté (les replis 21/51 sont de la confiance, pas de l'illégal).
4. ✅ Zéro secret au dépôt (`jev.txt` supprimé, `.env.local` gitigné vérifié) ; zéro changement moteur/serveur/protocole (tests 906 + 116 + 116 verts, typecheck 0 erreur, `git status` du dépôt existant inchangé par la sableuse) ; `jev.txt` supprimé après transfert.

## 10. Tests de la sableuse

7/7 verts (`npm test` dans `sableuse/`) : partie complète déterministe même seed → même fin (R-80), fin par victoire/plafond, garde-fou budget, journal bien formé, traduction fonder (Move/FoundCity), repli à confiance < 0,65, rejouabilité depuis le journal.
