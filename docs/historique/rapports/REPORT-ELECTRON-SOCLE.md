# REPORT-ELECTRON-SOCLE — Socle Electron de distribution desktop (tranche 1, zéro Steam)

**Session du 19/09/2026 · ✅ ACCEPTÉ par Erik le 19/09** (test réel : login Google + partie dans la coquille ; bug « carte noire » remonté puis corrigé le jour même — voir §7). Handoff archivé : `docs/historique/handoffs/HANDOFF-ELECTRON-SOCLE.md`.
Handoff : `HANDOFF-ELECTRON-SOCLE.md`. Décision de tranche tranchée **en session avec Erik : Option A** (coquille pointant la prod), après investigation complète du flux OAuth/session.

---

## 1. La décision A/B et pourquoi (à garder pour la suite)

**Option A retenue : la fenêtre Electron charge l'URL de prod.** L'investigation du code (client web + serveur + wrangler) a établi que **la session ne survit pas au changement d'origine**, ce qui éliminait l'option B (build embarqué) en l'état :

- La session de jeu est un **cookie posé par le serveur de prod** (`session`, HttpOnly, SameSite=Lax, 7 jours — `apps/server/src/auth/session.ts`), jamais stocké côté page ;
- Le login Google/Discord est une **redirection pleine page** dont l'adresse de retour est **fixée côté serveur** par `APP_BASE_URL` (`wrangler.jsonc` → `redirect_uri` du callback) : le flux aboutit toujours sur le client de prod, jamais sur une origine locale ;
- Depuis une origine locale : cookies cloisonnés par origine dans Chromium, client web en credentials par défaut (`same-origin`), **Worker sans aucune entête CORS**, et **WebSocket vérifiant la session à l'upgrade** (`lobby.ts:167`, `game.ts:851`) → `/api/me` échoue et le lobby refuse la connexion ;
- Rendre B viable aurait exigé une machinerie shell lourde (popup OAuth pointant la prod + lecture du JWT dans le jar de cookies + mini-serveur local qui réinjecte le cookie sur chaque appel HTTP **et** WS) — le plus gros morceau de la tranche, fragile, **sans bénéfice réel** : le jeu a de toute façon besoin du backend en ligne (Durable Objects, WS — pas de hors-ligne), et un client figé risque de diverger du protocole du serveur (`PROTO_VERSION`, `schemaVersion`).

**Porte de sortie documentée** : le serveur accepte déjà la session par `?token=` en query (`env.ts` — prévu « tests/client natif »). Une vraie coquille native autonome (ou un jour du hors-ligne partiel) passerait par là, mais exige des changements au client web (transmettre le token partout) et du CORS côté Worker — décision produit séparée, au backlog si Erik le veut un jour.

## 2. Ce qui est livré (`desktop/` — dossier autonome)

```
desktop/
├── package.json          autonome (HORS workspace pnpm — turbo/CI racine ne le voient pas)
├── tsconfig.json         build tsc → dist/ (CommonJS, strict)
├── src/
│   ├── main.ts           process principal : fenêtre, sécurité, raccourcis, config
│   ├── preload.ts        pont minimal (contextBridge) + neutralisation zoom molette
│   ├── config.ts         PUR : lecture config/<env>.json + surcharge GAME_SERVER_URL (URL jamais codée en dur)
│   ├── navigation.ts     PUR : allowlist navigation + détection « en partie » (confirmation de sortie)
│   ├── shortcuts.ts      PUR : politique clavier (Ctrl+R/F5/zoom/DevTools bloqués, F11 plein écran)
│   └── csp.ts            PUR : politique CSP dérivée de l'URL serveur
├── config/prod.json      https://game-4x-server-prod.erik-ai-studio.workers.dev (+ CSP, sans devtools)
├── config/dev.json       http://localhost:5174 (sans CSP — HMR, avec devtools)
├── resources/            icon.ico + icon.png (dérivés du sprite ville_capitale, régénérables : make-icon.py)
├── tests/                28 tests purs (vitest) — config, navigation, raccourcis, CSP
└── scripts/              smoke-prod / oauth-leg / parcours / bench-chrome (playwright-core pilote l'Electron réel)
```

