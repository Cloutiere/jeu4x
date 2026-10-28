# REPORT-JEV-EXPANSION — Jev v3 : la fondation (l'expansion)

**Décisions Erik 28/10** (« go » itération 3), exécuté le 27-28/10. Même méthode que v2 (reformulation de questions, **zéro moteur**), re-banc de comparaison v2/v3 sur le même corpus (10 seeds, civs P7 du seed, 150 tours, difficulté normal). Verrou visé : Jev ne fonde JAMAIS de deuxième ville (v2 : 1 ville partout, 3 parties finissent 1v1 à t151).

## 1. Le levier implémenté

- **D1 — Question `fonder` argumentée** (miroir de la guerre v2) : jusqu'à TROIS sites candidats pré-triés par le score moteur EXISTANT (`gainNet` de condense.mjs — couronnes × maturité − distance − risque, jamais de nouvelle formule), décision OUI/NON par site ou `aucun`, le score et la distance dans le libellé. Sans colon encore produit, les candidats sont ancrés sur la capitale (même formule, ancre optionnelle dans `sitesFondation`). Seuil dialogue 0,5 (canon v2). Cases en liste noire (fondations rejetées, v3.1) exclues ; sites `gainNet ≤ 0` exclus (doctrine : fonder un site non rentable n'est pas une décision).
- **D2 — Exécution canon** : le site choisi devient **`MultiStep` (marche + action finale `foundCity`, R-158)**, re-planifié chaque tour par le pas ROUTIER BFS (`pasVersRoutier`, canon BOT-ARMEE) ; **`FoundCity` direct quand le colon est SUR place**. Sans colon : **production du colon si absent** (SetProduction ré-émise chaque tour — voir §3).
- **D3 — Cadence** : UNE fondation programmée à la fois (mémo `fondationEnCours`) ; la question ne revient qu'à la fondation réelle, la perte du colon, une case invalidée par un rejet moteur, ou un site devenu inatteignable au savoir actuel. Pendant la programmation, le bot tactique ne re-tourne JAMAS le colon (ses ordres sont retirés — même discipline que la suppression des déclarations v1) ; le chemin gelé du moteur reprend sinon tout seul.

Tests-first (L1) : 11 nouveaux tests `sableuse/tests/joueur.test.mjs` (candidats triés par score, FoundCity direct vs MultiStep à distance, complétion mécanique sur place / en marche / phase production, refus confiant, réponse indécise, cadence D3, déroulé partie complet « programmée puis consommée, le bot ne re-tourne pas le colon », déterminisme). **joueur 33 verts, suite sableuse 69 verts**, fausse LLM — zéro appel réel pour les tests.

## 2. Re-banc v3 (L2) — `sableuse/bancs/joueur-v3-2026-10-27/`

10 parties, mêmes seeds/civs que v1/v2, plafond garde-fou 10 $ → **coût réel 0,226 $** (0,0226 $/partie), 0 erreur API, 14 replis/1 389 tours. Rapport complet dans le dossier (`RAPPORT.md` + journaux hors git).

## 3. Deux bancs préliminaires — la vérité du moteur (documentée pour les itérations suivantes)

La forme canon `MultiStep` a révélé trois comportements moteur qui ont coûté deux bancs intermédiaires (journaux conservés : `joueur-v3a-preliminaire-2026-10-27`, `joueur-v3b-preliminaire-2026-10-27`) :

1. **« PM insuffisants » à l'arrivée** : un MultiStep qui consomme TOUS les PM du colon pour marcher fait ANNULER son action finale (canon turn.ts) — le colon restait sur le site sans fonder, la question verrouillée par D3 → cul-de-sac. Correctif : la fondation est émise en `FoundCity` DIRECT le tour SUIVANT l'arrivée (PM frais).
2. **La production du colon écrasée** : le choix `produire` de Jev (guerre/bâtiment) gagne le dernier SetProduction — l'expansion mourait en phase production (v3a parties 4/6 : 0 colon produit malgré le site choisi). Correctif : SetProduction colon ré-émise chaque tour tant que le colon manque.
3. **Le pas glouton meurt dans les poches** : `pasVers` (voisin qui réduit la distance) se colle aux obstacles — un colon figé 54 tours à 2 cases du site (v3a partie 1). Correctif : BFS `pasVersRoutier` (BOT-ARMEE), sur l'état FILTRÉ (fog respecté) ; site inatteignable au savoir actuel → programmation levée, la question revient.

