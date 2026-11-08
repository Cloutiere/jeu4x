# REPORT-FLECHE-COUCHE — La flèche de déplacement au-dessus des structures

**Mission** (HANDOFF-FLECHE-COUCHE, signalement Erik 04/10) : la flèche de déplacement ne s'affichait PAS par-dessus les huttes, camps barbares, artefacts (ni les villes). Attendu : **flèche au-dessus de TOUTES les structures posées, EN DESSOUS des unités**. Client seul, `schemaVersion` 27 inchangée, moteur/serveur et 3D intouchés.

## Diagnostic

La flèche vivait dans `overlayLayer`, qui est **sous tout `entitiesLayer`** (ordre des enfants de `world`). Or depuis GP-ART (28/09) les structures (villes, huttes, villages barbares, artefacts) sont des entités d'`entitiesLayer` à `zIndex -100` — elles recouvraient donc la flèche. L'anneau de sélection (REGLAGES-CALIBRAGE 30/09) avait déjà réglé le même problème pour lui-même (`zIndex -90`).

## Livraison

- **`arrows.ts`** — constante pure exportée `ZINDEX_FLECHE = -95` : au-dessus des structures (-100), sous l'anneau de sélection (-90) et sous toute unité (`zIndex = p.y*10 + z` ≥ 0).
- **`GameCanvas.svelte`** — couche dédiée `flecheCouche` (Container), enfant d'`entitiesLayer` (qui trie par `zIndex`) à `ZINDEX_FLECHE` :
  - TOUT le bloc flèche y est routé en 2D : flèche posée (`drawArrow` — ordre frais ET chemin gelé), flèche de survol/maintien (`dessinerSurvol`), brouillon de chemin, badges de tours (`jalonsC`). Les **copies wrap** suivent automatiquement (même pipeline `copiesPolyline`/`avecCopies` — la copie est addChildée par la même fonction).
  - En **3D**, `flecheParent()` retourne `overlayLayer` : comportement inchangé (les chemins vivent dans les marqueurs Three, sous les modèles ; la projection des calques ne traverse pas `flecheCouche`).
  - `flecheCouche` est vidée à chaque rebuild (comme la surcouche) ; l'anneau de sélection et les unités (autres enfants d'`entitiesLayer`) ne sont pas touchés ; rattachement au `entitiesLayer` reconstruit au chargement des textures.
  - L'anneau rouge + fantôme ARRIVEE-ENNEMIE restent dans `overlayLayer` (le fantôme doit rester SOUS le sprite ennemi — inchangé).

## L1 — test-first

`apps/web/tests/fleche-couche.test.ts` (4 cas, rouge avant implémentation) : ordre de tri de la constante ; `flecheCouche` enfant trié d'`entitiesLayer` (création ET re-création des calques) ; routage du bloc entier (posé, gelé, survol, brouillon, badges) via `flecheParent()` ; vidage au rebuild sans toucher aux entités.

## L3 — captures GUI réelles (`dev-logs/captures-fleche-couche/`)

Parties solo légales (procedural-40) jouées quelques tours par `devtmp/fleche-couche-gui.mjs` : le colon fonde la capitale, un 2e guerrier est produit (gardien de la case ville — cas « sous l'unité »), le guerrier explore hutte/camp par proximité (jamais sur la structure). Ordres Move dont le chemin TRAVERSE la structure, flèche capturée avant résolution.

- `avant/1-hutte-traversee.png` — la flèche DISPARAÎT sous la hutte (seule la pastille de départ dépasse) : le signalement d'Erik reproduit.
- `apres/1-hutte-traversee.png` — la flèche passe AU-DESSUS de la hutte et SOUS le guerrier qui la chevauche, badges (1)(2) visibles.
- `apres/4-ville-et-unite.png` — flèche + badges au-dessus de la ville, passant SOUS l'unité ; `avant/4-ville-et-unite.png` — aucune flèche visible autour de la capitale (cachée sous ville/unité).
- Camp barbare : comportement identique (même couche) — une capture « après » favorable a été observée en passe intermédiaire puis écrasée par les passes suivantes 🔶 (voir Pièges).

## Vérifications

- Suites web **530 vertes** (526 + 4 nouvelles), rules 993 et server 120 intouchées, `svelte-check` 0 erreur.
- Commit `7c4d66b` poussé — CI déploie.

## Pièges rencontrés (consignés)

- **Wrangler local figé** (piège workerd connu) : le worker dédié 8790 du T2 était mort ; un worker frais (8792, Vite dédié 5176) se fige aussi après **~10 tours de résolution** — l'e2e capture avec ce qui est acquis au figeage.
- **Artefacts** : posés sur des ÎLOTS (artefacts-îles) — injoignables à pied, jamais explorés au tour 10 → **pas de capture artefact** 🔶 (même couche que hutte/camp, tri identique).
- **Flèche tronquée au bord de la vision** (R-161) : une structure explorée mais sortie du disque de vision ne porte plus la flèche — les cibles de capture doivent être VISIBLES au moment de la capture.
- `git stash` ciblé sur les 2 fichiers pour la passe AVANT (code HEAD), restauré ensuite ; serveurs dédiés 8792/5176 arrêtés en fin de mission ; config Vite temporaire supprimée.

## 🔶 Ouverts (à l'œil d'Erik)

- Calibre visuel de la flèche par rapport aux structures (largeur 6, alpha) — inchangé, seule la couche a changé.
- Capture « camp barbare » à retenter si souhaité (lancer `node devtmp/fleche-couche-gui.mjs APRES 8792 5176` avec worker/Vite dédiés relancés).