- **Configuration** : un fichier par environnement, lu au démarrage ; sélection `--env=dev` (CLI) > `GAME4X_ENV` > défaut `prod` ; surcharge ponctuelle `GAME_SERVER_URL` (prod / 5174 / staging futur). Aucune URL dans le code.
- **Installeur** : `pnpm dist` → NSIS x64 (`release/4X multijoueur asynchrone Setup 0.1.0.exe`, 93,7 Mo), icône du jeu, raccourcis bureau/menu démarrer, installation « juste pour moi ». Non signé (voir §5).
- **CI** : `.github/workflows/desktop-build.yml` — déclenchement **manuel uniquement** (workflow_dispatch), sur runner Windows : tests + typecheck desktop + build NSIS + artifact (aucune distribution). N'a aucun effet sur `deploy.yml`.
- **Pas de verrou d'instance unique** (choix délibéré) : deux instances peuvent tourner en parallèle, utile pour tester un match local.

## 3. Sécurité (M3 — tout vérifié en live)

`contextIsolation: true` · `nodeIntegration: false` · `sandbox: true` · menu application supprimé · `webSecurity` intouché · navigation confinée par allowlist (serveur de jeu + `accounts.google.com` + `discord.com`, sous-domaines adversaires type `evil-accounts.google.com` rejetés — testés) · toute `window.open` refusée · webview interdit · permissions renderer refusées · **CSP injectée sur les documents du serveur de jeu en prod** (connect-src `wss://` prod uniquement) — prouvée appliquée : une image externe est bloquée dans la fenêtre · titre verrouillé par la config.

Session de jeu : cookie du serveur dans le profil Electron persistant (`%APPDATA%\game-4x-desktop`) — **survit aux relances** (validé, §4).

## 4. Validation (tout exécuté localement, captures avant commit)

