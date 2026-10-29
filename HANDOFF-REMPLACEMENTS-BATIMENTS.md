# HANDOFF-REMPLACEMENTS-BATIMENTS — Les « remplacements » (Banque/Cathédrale/Université) sont inconstructibles

**Signalement Erik 06/10** : Bibliothèque construite + tech Université connue → l'Université n'apparaît pas dans le menu. Cause trouvée par le pilot : le filtre du menu INVERSE le sens de `replaces`, et le moteur ignore le champ à la complétion.

## 1. Préalables

- Lire RULES.md R-111 (remplacement), R-66 (bâtiments) ; `packages/rules/src/data/buildings.json` : **3 paires** — `banque` (requires+replaces `marche`), `cathedrale` (requires+replaces `temple`), `universite` (requires+replaces `bibliotheque`).
- Diagnostic (à confirmer) : `apps/web/src/lib/productionMenu.ts:100` — `if (b.replaces && ctx.buildings.includes(b.replaces)) continue;` retire du menu le bâtiment quand on possède EXACTEMENT son prérequis (sens inversé). Et `grep replaces packages/rules/src/*.ts` ne montre AUCUN usage moteur : à la complétion, l'ancien bâtiment reste (multiplicateurs empilés ?). Vérifier aussi `canSetProduction`/`orderShapeError` côté moteur et les autres usages du même motif client (`CityView.svelte`).
- Baseline : suites vertes à jour, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Sens correct de `replaces`** : un bâtiment qui en remplace un autre est proposé **PRÉCISÉMENT quand le remplacé est présent** (c'est son prérequis — champ `requiresBuilding` redondant mais cohérent) ; le remplacé disparaît du menu au profit du remplaçant.
- **D2 — Moteur : complétion = remplacement réel** : à la complétion, le bâtiment remplacé est RETIRÉ de `city.buildings` (R-111 — les multiplicateurs ne s'empilent pas : Université ×4 sans la Bibliothèque ×1,5). Événement existant `BuildingCompleted` inchangé (l'entrée Chroniques mentionne le remplacement si trivialement possible).
- **D3 — Cohérence moteur** : `canSetProduction` accepte le remplaçant dès que le prérequis est présent (aligné sur D1) ; le refus nommé `ProductionRefused` couvre le cas « remplacé requis absent ».
- **D4 — Interactions préservées** : Cathédrale ↔ Arche d'Alliance (`templesVersCathedrales` — la ville avec Cathédrale est déjà sautée), Banque ↔ multiplicateurs or (miroir C10), traits de coût (`coutBuildingMoitie`).
- **D5 — `schemaVersion` 27 inchangée** : comportement de complétion, aucun champ nouveau ; parties en cours : une paire éventuellement coexistante (impossible aujourd'hui — le menu refusait) ne se corrige pas rétroactivement.

## 3. Mission

- **L1 — test-first** : menu — Université proposée avec Bibliothèque (et proposée grisée/consignée sans), Banque avec Marché, Cathédrale avec Temple ; moteur — complétion de l'Université retire la Bibliothèque (science ×4 seule), idem Banque/Cathédrale ; `canSetProduction` aligné ; Arche d'Alliance non régressée ; refus nommé sans prérequis.
- **L2 — moteur + client** : D1/D2/D3 (les 3 chaînes).
- **L3 — vérification GUI locale avec captures AVANT commit** : partie solo légale — ville avec Bibliothèque → Université visible et constructible, complétion vérifiée au dump (Bibliothèque partie, science ×4) ; captures `dev-logs/captures-remplacements-batiments/`.
- **L4** : suites vertes complètes, RULES.md R-111 clarifiée si besoin (une ligne), commit, push, rapport `REPORT-REMPLACEMENTS-BATIMENTS.md`.

## 4. Critères d'acceptation

1. Le scénario d'Erik fonctionne : Bibliothèque + tech → Université constructible ;
2. À la complétion, l'ancien bâtiment part (pas d'empilement de multiplicateurs) — Banque/Cathédrale/Université ;
3. Suites et bancs verts, `schemaVersion` 27.

## 5. Périmètre interdit

Valeurs des bâtiments (coûts/multiplicateurs), l'Arche d'Alliance (effets), rush-buy, tout le 3D, `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