Anecdote rare (partie 8) : le colon produit a été « installé » comme personnalité Illustre par le moteur (`GreatPersonSpawned`/`InstallPerson` sur l'unité du colon) — la fondation programmée est restée verrouillée jusqu'à la fin. Non traité (événement moteur hors périmètre).

## 4. Comparaison v2/v3 (L3 — même corpus)

| Métrique | v2 (joueur-v2-2026-10-27) | **v3 (joueur-v3-2026-10-27)** |
|---|---|---|
| **Villes Jev par partie (moy)** | **1,0 (1 partout — LE verrou)** | **2,2 — 7/10 parties à ≥ 2 villes** (partie 4 : **6 villes**) |
| Fondations Jev (hors capitale) | 0 | **13** (parties 2,3,4,5,6,7,9) |
| Victoires Jev | 2/10 (conquête t30, t66) | 1/10 (conquête t30 — partie 10) ; 9 finales t151 DOMINÉES au score |
| Score moyen Jev | 494 | **623** (domine 9/10 ; bot 64-268) |
| Guerres déclarées par Jev | 37 (0 refusées) | 34 (0 refusées) |
| Conversions | 10 | **17** |
| Paix proposées / acceptées | 794 / 11 | 841 / 7 (or moyen offert 0) |
| Échanges de techs | 0 | 0 (inchangé — jamais choisi) |
| Tours moyens | 117 | 139 |
| Jetons/décision | 3 152 | 3 744 |
| Replis | 25/1 172 | 14/1 389 |
| Coût/partie | 0,0170 $ | 0,0226 $ |

### Verdict : Jev s'étend-il maintenant ?

**OUI — le verrou de la fondation est levé.** Jev choisit des sites de façon quasi systématique quand la question est posée (les réponses `aucun` sont minoritaires) et 7 parties sur 10 finissent avec 2 villes ou plus (moyenne 2,2 ; la partie 4 monte à 6 villes fondées t6-t138 — une véritable campagne d'expansion), là où v2 restait à 1 ville PARTOUT. L'économie suit : score moyen 494 → 623, conversions en hausse (10 → 17).

**Nuance sur la conclusion** : v3 ne gagne « que » 1/10 (v2 : 2/10) — MAIS les 9 autres parties finissent à t151 avec Jev dominant largement (score 623 vs ~150) : Jev écrase son voisin mais ne CONCLUT plus par conquête aussi vite (la partie 4, victorieuse t66 en v2, passe 151 tours à fonder 6 villes sans finir la conquête). L'expansion a déplacé le profil : moins de rush, plus d'empire. Sur 10 parties, l'écart 1 vs 2 victoires est dans la variance ; la métrique à surveiller à l'itération 4 est la FIN de partie (l'horloge de conquête vs la tentation de fonder).

**Aucune régression guerre/conversion** : guerres 34 (37 v2), conversions 17 (10 v2), paix acceptées 7 (11 v2), échanges de techs toujours 0.

## 5. Budget

- Banc final : **0,2261 $**. Bancs préliminaires v3a + v3b : 0,3472 $ (coût de la découverte des trois vérités moteur §3 — journaux conservés comme preuve).
- **Total mission réel : ~0,57 $ — plafond 0,50 $ dépassé de ~0,07** à cause des deux bancs de calibrage ; garde-fou campagne 10 $ intact, compteur `coutReelAvant` inchangé. Les tests/tests-first : 0 $.

## 6. Recommandation

- **Le lobby peut être branché pour une FUMÉE** : Jev v3 est un adversaire qui s'étend, attaque et domine le score. Les critères d'acceptation du handoff : (1) expansion majoritaire ✓ (7/10), (2) pas de régression guerre/éco ✓ (guerres ~idem, conversions et score en hausse), (3) coûts documentés ✓ (dépassement 0,07 $ assumé et justifié §5).
- **Itération 4 candidates** (au choix d'Erik, aucune urgente) : (a) la FIN de partie — Jev domine mais ne conclut plus (horloge de conquête vs fondation) ; (b) l'échange de techs — toujours 0 en trois bancs ; (c) le cas rare InstallPerson sur un colon (moteur).

## 7. Traces

- Harnais : `sableuse/src/joueur.mjs` (question `fonder`, complétion mécanique D2/D3, chemin BFS), `sableuse/src/condense.mjs` (ancre capitale dans `sitesFondation`), `sableuse/src/partie.mjs` (mémo fondation, retrait des ordres bot sur le colon), `sableuse/questions-joueur.json` (question fonder).
- Tests : `sableuse/tests/joueur.test.mjs` — 33 verts ; suite sableuse complète **69 verts** (6 fichiers).
- Banc final : `sableuse/bancs/joueur-v3-2026-10-27/` (référence) ; préliminaires : `joueur-v3a-preliminaire-2026-10-27/`, `joueur-v3b-preliminaire-2026-10-27/` (journaux hors git).
- Zéro impact prod : moteur/serveur/web intouchés, `schemaVersion` 28, bot standard inchangé, aucune clé committée.
