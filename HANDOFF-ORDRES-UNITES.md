# HANDOFF-ORDRES-UNITES — Vendre, Soigner, Vigilance, Passer + raccourcis clavier

**Décisions Erik 06/10** (tranchés D1-D7 présentés, veto possible). Nouveaux ordres d'unité + raccourcis clavier ; **fortifier ne soigne plus**.

## 1. Préalables

- Lire RULES.md §6 (mouvements/ordres), §7 (R-71 pas de soin post-combat), §9 Phase D (vision/soins/PM — le taux de soin actuel), R-122/R-149 (gouvernements, traits), R-162 (rayon culturel — territoire), R-135 (coûts/rush — base de la vente) ; leçon : **valider `orderShapeError` AVANT tout** ; motif des ordres récents (QueueProduction, SetGovernment).
- Baseline : suites vertes (rules 999 + web 582 + server 120), `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 06/10 — non négociables)

- **Vendre** : ordre `SellUnit` — 50 % du coût de production effectif (traits compris, base R-135/rush) en or, unité détruite, événement + Chroniques. Interdits : à bord d'un transport ; interdiction supplémentaire éventuelle (siège/combat en cours) à consigner.
- **Soigner** : ordre `Heal` — immobile, soigne au taux actuel (R-71 inchangée : pas de soin après combat) **jusqu'à PV complets** puis l'ordre se termine (unité sans ordres). **Interdit en territoire ennemi** = dans les anneaux culturels ennemis (rayon R-162, évalué à la pose ; évolution ultérieure du territoire : soin continue 🔶).
- **Fortifier** : bonus défensif inchangé, **plus AUCUN soin** (ni fortifié ni oisif) — le soin exige `Heal`.
- **Vigilance** (`Sleep`) : passe ses tours ; **réveil dès qu'un ennemi devient visible** → unité sans ordres + toast.
- **Passer** (`Pass`) : inerte ce tour ; « sans ordres » au tour suivant.
- **Raccourcis** : F (Fortifier) / H (Soigner) / S (Vigilance) / Z ou Espace (Passer) / B (Fonder — ordre existant, validation inchangée) sur l'unité sélectionnée ; **ignorés pendant une saisie texte** (chat futur) et sous modale ouverte ; hints clavier dans le panneau unité (boutons libellés « Fortifier (F) » etc.).
- **D7 `schemaVersion`** : migration uniquement si la sérialisation l'exige (ex. ordre gelé à bord) — justifiée au rapport sinon inchangée.

## 3. Mission

- **L1 — test-first (moteur)** : suite `ordres-unites.test.ts` : `orderShapeError` pour chaque nouvelle forme (EN PREMIER) ; vente (or = 50 % coût effectif traits compris, destruction, refus à bord) ; soin (jusqu'à PV complets puis terminaison, refus en territoire ennemi, R-71 préservée) ; fortifier sans soin (régression : plus de PV gagnés, défense inchangée) ; vigilance (réveil à la visibilité ennemie) ; passer (inerte 1 tour) ; fog (réveil seulement sur ennemi VISIBLE) ; barbares hors scope.
- **L2 — moteur** : les 4 ordres (Phase C + Phase D), événements (UnitSold, heal terminé — noms au choix, filtrage fog standard), labels journal/melee/labos.
- **L3 — serveur** : validation `orderShapeError` mise à jour, protocole (formes seulement).
- **L4 — client** : boutons du panneau unité + hints, raccourcis D6 (un seul gestionnaire central, guards saisie/modale), retours visuels (vende = l'unité disparaît + toast or ; vigilance = icône état sur le sprite, motif existant des états), Chroniques branchées.
- **L5 — vérification GUI locale avec captures AVANT commit** : partie solo légale — chaque ordre + chaque raccourci au clavier, vente avec trésorerie vérifiée au dump, soin jusqu'à guérison sur plusieurs tours, réveil par apparition ennemie. Captures `dev-logs/captures-ordres-unites/`.
- **L6** : suites vertes complètes + typecheck, RULES.md (§6 ordres + §9 soins — fortify sans soin, nouvelle règle par ordre), commit, push, rapport `REPORT-ORDRES-UNITES.md`.

## 4. Critères d'acceptation

1. Les 5 raccourcis marchent sur l'unité sélectionnée, hints visibles, jamais pendant une saisie ;
2. Vendre crédite 50 % (dump serveur) et retire l'unité ;
3. Soigner guérit jusqu'à PV complets puis libère l'unité ; refus net en territoire ennemi ;
4. Fortifier ne soigne plus (régression verrouillée) ;
5. Vigilance réveille à la vue ennemie ; Passer inertie 1 tour ;
6. Suites et bancs verts, `schemaVersion` justifiée.

## 5. Périmètre interdit

Valeurs de combat/soin existantes (taux R-71 inchangé), rush-buy, gouvernements, tout le 3D, le chat (saisie = simple guard).

## 6. Fin de session

Rapport (formes d'ordres, décision migration, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
