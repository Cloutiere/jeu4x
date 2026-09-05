# REPORT CHANTIER V1-bis — Correctif : entités hors champ après bascule 2D → 3D

**Date :** 04/09/2026 · **Statut :** ✅ Correctif livré, testé, poussé (CI deploy à lire après push).
**Préalables tenus :** baseline 826 tests verts, typecheck 4/4, `schemaVersion` 18 inchangée, `packages/rules` et serveur non touchés.

---

## 1. Cause racine (trouvée par reproduction, pas par déduction)

Le constat d'Erik (« après bascule 2D → 3D, les deux unités de départ sont complètement hors du terrain, en haut à gauche ») est **reproduit intégralement en local** en simulant un écran Windows en mise à l'échelle **devicePixelRatio = 1.5** avant la bascule : les deux unités flottent en haut à gauche, le terrain 3D restant « conforme » (capture : `dev-logs/captures-v1-3d/BUG-reproduit-avant-correctif-dpr15-unites-hors-champ.png`).

Le mécanisme :

- `Stage3D.resize()` appelait `renderer.setSize(w, h, false)` — **`updateStyle: false`** : Three.js dimensionne le **buffer** (w × dpr) mais ne pose **jamais** la taille **CSS** du canvas ;
- sans `style.width/height`, un canvas s'affiche à la taille de son buffer = **dpr × trop grand** dès que `devicePixelRatio > 1` (mise à l'échelle 125/150 % des PC Windows — le cas d'Erik ; sur un écran dpr 1, comme toutes les sessions de test précédentes, le bug est invisible) ;
- le canvas PixiJS, lui, utilise `autoDensity` → taille CSS toujours correcte ;
- la projection (`cam.project`) mappe vers des px **CSS** : entités/surcouche posées aux bonnes positions PixiJS, mais le terrain rendu sur le canvas Three agrandi dpr× — **tout se décale d'autant vers l'origine** : les unités apparaissent hors de leurs cases, vers le haut-gauche, d'autant plus loin que dpr est élevé (à 1.5 : ~250 px = hors de l'île de terrain visible).

**Pourquoi la projection n'y est pour rien** : la promesse Option B est intacte — `projeterCalques3d` a toujours projeté correctement ; c'est le **support d'affichage** du terrain qui mentait. La piste n°1 du handoff (tampons `__wx/__wy` absents) n'était pas la cause réelle, mais un chemin restait effectivement non estampillé (voir §2).

## 2. Correctifs (2)

1. **`render3d/stage3d.ts`** — `renderer.setSize(this.viewW, this.viewH)` **avec** `updateStyle` (défaut `true`) : Three pose désormais `style.width/height` en px CSS, exactement comme Pixi `autoDensity`. Le buffer reste dpr× (netteté inchangée), l'affichage redevient aligné quel que soit le dpr ;
2. **`render/GameCanvas.svelte`** — verrou « estampillage systématique » demandé par le handoff : la branche playback de `rebuildEntities` (unité animée) utilisait `position.set(...)` sans tampon monde — le dernier chemin pouvant produire un enfant ignoré par `projeterCalques3d` (`continue`). Elle passe par `poser3d(...)` : **tout enfant projetable porte désormais toujours un tampon monde**.

Périmètre tenu : aucun renommage, aucune nouvelle fonctionnalité, pas de V2, moteur/serveur intacts.

## 3. Verrou par test

**`apps/web/scripts/e2e-bascule-3d.mjs`** (nouveau) — e2e « conditions réelles » autonome (Edge/Chrome headless piloté en CDP brut, zéro dépendance ajoutée) sur le serveur de dev :

1. login stub ×2, création de partie `variee-40` + jointure adversaire (même mécanique que `fortify-e2e`) ;
2. partie rendue en **2D** avec entités visibles ;
3. `devicePixelRatio` simulé à **1.5** **puis** bascule 3D à chaud (l'ordre compte — c'est la séquence d'Erik) ;
4. assertions : les deux canvases ont la **même taille CSS** (le contrat qui tuait le rendu), chaque sprite d'entité est **sur sa case** (`pickAt(sprite) ↔ screenOf(hex)`, écart < 8 px, via les hooks dev existants) ;
5. aller-retour **3D → 2D → 3D** sans dérive (même assertions à chaque étape).

**Contre-vérification** : le test est **ROUGE** sur le code d'avant correctif (`tailles CSS divergentes`) et **VERT** après — il verrouille bien la régression.

## 4. Vérifications

- **Suite complète** : 803 tests vitest verts (695 rules + 70 web + 38 serveur) + 23 e2e = **826** ; typecheck **4/4** ;
- **E2E existants** : artefacts **VERT** ; fortification T-17 **VERT** (tir discriminant obtenu au 3ᵉ relance — le script est conçu pour être relancé) ;
- **GUI réelle (dpr 1.5 simulé)** : bascule 2D→3D avec unités de départ ✓, bascule pendant la relecture (playback) ✓, tour complet résolu **en 3D** avec playback puis positions finales sur les cases ✓, pan + zoom ×2 puis re-position exacte (`pickAt` renvoie la case de chaque sprite) ✓, bascules répétées rapides (stress ×6) sans crash ✓ ;
- **Prod build** (`vite build` + preview) : séquence complète re-vérifiée sur le bundle de production ✓ ;
- **Captures** : `dev-logs/captures-v1-3d/BUG-reproduit-avant-correctif-dpr15-unites-hors-champ.png` et `FIX-3d-dpr15-unites-sur-leurs-cases.png`.

## 5. Notes / angles morts couverts au passage

- Le bug ne se voyait **que** sur un écran dpr > 1 — toutes les vérifications précédentes (sessions L0→L4) tournaient à dpr 1. Désormais l'e2e simule dpr 1.5 explicitement ;
- `optionB.ts` (spike labo `#/lab3d`) partage `Stage3D` : le correctif s'applique aussi au labo ;
- L'e2e nouveau tue proprement son navigateur (port CDP aléatoire + `taskkill /T`) — les relances ne se marchent pas dessus.

## 6. État fin de session

- Commits poussés sur `main` → CI (tests + typecheck + deploy wrangler) à lire sur https://github.com/Cloutiere/jeu4x/actions ; prod health à re-vérifier après deploy ;
- **Relancer Erik sur l'acceptation visuelle en conditions réelles** (son écran est précisément le cas dpr > 1) : bascule 2D↔3D, pan/zoom, un tour complet — puis V2 (structures 3D) autorisée.

**Arrêt ici conformément au handoff — la main est rendue au pilot.**
