# HANDOFF-BOT-FONDATION-MOUVEMENT — Le bot ne gèle plus ses unités au tour de la fondation

**Observation Erik 24/10** : au premier tour (cartes à départ Colon), le guerrier du bot reste immobile — il attend la fondation de la capitale. Cause : la branche « fonder SA capitale » de `botPolicy.ts` (~337) émet `FoundCity` puis **retourne prématurément**, sans ordres pour les autres unités.

## 1. Préalables

Baseline : suites vertes à jour, `schemaVersion` 27, **serveur seul**. Lire la branche fondation de `botPolicy.ts` et ses tests. Vérifier `git status`.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Fondation ET ordres** : la branche fondation émet `FoundCity` PUIS poursuit l'assignation d'objectifs pour TOUTES les autres unités (le guerrier patrouille/bouge dès ce premier tour — miroir BOT-EXPLORATION). La fondation reste la PREMIÈRE priorité (jamais de mouvement du colon fondateur).
- **D2 — Aucune autre exception du même genre** : vérifier qu'aucun autre `return` prématuré du bot ne gèle des unités inutilement (audit des sorties anticipées, consigné au rapport).

## 3. Mission

- **L1 — test-first** : fixture départ colon + guerrier : l'ordre `FoundCity` ET un ordre de mouvement du guerrier sont émis AU MÊME tour (le guerrier en patrouille BOT-EXPLORATION) ; même seed ⇒ mêmes ordres.
- **L2** : correction D1 + audit D2.
- **L3 — banc** : bancs bot solo verts ; capture god mode `dev-logs/captures-bot-fondation/` (t1 : le guerrier bouge déjà).
- **L4** : suites vertes, typecheck, commit, push, mini-rapport `REPORT-BOT-FONDATION-MOUVEMENT.md`.

## 4. Critères d'acceptation

Le scénario d'Erik : au premier tour, la capitale est fondée ET le guerrier bouge déjà.

## 5. Périmètre interdit

Tout le reste du bot (T-B/T-C), `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
