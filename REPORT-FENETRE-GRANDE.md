# REPORT-FENETRE-GRANDE — Fenêtre 1920×1080 (×1,5) + zéro scrollbar parasite

> Mission du 22/09 (handoff `HANDOFF-FENETRE-GRANDE.md`). 2D uniquement, zéro changement moteur/serveur/protocole. En attente du « validé » d'Erik.

## 1. Diagnostic confirmé (L0)

- **Scrollbar** : confirmé. Aucun reset CSS dans `apps/web` (pas de `app.css`, rien dans `main.ts`/`index.html`) → marge Chromium par défaut de 8 px sur `body`. `Game.svelte` l.964 `main.game { height: 100vh }` ⇒ page = viewport + 16 px de haut ⇒ scrollbar verticale systématique en partie (et 16 px horizontaux). En partie AVANT fix : document = 1080 + 16 = **1096 px pour 1080 px de viewport** (mesure e2e APRÈS fix : **1080 = 1080 exactement**, 0 px de barre).
- **Taille** : confirmé. `desktop/src/config.ts` `RESOLUTION_DEFAUT = 1280×720` (l.16), `main.ts createWindow` `useContentSize: true`. Toute la chaîne letterbox/DPR est paramétrique sur `resolutionBase` — aucune retouche de logique nécessaire (D3 respecté).

## 2. Changements

| Fichier | Changement |
|---|---|
| `apps/web/src/app.css` (NOUVEAU) | Reset global `html, body { margin: 0; padding: 0 }` |
| `apps/web/src/main.ts` | Import de `./app.css` avant le montage Svelte |
| `desktop/src/config.ts` | `RESOLUTION_DEFAUT` → **1920×1080** (l.16) |
| `desktop/config/dev.json`, `prod.json` | `resolutionBase` explicite → 1920×1080 (**y compris celui embarqué dans la coquille installée** via extraResources) |
| `desktop/src/main.ts` | Commentaire d'en-tête mis à jour (défaut 1920×1080) — aucune logique touchée |
| `desktop/tests/config.test.ts` | Défaut attendu 1920×1080 ; nouveaux cas : résolution explicite ≠ défaut acceptée sans code (1280×720 et 2560×1440) |
| `desktop/tests/letterbox.test.ts` | Nouveau describe « base FENETRE-GRANDE 1920×1080 » : plein cadre, 2560×1440 (×4/3), 16:10 bandes 60 px, ancienne base 1280×720 toujours exprimable (×1,5) |
| `apps/web/tests/app-css.test.ts` (NOUVEAU) | Assertion : reset margin/padding présent + importé dans `main.ts` |
| `desktop/scripts/resolution.mjs` | Base lue dans `dist/config.js` (`RESOLUTION_DEFAUT`, plus de constante dupliquée) ; captures → `dev-logs/captures-fenetre-grande/` ; simulation 16:10 recalculée depuis la base ; F11/Échap envoyés **via le pont preload** (voir §4) |
| `desktop/scripts/compare-vue.mjs` | Même paramétrage (viewport navigateur = coquille = `RESOLUTION_DEFAUT`) |
| `desktop/scripts/validation-fenetre-grande.mjs` (NOUVEAU) | E2E de bout en bout : fenêtre 1920×1080, lobby, partie solo, scrollbar, canvas net, F11, retour fenêtré |

`validation-partie-f11.mjs` et `validation-plein-ecran-net.mjs` : aucune dimension codée en dur — inchangés.

## 3. Résultats e2e (coquille dev, captures à l'appui)

`node scripts/validation-fenetre-grande.mjs` — **OK** :