| Vérification | Résultat |
|---|---|
| Smoke prod (`scripts/smoke-prod.mjs`) | **10/10** : chargement prod, titre propre, pont preload, pas de Node dans le renderer, navigation externe refusée, popup interceptée, Ctrl+R neutralisé (touche réelle), zoom molette neutralisé, F11 plein écran aller/retour |
| Jambe OAuth (`scripts/oauth-leg.mjs`) | **OK** : CSP prouvée, clic Google → page sign-in Google rendue dans la fenêtre (navigation pleine page autorisée par l'allowlist), retour propre au jeu |
| Parcours complet (`scripts/parcours.mjs`, stack dev) | **OK** : login stub → lobby → **partie solo vs bot** → **2 tours réellement résolus** (Tour 0→1→2) → quitter proprement → **relancer : session persistée** (lobby direct, pas de login) → déconnexion/reconnexion → bench FPS → **confirmation native de sortie en partie** (process vivant tant que le dialog est ouvert) |
| Bench rendu (M5.2) | **Electron 60 FPS = Edge 60 FPS** (même mesure `requestAnimationFrame` dans une vraie partie, même stack dev) — identique, comme attendu |
| Tests purs desktop | **28/28 verts** · typecheck desktop vert |
| Suite racine / typecheck 4/4 | **Verts, intouchés** (turbo 3/3 en cache, aucun fichier suivi modifié) |

Captures (`dev-logs/captures-electron/`) : `prod-login.png` (login dans la coquille), `prod-oauth-google.png` (sign-in Google dans la coquille), `dev-lobby.png`, `dev-partie.png`, `dev-partie-tour3.png` (carte hexagonale + unités + UI complète), `dev-relance-session.png`, `dev-bench-fps.png`, `installeur.png` (assistant NSIS avec l'icône du jeu).

## 5. Build et signature de code (la suite, côté Erik)

L'installeur actuel est **non signé** — SmartScreen affichera un avertissement à la première exécution (normal sans certificat). Quand Erik aura son certificat, **aucune modification de code** : avant `pnpm dist`,

```bash
export CSC_LINK="C:\chemin\vers\certificat.pfx"
export CSC_KEY_PASSWORD="…"
```

electron-builder signe alors automatiquement exécutable + installeur (variables standard). Pour un certificat du store Windows, ajouter `certificateSubjectName` dans `build.win` (doc electron-builder « Code Signing »). Le workflow CI consommera les mêmes variables via secrets `CSC_LINK`/`CSC_KEY_PASSWORD` dès qu'ils existeront.

## 6. À tester par Erik (ce qui ne peut se faire que chez lui)

1. **Login Google réel dans la coquille** (le login en prod = Erik seul) : lancer `pnpm start` (ou l'installeur), cliquer « Se connecter avec Google », entrer ses identifiants — attendu : retour dans le jeu connecté, puis session conservée après fermeture/relance de l'app. La mécanique (navigation, callback prod, cookie) est déjà validée de part et d'autre ; il ne manque que les identifiants.
2. **L'installeur** : exécuter `desktop/release/4X multijoueur asynchrone Setup 0.1.0.exe`, installer, jouer, désinstaller (panneau de configuration).
3. Calibration libre : taille par défaut 1280×720 fenêtré, F11 plein écran, confirmation de sortie en partie (message natif), titre de fenêtre — tout est dans `config/prod.json` ou une ligne de `main.ts` si Erik veut autre chose.

## 7. Écarts, limites, pièges découverts

- **BUG CORRIGÉ (19/09, remonté par Erik) — carte noire en partie** : la CSP initiale (`script-src 'self' 'unsafe-inline'`) bloquait `new Function()`, que PixiJS 8 utilise pour générer ses shaders (`_unsafeEvalCheck`) — le renderer WebGL refusait de se créer, canvas absent, zone noire. Correctif : `'unsafe-eval'` ajouté au `script-src` de la CSP de la coquille (compromis documenté dans `csp.ts` — le client web, que la coquille ne modifie pas, en a besoin par construction). Vérifié : avec CSP activée, canvas présent, WebGL2 actif, zéro erreur console (`scripts/debug-cartenoire.mjs`). **Erik : « C'est parfait cela fonctionne »** (partie réelle dans la coquille, sur prod).

- **Piège profil verrouillé** : un `electron.exe` résiduel tient le verrou du profil → les lancements suivants repartent sur un profil temporaire (symptôme : « session perdue »). `taskkill /IM electron.exe /F` avant une session de test. Documenté dans `desktop/README.md`.
- **Touches injectées par CDP** (Playwright) ne traversent pas `before-input-event` : la validation des raccourcis passe par des touches système réelles (SendKeys) — fait dans `smoke-prod.mjs`.
- Le flux OAuth de prod laisse l'utilisateur sur le client web prod après login (comportement existant du jeu, inchangé par la coquille).
- `desktop/` installe ses dépendances avec `pnpm --ignore-workspace install` (le dépôt racine est un workspace pnpm — sans ce drapeau, pnpm remonte à la racine et n'installe rien).
- Coût disque : ~94 Mo l'installeur, ~250 Mo installé (taille Electron normale).

## 8. État du dépôt

- **Nouveaux fichiers** : `desktop/` (socle), `.github/workflows/desktop-build.yml`, `dev-logs/captures-electron/*` (captures), `REPORT-ELECTRON-SOCLE.md` (ce document).
- **Zéro modification** des fichiers suivis existants (moteur, serveur, `apps/web`, docs) — la règle « zéro impact » du handoff est tenue ; les fichiers non trackés d'Erik n'ont pas été touchés.
- **Aucun commit** : remise de la main — commit/push sur demande explicite d'Erik.
