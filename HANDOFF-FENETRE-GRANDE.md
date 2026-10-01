# HANDOFF-FENETRE-GRANDE — Fenêtre de jeu 1920×1080 (×1,5) + suppression de la scrollbar verticale

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X. Lis `HANDOFF.md` §4 (conventions), `PROJET.md` (état — notamment les sections Electron : socle tranche 1, ELECTRON-RESOLUTION, PLEIN-ECRAN-NET). **2D uniquement.** Zéro changement moteur/serveur/protocole.

## 1. Problème (signalements d'Erik du 21/09, captures à l'appui)

1. **Fenêtre trop petite** : sans F11, la fenêtre 1280×720 est vraiment trop petite sur son écran — « pas jouable ». Il la veut **au moins 1,5× plus grande** (voire plus).
2. **Scrollbar verticale parasite** à droite de la fenêtre (lobby ET en partie) : le contenu dépasse la hauteur de la fenêtre — « l'entièreté de l'image du jeu » doit tenir sans barre verticale.

## 2. Diagnostic (fait par le pilot, à vérifier en L0)

- **Scrollbar — cause racine** : il n'y a **aucun reset CSS global** dans `apps/web` (pas de `app.css`, rien dans `main.ts`/`index.html`) → le `body` garde la marge par défaut de Chromium (8 px). `Game.svelte` l.964 : `main.game { height: 100vh }` → page = viewport + 16 px → scrollbar verticale systématique. Le canvas lui-même ne déborde pas (`.canvas-host { position:absolute; inset:0 }` dans `.map-area { flex:1; min-height:0 }`) ; `.side` (journal) a déjà `overflow-y:auto`.
- **Taille — cause** : `desktop/src/config.ts` l.16 `RESOLUTION_DEFAUT = { largeur: 1280, hauteur: 720 }` ; `desktop/src/main.ts` `createWindow` l.146-171 (`useContentSize: true`, `resizable: false`) ; **toute la chaîne letterbox/DPR/F11 est paramétrique sur `resolutionBase`** (`computeLetterbox` dans `letterbox.ts`, `normaliserDpr` l.122-144 : `zoomBase = cible/dpr`, letterbox = `zoomBase * lb.echelle`). Le canvas de jeu suit le resize (ResizeObserver + `suivreDpr`).

## 3. Décisions tranchées par défaut (veto possible — Erik répond « validé » ou corrige)

- **D1 — Base de résolution par défaut : 1920×1080** (= ×1,5 exactement, contrainte d'Erik). La constante reste **data-driven** (`resolutionBase` lisible de la config — même mécanique qu'aujourd'hui) : Erik peut expérimenter d'autres valeurs (ex. 2560×1440) en éditant la config, sans code. Fenêtre toujours non redimensionnable (le letterbox F11 repose sur ce contrat).
- **D2 — Reset CSS global** : `body { margin: 0 }` (fichier CSS global importé dans `main.ts` ou styles dans `index.html` — au choix de l'agent, un seul endroit). La page de jeu ne doit JAMAIS dépasser le viewport : corriger proprement (le `100vh` de `main.game` redevient exact une fois la marge enlevée ; vérifier aussi le débordement horizontal 16 px, même cause). Le lobby reste en flux normal — après reset, s'il dépasse encore la hauteur (contenu long), la page peut défiler NORMALEMENT (c'est du contenu réel), mais **en partie il ne doit plus y avoir aucune scrollbar**.
- **D3 — Aucune retouche de la logique letterbox/DPR/F11** : elle est déjà paramétrique. `appliquerLetterboxPleinEcran`, `normaliserDpr`, `computeLetterbox` inchangés — ils recalculent tout seuls sur la nouvelle base. Les tests `desktop/tests/letterbox.test.ts` (base 1280×720) restent valides ; en ajouter un cas 1920×1080.
- **D4 — Les scripts e2e dépendants des dimensions exactes sont paramétrés ou mis à jour** : `desktop/scripts/resolution.mjs`, `compare-vue.mjs`, `validation-partie-f11.mjs`, `validation-plein-ecran-net.mjs` — passer leur base à 1920×1080 (ou lire `RESOLUTION_DEFAUT` pour ne plus dupliquer la constante).
- **D5 — Le navigateur (sans coquille) profite du reset CSS** sans changement d'UX par ailleurs : vérifier que la page en partie dans un navigateur à 720 px de haut ne montre plus de scrollbar.
- **D6 — Zéro changement** : `packages/rules`, `apps/server`, protocole, `schemaVersion`, rendu du jeu, caméra, zoom molette, vue ville.

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. Vérifie le diagnostic §2 (marge body, `100vh`, constante config) et mesure la hauteur réelle du document en partie (devtools CDP) avant/après fix.
- Lis `desktop/src/config.ts`, `main.ts`, `letterbox.ts` + ses tests, `Game.svelte` (styles layout), `Lobby.svelte`, et un script e2e coquille (ex. `resolution.mjs`) pour le format de validation.

### L1 — Fix scrollbar (web)
- Reset CSS global (`body { margin: 0 }`), vérifier `main.game` = exactement le viewport (aucune scrollbar verticale ni horizontale en partie, fenêtre 1280×720 comme 1920×1080).
- Vérifier le lobby après reset (le `margin: 2rem auto` de `main` reste ok) et les autres pages (Home, Debug) : aucune régression visuelle grossière.
- Test unitaire web si possible (assertion sur le CSS global — sinon capture).

### L2 — Base 1920×1080 (desktop)
- `RESOLUTION_DEFAUT` → 1920×1080 ; vérifier que la lecture config `resolutionBase` accepte toujours les valeurs explicites (test config mis à jour).
- Vérifier en local : fenêtre fenêtrée 1920×1080 exacte (useContentSize), jeu rendu net (DPR suivi), F11 → letterbox correct (bandes noires 16:9 sur écran 16:9), retour fenêtré, resize handler.

### L3 — Scripts e2e
- Paramétrer/mettre à jour les scripts §D4 ; relancer au minimum `resolution.mjs` (fenêtre + F11 + retour) et une validation partie (ex. `validation-plein-ecran-net.mjs` adapté). **Captures AVANT tout commit** dans `dev-logs/captures-fenetre-grande/` : partie en 1920×1080 fenêtré, F11 letterbox, lobby sans scrollbar, partie sans scrollbar.

### L4 — Rapport
- `REPORT-FENETRE-GRANDE.md` : diagnostic confirmé (mesures avant/après hauteur document), changements, résultats e2e, captures, ce qu'Erik valide en ligne, 🔶 (si Erik veut encore plus grand : la config `resolutionBase` le permet — documenter COMMENT l'éditer, chemin du fichier de config de la coquille installée).

## 5. Critères d'acceptation

1. La coquille s'ouvre en **1920×1080** (×1,5), jeu net, letterbox F11 intact, retour fenêtré intact.
2. **Aucune scrollbar** en partie (fenêtré comme plein écran), quelle que soit la base ; lobby sans scrollbar parasite.
3. Le navigateur seul n'a plus de scrollbar parasite en partie.
4. `resolutionBase` reste éditable en config sans code (testé).
5. Suite verte (web + desktop), typecheck, zéro changement moteur/serveur.

## 6. Périmètre interdit

- Redimensionnement dynamique de la fenêtre (`resizable: true` — casse le contrat letterbox, reporté) ;
- Plein écran au démarrage, titlebar personnalisée, zoom UI séparé de la base de résolution ;
- Toute retouche du pipeline art / des unités (chantier ARCHER-SVG en cours d'acceptation) ;
- Moteur, serveur, protocole, 3D.