- fenêtre fenêtrée : contenu **1920×1080 exact**, non redimensionnable ; viewport logique 1920×1080, DPR 1 ;
- **partie fenêtrée : document 1920×1080 = viewport, 0 px de scrollbar (verticale ET horizontale)** ; canvas buffer 1:1 (net) ;
- F11 (pont) → plein écran letterbox : contenu 3840×2160 centré (écran 4K d'Erik, zoom ×2), viewport logique inchangé, **0 scrollbar** ; retour fenêtré 1920×1080 intact ;
- navigateur headless 1280×720 : `body` margin calculé = **0 px**, home sans scrollbar (avant fix : marge 8 px → +16 px de document).

`node scripts/resolution.mjs` — **OK** (fenêtre, letterbox F11, Échap retour, letterbox 16:10 simulé bandes 60 px).

Captures : `dev-logs/captures-fenetre-grande/` — `fenetre-1920x1080.png`, `partie-1920x1080-fenetree-sans-scrollbar.png`, `partie-pleinecran-letterbox.png`, `lobby-1920x1080-sans-scrollbar.png`, `plein-ecran-letterbox.png`, `letterbox-16x10-simulation.png`.

Tests : **web 369 verts** (31 fichiers, +2 reset CSS), **desktop 47 verts** (+5 letterbox/config), typecheck **0 erreur** des deux côtés. Zéro changement `packages/rules`, `apps/server`, protocole, rendu, caméra, vue ville.

## 4. Pièce découverte : F11 synthétique n'atteint jamais `before-input-event`

`resolution.mjs` envoyait F11 par SendKeys PowerShell (touche OS) : silencieusement **sans effet dès qu'une autre fenêtre détient le premier plan** (arrivé 2× pendant la session). Le clavier CDP de Playwright ne marche pas mieux : **les événements synthétisés ne déclenchent pas `before-input-event`** — seule la touche physique l'atteint. Le script envoie donc désormais F11/Échap via le pont preload (`gameShell.toggleFullscreen`), qui emprunte le même chemin letterbox (`appliquerLetterboxPleinEcran`). La touche F11 physique elle-même reste validée à la main (Erik l'utilise quotidiennement).

## 5. Ce qu'Erik valide en ligne

1. La coquille (reconstruite/installée) s'ouvre en **1920×1080**, jeu net, letterbox F11 et retour fenêtré intacts.
2. **Aucune scrollbar en partie** (fenêtré comme plein écran).
3. Navigateur seul : plus de scrollbar parasite en partie.

## 6. Retours d'Erik du 22/09 (dimension validée) — VALIDÉ À L'ŒIL

1. **Lobby plus lisible** — `Lobby.svelte` : `zoom: 1.25` sur le `main` (toute la page scale, facile à régler d'un seul chiffre). La capture `lobby-1920x1080-sans-scrollbar.png` montre le rendu.
2. **Zoom de départ de la carte** — VALIDÉ par Erik (« c'est parfait », capture à l'appui) : `ZOOM_DEPART = 1.15⁴ ≈ ×1,75` (4 crans de molette depuis ×1, constantes dans `hexView.ts`, appliqué au premier centrage `maybeCenter` dans `GameCanvas.svelte` avec les mêmes appels que le handler molette, clamp respecté, 2D et 3D). Historique : 2 crans (×1,32) insuffisants — les captures « visuel souhaité » d'Erik donnaient un rapport ×1,3 supplémentaire ; 4 crans = ×1,749 confirmé en e2e (`__game.camera().scale`).
3. Test unitaire `tests/zoom-depart.test.ts` (4 crans exacts, dans les bornes). Tests web 371 verts, typecheck 0 erreur.

## 🔶 Points d'attention / encore plus grand


- **Encore plus grand sans code** : éditer `resolutionBase` dans le fichier de config de la coquille installée —
  `%LOCALAPPDATA%\Programs\<nom app>\resources\config\prod.json` (chemin exact visible au lancement dans le log `résolution=…`), ex. `{ "largeur": 2560, "hauteur": 1440 }`, puis relancer la coquille. Bornes acceptées : 320 à 8192 (entiers). Testé par `config.test.ts` (« accepte une résolution explicite différente du défaut »).
- **Scrollbars du LOBBY** : à 1080 px de haut le lobby défile encore, mais c'est du **contenu réel** (liste des 16 nations ≈ 2100 px) — autorisé par D2. Si Erik veut un lobby compact sans défilement, c'est un chantier UI séparé.
- **Coquille installée** : penser à reconstruire l'installeur (`pnpm -C desktop dist`) pour que la coquille installée d'Erik prenne la nouvelle config embarquée.
- Sur l'écran 4K d'Erik (DPR forcé 1), la fenêtre 1920×1080 occupe le quart de l'écran ; le F11 passe au zoom ×2 plein écran. Si Erik préfère que la fenêtre fenêtrée utilise mieux les 2160 px de hauteur physique, c'est la variable `deviceScaleFactor` de la config (chantier séparé, périmètre interdit ici).
