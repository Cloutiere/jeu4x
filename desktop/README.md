# desktop/ — Coquille Electron du jeu 4X (tranche 1, zéro Steam)

Fenêtre dédiée Windows qui héberge le client web **sans le modifier**. **Option A tranchée avec Erik le 19/09** : la fenêtre charge l'URL du serveur (défaut : prod) — client toujours à jour, OAuth sans friction d'origine. Voir `REPORT-ELECTRON-SOCLE.md` pour l'investigation qui a éliminé l'option B (build embarqué) pour cette tranche.

**Dossier autonome** (délibérément hors workspace pnpm) : dépendances, build et release confinés ici, zéro impact sur `apps/` et `packages/`, invisible pour turbo/CI.

## Commandes

```bash
pnpm --ignore-workspace install   # dans desktop/ uniquement — IMPORTANT : le dépôt racine
                                  # est un workspace pnpm, sans --ignore-workspace pnpm
                                  # remonte à la racine et n'installe rien ici
pnpm start          # coquille pointant la prod (défaut)
pnpm start:dev      # coquille pointant le serveur de dev local (vite 5174 + worker 8787 : lancer pnpm dev:server et dev:web à la racine)
pnpm test           # tests purs (config, navigation, raccourcis, CSP)
pnpm typecheck      # tsc --noEmit
pnpm dist           # installeur NSIS → release/
pnpm dist:dir       # exécutable non empaqueté (test rapide) → release/win-unpacked/
```

## Validation automatisée (playwright-core pilote l'Electron réel)

```bash
pnpm exec node scripts/smoke-prod.mjs   # prod : chargement, pont preload, navigations interdites,
                                        # popup, Ctrl+R/zoom (touches réelles), F11, capture
pnpm exec node scripts/oauth-leg.mjs    # prod : CSP prouvée (image externe bloquée) + jambe OAuth
                                        # Google (page sign-in rendue) + retour — sans identifiants
pnpm exec node scripts/parcours.mjs     # dev : login → lobby → solo vs bot → 2 tours résolus →
                                        # relance (session persistée) → déco/reco → bench FPS →
                                        # confirmation de sortie en partie (prérequis : dev:server + dev:web)
pnpm exec node scripts/bench-chrome.mjs # même mesure dans Edge (moteur Chromium) pour comparaison
```

Captures dans `dev-logs/captures-electron/`. Pièges connus : **tuer les `electron.exe` résiduels avant une session de test** (`taskkill /IM electron.exe /F`) — un process zombie tient le verrou du profil (`%APPDATA%\game-4x-desktop`) et les lancements suivants repartent sur un profil temporaire (symptôme : « session perdue ») ; les touches clavier injectées par CDP (Playwright) ne traversent pas `before-input-event` — la validation des raccourcis passe par SendKeys. `GAME4X_DEBUG=1` logue les décisions clavier.

## Configuration (URL jamais codée en dur)

- `config/prod.json` / `config/dev.json` : un fichier par environnement, lu au démarrage (`gameServerUrl`, titre, hôtes OAuth autorisés, CSP, devtools).
- Sélection d'environnement : `--env=dev` (CLI) > variable `GAME4X_ENV` > défaut `prod`.
- Surcharge ponctuelle de l'URL : variable d'environnement `GAME_SERVER_URL` (prod / 5174 / staging futur).

## Sécurité (M3, non négociable)

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, menu supprimé, navigation confinée (serveur de jeu + fournisseurs OAuth uniquement, sous-domaines adversaires rejetés), toute fenêtre/iframe nouvelle interceptée, permissions renderer refusées, CSP injectée sur les documents du serveur de jeu en prod, `webSecurity` jamais désactivé. La session de jeu est le cookie `session` du serveur (persistant entre les lancements via le profil Electron par défaut).

## Signature de code (à venir — Erik n'a pas encore de certificat)

L'installeur est **non signé** pour l'instant (SmartScreen affichera un avertissement — normal). Quand le certificat sera là, aucune modification de code : définir avant `pnpm dist` :

```bash
export CSC_LINK="C:\chemin\vers\certificat.pfx"
export CSC_KEY_PASSWORD="…"
```

electron-builder signe alors automatiquement l'exécutable et l'installeur (variables standard reconnues). Pour un certificat du store Windows (EV), ajouter `win.signAndEditExecutable` avec `certificateSubjectName` — voir docs electron-builder « Code Signing ».

## Notes

- Icône : `resources/icon.ico` / `icon.png` (dérivée du sprite `ville_capitale` du jeu, régénérable via `resources/make-icon.py`).
- Pas de verrou d'instance unique : deux instances peuvent tourner en parallèle (utile pour tester un match local).
- CI : le workflow `.github/workflows/desktop-build.yml` (déclenchement manuel uniquement) produit l'installeur en artifact, sans distribution.
