# REPORT-ELECTRON-RESOLUTION — Résolution logique fixe 1280×720 et modes d'affichage

**Session du 19/09/2026** — retouche du socle Electron (suite de `REPORT-ELECTRON-SOCLE.md`, option A), decisions d'Erik du 18/09 : résolution logique fixe 1280×720 (tout le monde voit la même vue globale), mode fenêtre fixe par défaut, plein écran letterbox F11/Échap. **Le jeu (`apps/web`), le moteur, le serveur : zéro modification.**

---

## 1. Ce qui est livré

### M1 — Architecture : `BaseWindow` + `WebContentsView` (`desktop/src/main.ts`)

Le contenu du jeu vit désormais dans une **WebContentsView à taille logique fixe** au cœur d'une `BaseWindow`. C'est le seul mécanisme Electron propre pour découpler la taille logique du contenu de la taille de la fenêtre — condition nécessaire au letterbox (en plein écran la fenêtre fait la taille de l'écran ; le contenu, lui, reste à 1280×720 mis à l'échelle). Toute la sécurité existante (allowlist navigation, popups, permissions, CSP, sandbox, preload) est rebranchée sur le webContents de la vue, à l'identique — `smoke-prod.mjs` repasse **10/10**.

- **Mode fenêtre (défaut)** : fenêtre **non redimensionnable** (`useContentSize`), contenu exactement 1280×720 (bordures/barre de titre en sus) ;
- **Plein écran letterbox** : F11 bascule, **Échap** et `gameShell.toggleFullscreen()` (pont preload, bouton futur du jeu) aussi. La vue est mise à l'échelle au **maximum** en préservant le ratio (`Math.min` des deux rapports — jamais d'étirement, jamais de crop), **centrée, bandes noires** (fond de fenêtre). Retour fenêtré : bounds et zoom ×1 restaurés, fenêtre redevient fixe ;
- `desktop/src/letterbox.ts` : calcul PUR et testé (`computeLetterbox` — échelle, rect centré, arrondis au sol pour ne jamais dépasser l'écran) ;
- Application du letterbox **différée et idempotente** (Windows applique la taille finale de la fenêtre plein écran après le `setFullScreen`, un `resize` tardif écrasait les bounds) ; le handler `resize` n'écrit plus les bounds quand on est en plein écran.

### M1 — Configuration data-driven (`desktop/config/*.json`, `src/config.ts`)

```json
"resolutionBase": { "largeur": 1280, "hauteur": 720 },
"modeDefaut": "fenetre",            // ou "pleine-ecran"
"deviceScaleFactor": 1              // null = suivre Windows
```

Éditable par Erik sans code. Valeurs invalides **refusées** au démarrage (entiers requis 320–8192, modes connus uniquement, DPR nombre > 0 ou null), défauts 1280×720 / fenetre / 1.

### M1.4 — Neutralisation du DPR

- `force-device-scale-factor=1` posé **avant le ready** (switch ligne de commande) : rendu identique au pixel quelle que soit la machine ;
- **ceinture et bretelles** : au chargement, le processus principal lit le `devicePixelRatio` réel de la page et compense par un **zoom de base** si le switch n'a pas été pris en compte (un écart a été observé une fois en ~8 lancements — la compensation le rend impossible à rater) ;
- compromis documenté : en plein écran la mise à l'échelle passe par le **zoom Chromium**, qui ré-échantillonne le rendu (le texte reste net, ce n'est pas un étirement bitmap — visible sur la capture plein écran 4K). En fenêtré sur un écran HiDPI, la fenêtre 1280×720 est physique : elle paraît petite sur un 4K — Erik peut mettre `deviceScaleFactor: null` dans la config pour suivre Windows (composition identique au navigateur au même DPR, fenêtre plus grande).

### Bonus livré en passant

- `--profil=<chemin>` (CLI) : profil userData de substitution — sessions isolées pour les tests e2e et une deuxième instance, sans toucher au profil persistant d'Erik (nécessaire pour comparer coquille vs navigateur au même état non connecté) ;
- raccourci Échap : nouveau verdict `fullscreen-exit` dans `shortcuts.ts` — **uniquement consommé si on est en plein écran** ; en fenêtré, Échap continue d'arriver au jeu inchangé.

## 2. Vérification (tout exécuté localement, captures avant tout commit)

