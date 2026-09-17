# HANDOFF-LABO-ENGAGEMENT — Scories d'engagement + laboratoire ouvert pour tester les règles à 5 nations

**Chantier outil + nettoyage** (chapitre 2D). Trois volets pour Erik : (1) régler les deux scories d'ENGAGEMENT trouvées par l'audit du pilotage, (2) ouvrir le **laboratoire d'engagement** (`#/labo-combat`) avec le rendu des nouvelles règles (stabilité, mêlée, expulsion) prêt pour ses tests, (3) **étendre le labo à 5 nations + barbares** pour simuler des configurations multi-joueurs.

## 1. Préalables

1. Lire `REPORT-ENGAGEMENT.md` (R-173..R-183, arbitrages Q1-Q10/D1-D4, R-176a et R-178 rév. A), `REPORT-COMBAT-COMPORTEMENTS.md` (état avant, en historique), `#/labo-combat` (le labo a déjà été adapté en session ENGAGEMENT — vérifier l'état).
2. Baseline : suite verte (**1196 tests**), typecheck 4/4, `schemaVersion` **25**, `git status` propre.
3. **Zéro gameplay** : M1 est du nettoyage mort (aucun comportement), M2/M3 sont du labo — le moteur et le serveur de jeu ne changent PAS.

## 2. Mission

### M1 — Les scories d'ENGAGEMENT (audit pilotage 17/09)
1. `packages/rules/src/turn.ts` : supprimer la fonction morte `applyRetreat` (plus aucun appelant) ;
2. Rafraîchir les commentaires périmés de `turn.ts` qui racontent l'ancien contrat (« repli R-54 applicable », « assaut de la pile R-96 », « mort du dernier barbare de la pile »…) — ils dangereux pour le prochain lecteur ; les remplacer par le contrat ENGAGEMENT (R-173..R-183) ;
3. **NE PAS toucher** au type d'événement `Retreat` ni à sa lecture UI/labos (lecture des journaux anciens — dégradation gracieuse voulue) ;
4. Suite verte : aucun changement de comportement attendu (si un test tombe, un comportement vivait encore — STOP et consigner).

### M2 — Le laboratoire d'engagement, prêt pour les tests d'Erik
1. Vérifier/compléter le rendu labo des nouvelles règles : statut **stable/instable** visible par case (unité stabilisée vs cohabitation), événements de **mêlée** (Phase E), **expulsions**, **coup en passant** (R-176a), **report de mêlée** (R-178 rév. A) bien lisibles dans le journal 4 sections ;
2. L'icône/badge « Instable » côté carte (léger, calibrage 🔶) — Erik doit voir d'un coup d'œil ce qui va se battre ;
3. Fournir à Erik le mode d'emploi express en fin de session (route, pose, programmation J1/J2, seed, lecture du journal).

### M3 — Cinq nations + barbares (labo seulement)
1. **Investigation d'abord** : le moteur pur gère-t-il N propriétaires (> 2) dans l'état de labo ? Identifier toute hypothèse « 2 joueurs » (victoires, opposition, teintes, ordres par joueur) et la contourner CÔTÉ LABO uniquement (pas de changement moteur sans signaler au rapport) ;
2. Étendre le sélecteur de pose et la programmation à **5 joueurs + barbares** (J1..J5) : teintes d'accent distinctes (la palette J1-J7 existe côté assets — s'y appuyer), onglets de programmation par joueur, journal nommant chaque joueur ;
3. Barbares inchangés (leur régime R-183 s'applique, indépendant du nombre de nations) ;
4. **Limiter au labo** : rien de ceci ne touche la création de parties réelles (1v1 en prod inchangé) ;
5. Tests : pose/programmation/résolution à 5 nations, mêlée à 3+ propriétaires (le tirage pondéré R-180 avec plus d'intervenants), expulsion multi-camps.

## 3. Vérification

- Suite verte forcée, typecheck 4/4, `schemaVersion` 25, zéro diff serveur et 3D (M1 touche `turn.ts` : commentaires + fonction morte seulement) ;
- e2e GUI (captures `dev-logs/captures-labo-engagement/`) : scénario 5 nations avec mêlée à 3 propriétaires, statuts stable/instable visibles, journal complet lisible.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-LABO-ENGAGEMENT.md` (y compris : le verdict N-joueurs du moteur, les contours labo-only), commit/push sur demande explicite d'Erik, arrêt, remise de la main — et **le labo ouvert pour qu'Erik teste immédiatement**.
