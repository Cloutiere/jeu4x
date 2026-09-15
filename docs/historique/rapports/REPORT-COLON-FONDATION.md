# REPORT-COLON-FONDATION — Le Colon affiche son état « en train de fonder » dès l'ordre posé

**Chantier 2D terminé.** Décisions d'Erik du 13/09 appliquées : visuel basculé **dès l'ordre posé** (tranché 2 = A), art **fourni par Erik** (tranché 1 = B) — emplacement data-driven `colonFondation` branché avec **badge provisoire** en attendant l'asset.

**État final : 1107 tests verts (791 rules + 241 web + 75 server), typecheck 4/4, `schemaVersion` 22 inchangée, zéro diff 3D.** Validation GUI réelle en partie solo 5UUN7F (Rome) : badge visible dès l'ordre composite posé, disparition à l'annulation — visuel accepté par Erik en session (capture jointe à la conversation). **RIEN N'ÉTAIT COMMITTÉ avant le feu vert d'Erik.**

## 1. M1 — Détection (pur, testé)

`packages/rules/src/preview.ts` :
- `fondeAFinDuChemin(preview)` : vrai si l'aperçu porte une action finale `foundCity` vivante ;
- `fondateursDe(previews, owner)` : ids des unités AMIES qui fondent à la fin de leur chemin.

Dérivées de l'aperçu existant (`previewPrograms` — ordres brouillons **et chemins gelés** R-158), jamais recalculées par frame. Annulation (ordre purgé) comme consommation (résolution : fondation, fog R-158, PM insuffisants) font tomber le prédicat **sans aucun état UI dédié** — miroir du moteur. 7 tests `packages/rules/tests/colon-fondation.test.ts` (ordre avec/sans action finale, chemin gelé, annulation, consommation, filtre propriétaire).

## 2. M2 — Rendu 2D

- **Slot data-driven** : `textures.ts` charge `unite_colonFondation[+_accent].png` depuis `public/art/` → `GameTextures.colonFondation` (`null` tant que l'art manque — `optionalEntity`, même mécanique que les « PNG absents » de l'atelier ; **dès que le PNG arrive, il s'affiche sans changement de code**). Pas de placeholder cuit : l'absence EST l'état badge.
- **GameCanvas** : décision pure `etatFondationColon` (nouveau module `render/fondation.ts`, constantes 🔶 du badge incluses) ; dans `rebuildEntities`, le Colon fondateur swappe base/accent vers l'art `colonFondation` (accent teinté joueur comme le sprite de base) ou affiche le **badge provisoire** (losange ambre sur tige + point vert, au-dessus de l'écu de fortification, hors picking). Interactions intactes : sélection, flèches, fantôme, zone d'arrivée inchangées ; le marqueur ⌂ de destination réutilise `fondeAFinDuChemin`.
- 6 tests `apps/web/tests/colon-fondation.test.ts` (badge/art/bascule à l'annulation, autres unités jamais actives, cas 3D).
- Catalogue atelier : entrée `unite_colonFondation` — « Colon “en train de fonder” (état, R-158) ».

## 3. ⚠ Découverte — bug serveur préexistant corrigé (hors périmètre 2D, bloquant)

À la validation GUI : le bouton **« 1. Déplacer → 2. Fonder » était muet depuis DEPLACEMENT-PLANIFIE** — `orderOwnerError` (apps/server/src/game.ts) n'avait **pas de case `MultiStep`** : tout ordre composite était rejeté en « ordre inconnu » (l'`orderShapeError`, lui, connaissait MultiStep). Correctif : case `MultiStep` ajoutée (même possession d'unité que `Move`), validation extraite en fonction pure exportée `orderOwnerErreur` + 3 tests de non-régression dans `apps/server/tests/orderShape.test.ts`. Aucune règle R-64, aucune résolution, `orderShapeError` intouché. **C'est ce correctif, rechargé à chaud par wrangler dev, qui a rendu l'ordre composite posé par Erik en session accepté (badge visible).**

## 4. Vérification

- Suites : **791 + 241 + 75 = 1107 tests verts**, typecheck 4/4, `schemaVersion` 22, zéro diff sous `render3d/`.
- GUI solo 5UUN7F : ordre 1 case + fonder → badge visible immédiatement (état `fondBadge:v` vérifié dans la scène Pixi, capture validée par Erik) ; annulation → l'aperçu tombe, badge caché (déterminisme garanti par les tests M1/web ; les captures finales ont été abandonnées sur demande d'Erik, validation visuelle faite en session) ; partie existante reprise sans erreur (reconnexions ws multiples pendant la session).
- Fichiers touchés : `packages/rules/src/preview.ts`, `apps/web/src/lib/render/{textures.ts,GameCanvas.svelte,fondation.ts}`, `apps/web/src/lib/atelier/catalogue.ts`, `apps/web/src/lib/render3d/optionB.ts` (champ `colonFondation: null` du littoral de textures factices — typecheck), `apps/server/src/game.ts`, 3 fichiers de tests.

## 5. Reste pour Erik

- Fournir l'art `public/art/unite_colonFondation.png` (+ `_accent`) — via le pipeline `generate.py`/`sync-art` ; il prendra la main sur le badge **sans changement de code** (fiche dans l'atelier, catégorie Sprites 2D).