| Vérification | Résultat |
|---|---|
| Tests purs desktop | **42/42 verts** (28 → 42 : letterbox ×8, config résolution ×7, Échap) · typecheck desktop vert |
| `scripts/resolution.mjs` (prod) | **10/10** : contenu fenêtre exactement 1280×720 non redimensionnable, viewport logique 1280×720, **DPR = 1 neutralisé**, F11 (touche réelle) → letterbox géométriquement exact (échelle ×3 sur l'écran 4K 3840×2160, contenu 3840×2160 centré, viewport toujours 1280×720), Échap → retour fenêtré (bounds + zoom ×1 + fenêtre fixe), letterbox 16:10 simulé (contenu 1920×1080, bandes 60 px) |
| Letterbox ratios (unitaires) | 16:9 plein cadre · 16:10 bandes h/b · 21:9 bandes g/d · portrait · plus petit que la base · arrondis jamais débordants |
| Vue identique (M2.3) | **0 pixel de différence** (pixelmatch, seuil tolérant) entre la coquille fenêtrée et Edge à viewport 1280×720/DPR 1 sur la même page prod (`scripts/compare-vue.mjs`) — le premier essai montrait 23,89 % de diff… parce que la coquille portait la session connectée d'Erik (lobby) vs login dans le navigateur ; à état égal (profil temporaire), **strictement identique** |
| Bench FPS (M2.2) | **60 FPS** en partie réelle (parcours complet dev : login → solo vs bot → 2 tours résolus → relance session persistée → déco/reco → confirmation de sortie en partie) — parcours **OK**, identique au navigateur |
| Smoke prod (régressions sécurité) | **10/10** après la refactorisation BaseWindow/WebContentsView |
| Suite racine / typecheck 4/4 | Verts, intouchés (turbo full-cache, zéro fichier moteur/serveur/apps modifié) |

Captures (`dev-logs/captures-electron-resolution/`) : `fenetre-1280x720.png`, `plein-ecran-letterbox.png` (page), `plein-ecran-reel-ecran.png` (**vraie capture d'écran 4K plein écran** — lobby rendu ×3, net, plein cadre), `bandes-noires-16x10-reel.png` (letterbox 16:10 simulé : contenu + **bandes noires réelles**), `letterbox-16x10-simulation.png`, `reference-navigateur-1280x720.png` / `electron-fenetre-1280x720.png` / `diff-electron-vs-navigateur.png` (preuve du 0 pixel). L'écran d'Erik étant exactement 16:9 (3840×2160), les bandes du plein écran réel n'apparaissent que sur la simulation 16:10 — documenté comme tel.

## 3. Écarts, limites, pièges

- **DPR flottant observé une fois** (devicePixelRatio 1.5 au lieu de 1 au premier chargement, non reproductible en ~8 runs) → d'où la compensation par zoom de base dans `normaliserDpr()` ; le script e2e vérifie `devicePixelRatio === 1` à chaque run.
- **Touche F11 système dépendante du focus** : plusieurs « échecs » de validation venaient de SendKeys envoyés à une autre fenêtre (parcours dev concurrent). Le pont IPC `gameShell.toggleFullscreen()` ne dépend pas du focus — les scripts l'utilisent maintenant pour les captures ; F11 réel reste validé dans `resolution.mjs` et `smoke-prod.mjs` (fenêtre au premier plan).
- **Capture d'écran DPI** : `CopyFromScreen` PowerShell doit appeler `SetProcessDPIAware()` sinon il ne capture qu'un quart de l'écran 4K (fait dans `capture-pleinecran-reel.mjs`).
- Les screenshots de page (Playwright) ne montrent pas les bandes letterbox (ils capturent la surface de la page, pas l'écran) — d'où les captures d'écran réelles.
- Écran actuel d'Erik : 3840×2160 (16:9 exact) → letterbox plein cadre, échelle ×3 exacte, aucune bande. Sur un écran non 16:9, mêmes chemins de code (unitaires + simulation).
- `desktop/` : 2 nouvelles dépendances dev (`pngjs`, `pixelmatch`) pour la comparaison de pixels — confinées au dossier autonome.

## 4. À tester par Erik (à l'œil, sa machine)

1. **`pnpm start` (prod)** : la fenêtre doit faire exactement 1280×720 (contenu), non redimensionnable ; F11 → plein écran avec la vue agrandie **sans flou d'étirement** ; Échap/F11 → retour fenêtré.
2. **La taille perçue en fenêtré** : DPR forcé à 1, la fenêtre est « petite » sur un 4K. Si elle est trop petite à son goût : `deviceScaleFactor: null` dans `desktop/config/prod.json` (fenêtre plus grande, même composition, rendu suit Windows).
3. **`modeDefaut: "pleine-ecran"`** si la coquille doit ouvrir en plein écran par défaut.

## 5. État du dépôt

- Modifiés : `desktop/` uniquement (`main.ts`, `config.ts`, `preload.ts`, `shortcuts.ts`, `letterbox.ts` nouveau, configs JSON, tests, `README.md`, `smoke-prod.mjs` adapté BaseWindow, scripts nouveaux `resolution.mjs` / `compare-vue.mjs` / `capture-pleinecran-reel.mjs`, `package.json`/lock +2 deps dev) + captures `dev-logs/`.
- **Zéro modification** de `apps/`, `packages/`, docs, fichiers non suivis d'Erik.
- **Aucun commit** : validation locale avec captures faite ; commit/push sur demande explicite d'Erik.
