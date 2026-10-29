# HANDOFF-GOD-MODE — Révéler toute la carte (outil d'observation des bots)

**Décisions Erik 22/10** (tranchés D1-D5 présentés — veto possible). Ctrl+J+W bascule un « god mode » : l'entièreté de la carte visible pour observer le comportement des bots.

## 1. Préalables

- Lire le filtrage fog (`getFilteredState`, eventRefs — R-73), le protocole des messages client→serveur (formes validées — leçon `orderShapeError` : VALIDER LE VALIDATEUR DU GameDO pour le nouveau message), les flags de session GameDO (miroir `meta`, hors état moteur), le gestionnaire central de raccourcis (ORDRES-UNITES, gardes saisie/modale), le calque dev (précédent d'outils cachés).
- Baseline : suites vertes à jour, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 22/10 — non négociables)

- **D1 — Solo/bots uniquement** : le message `ToggleGodMode { on }` est REFUSÉ si un autre humain est dans la partie (validation serveur) — jamais dans un 1v1 humain.
- **D2 — Révélation complète** : flag de session GameDO (hors état moteur — aucune migration) ; quand actif, le filtrage fog de CETTE session ne filtre plus (état + événements en direct). L'historique passé (Chroniques, relecture pré-état capturé avant activation) reste tel quel.
- **D3 — Ctrl+J+W** : le combo bascule (client → message serveur → confirmation par le retour d'état) ; bandeau discret « GOD MODE » (AAA or-sur-sombre) tant que c'est actif ; gardes habituelles du gestionnaire de raccourcis.
- **D4 — Persistance de session** : le flag survit à la reconnexion (persisté côté GameDO) ; relecture du dernier tour dans le mode courant ; déconnexion/reconnexion = même état.
- **D5 — Réversible et sans trace** : désactiver = brouillard exact reconstitué ; rien dans l'état moteur, rien dans le motif de partie, aucun avantage persistant.

## 3. Mission

- **L1 — test-first (serveur)** : le message refusé avec un humain adverse ; accepté en solo/bots ; le filtrage contourné quand actif (état ET événements) et exact quand inactif ; persistance de reconnexion ; `orderShapeError` du message (EN PREMIER).
- **L2 — serveur** : message + flag de session + branchement filtrage.
- **L3 — client** : combo Ctrl+J+W, bandeau, envoi/réconciliation (état serveur = source de vérité : le client n'active jamais localement).
- **L4 — captures GUI avant commit** (`dev-logs/captures-god-mode/`) : solo — bascule ON (toute la carte, bots visibles), OFF (brouillard exact), bandeau ; reconnexion avec état conservé.
- **L5** : suites vertes (server + web), typecheck, commit, push, rapport `REPORT-GOD-MODE.md`.

## 4. Critères d'acceptation

1. Ctrl+J+W bascule la révélation complète en solo/bots, avec bandeau ;
2. Refus propre avec un humain adverse ;
3. Reconnexion = état conservé ; OFF = brouillard exact ;
4. Suites vertes, `schemaVersion` 27.

## 5. Périmètre interdit

État moteur et motif de partie ; le filtrage fog pour les AUTRES joueurs (le flag est strictement personnel à la session) ; tout le 3D ; Chroniques passées ; `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
