# REPORT-GARNISON-SELECTION — Sprite complet quand l'unité en ville est sélectionnée

**Livrée 14/10** — suite d'ICONES-UNITES, client seul, décisions Erik 14/10 (D1-D5) toutes appliquées, zéro veto.

## Ce qui a été fait

- **L1 — prédicat pur (test-first)** : `modeGarnison` (apps/web/src/lib/render/icones-unites.ts) reçoit un nouveau champ `selectionnee`. Sélectionnée → `actif: false` (sprite complet, position de mêlée standard, anneau, barre normales) ; désélectionnée → compacte. Tests : 24 → 26 (nouveau describe « GARNISON-SELECTION », cas D1/D2/D3/D4/D5 + badge).
- **L2 — rendu** : GameCanvas.svelte passe `selectionnee: scene.ui.selectedUnitId === unit.id` au prédicat ; la bascule est déclenchée par le CHANGEMENT de sélection dans `onNewUi` (`selectionPrecedente` → `entitiesDirty = true`), jamais un rebuild par frame. D4 : un ennemi n'est jamais `selectedUnitId`, donc toujours compact — aucune condition de propriétaire ajoutée.
- **Badge de pile (D3)** : le porteur du badge ×N (index 0 de la case) GARDE son badge même sélectionné — il résume les N−1 autres, restées compactes. `pileBadge.visible = garnison.badge !== null` (plus conditionné à `actif`). Hors garnison (campagne/anim/3D/fondation) : badge null comme avant (testé).
- **D5** : copies couture = reflets de la base à chaque rebuild (`syncCopie` : visible + sous-enfants), relecture idem — rien à faire, vérifié.
- **L3 — captures GUI réelles** (`devtmp/garnison-selection-gui.mjs`, ports dédiés, wrangler adopté) : 4 captures dans `dev-logs/captures-garnison-selection/` — 1 compacte (baseline), 2 sélectionnée (alternance R-2 par VRAIS clics sur `hexToPage`, sprite complet + anneau + UnitPanel Guerrier), 3 désélect (clic case voisine → compacte), 4 pile ×2 sélectionnée (la sélectionnée seule complète, autres compactes, badge ×2 visible). 12/12 asserts passent.

## Suites

- web vitest **654/654** vertes (26 icones-unites), svelte-check **0 erreur** (17 warnings préexistants).
- Moteur/serveur, schemaVersion (27), R-2, icônes/barres existantes : intouchés.

## Incidents de session (infra, pas du code)

- Zoo de wranglers zombies multi-sessions sur 8787 (plusieurs LISTEN sur le même port, réponses pendantes → health check en timeout, kills en cascade). Nettoyé (arbres complets tués), puis UN wrangler sain relancé et « adopté » par le script. Leçon rappelée : ports dédiés + tuer les arbres superviseurs, pas seulement les listeners.
- Vite : le proxy dev pointe 8787 EN DUR (vite.config.ts) — un script GUI sur un autre port que 8787 casse /auth, /admin et /ws de la page navigateur.

## 🔶 Ouvert (à l'œil Erik)

- Le scénario d'Erik (clic ville → sprite complet, re-clic → icône) est prouvé en GUI e2e local ; validation à l'œil en prod attendue après Deploy.
- Badge ×2 sur l'unité sélectionnée : position conservée à gauche de la barre ; si Erik préfère le badge masqué pendant la sélection, c'est une ligne dans `modeGarnison`.
