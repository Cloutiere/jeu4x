# HANDOFF-ELECTRON-SOCLE — Le socle Electron de distribution desktop (tranche 1, zéro Steam)

**Chantier d'infrastructure desktop.** Objectif : un **wrapper Electron dans les règles de l'art** qui fait tourner le jeu en fenêtre dédiée sur Windows — **sans aucune intégration Steam** (tranche 2, après approbation du compte Steamworks d'Erik). Le client web reste inchangé ; l'Electron l'embarque/héberge et pointe sur le backend de prod. Décision d'Erik du 18/09, tranche 1 validée par le pilotage.

## 1. Préalables

1. Lire `PROJET.md` (architecture client-serveur, prod), `PILOT-HANDOFF.md` §5 (ports : web dev 5174, worker 8787 ; pièges), et explorer `apps/web` (build Vite/Svelte, routes hash `#/`, session/OAuth : comment le token de session est obtenu et stocké — localStorage ? cookie ? — et où l'OAuth Google/Discord redirige, `APP_BASE_URL`).
2. Baseline : suite verte, typecheck 4/4, `git status` propre (le répertoire contient de nombreux fichiers non trackés d'Erik — `image_ref/`, ateliers, PDF : **ne jamais les ajouter à un commit**) ; atelier assets en parallèle possible — zones disjoints.
3. **Zéro impact** : aucun changement à `apps/web` (au-delà d'un éventuel script de build), au serveur, au moteur ; le drapeau `rendu3d` intouché ; rien de distribué publiquement.

## 2. Mission

### M1 — Le socle (`desktop/` à la racine)
1. Projet Electron minimal : `main` (process principal), `preload` (pont sécurisé), build via **electron-builder** ; dépendances confinées au dossier `desktop/` (workspace pnpm si propre, sinon dossier autonome avec son `package.json`) ;
2. **Le client embarqué — décision de tranche à faire EN SESSION avec Erik** (investigation d'abord) :
   - **Option A (défaut proposé) — coquille prod** : la fenêtre charge l'URL de prod (client toujours à jour, OAuth sans friction d'origine) ; variable de build `GAME_SERVER_URL` (prod / dev local 5174 / staging futur) ;
   - **Option B — build embarqué** : le `dist/` de `apps/web` est embarqué et chargé en local (version figée, lancement hors prod) — **à ne retenir que si la session OAuth fonctionne depuis l'origine locale** (le callback OAuth redirige vers la prod : vérifier si le token de session survit au changement d'origine ; si c'est cassetête, option A). Si B est retenue, le chargement passe par un protocole/service local propre (pas `file://` brut) et l'URL serveur reste en variable ;
3. Les deux options : l'URL serveur **jamais codée en dur** ; un fichier de configuration par environnement (prod/dev), lisible au démarrage.

### M2 — La fenêtre de jeu
Plein écran/bordless au choix d'Erik (défaut : fenêtrable + plein écran F11), icône du jeu, pas de menu Chromium, raccourcis navigateur neutralisés (Ctrl+R, zoom molette), titre propre, gestion de redimensionnement propre (le canvas PixiJS suit), quitter propre (confirmation si en partie — message natif).

### M3 — La sécurité (règles de l'art, non négociable)
`contextIsolation: true`, `nodeIntegration: false`, sandbox renderer, CSP limitée au nécessaire (connect-src `wss://`/`https://` vers la prod uniquement), pas de navigation libre (toute fenêtre/iframe nouvelle est interceptée), `webSecurity` jamais désactivé. La fenêtre OAuth (M4) est la seule fenêtre additionnelle.

### M4 — Le login OAuth dans Electron (le frottement n°1 — tester TÔT)
Google/Discord depuis la fenêtre : tester le flux complet (popup intégrée vs navigateur système + retour), valider l'ouverture et le retour dans le jeu (le format des fenêtres popup peut varier : à régler), la session persistante au redémarrage de l'app. **Si le flux bloque techniquement, documenter l'écart et proposer la solution (ex. navigation système + reprise) à Erik — ne pas bricoler un contournement fragile.**

### M5 — Builds et vérifications
1. **Installeur Windows NSIS** via electron-builder (icône, nom, metadata) ; la **signature de code** est un paramètre (Erik n'a pas encore de certificat : laisser la place, documenter la commande à ajouter) ; build localement exécutable + artifact CI (sans distribution) ;
2. **Bench dans la fenêtre** : le labo/bench PixiJS tourne à 60 FPS (comparaison Chrome vs Electron — l'attendu : identique) ;
3. **Parcours complet** : lancer l'app → lobby → partie solo vs bot → quelques tours → déconnexion/reconnexion, session persistée → quitter/relancer sans perte ;
4. Tests automatisés là où ça vaut (config/environnement, protocole de chargement, neutralisation des raccourcis — purs) ; suite verte forcée, typecheck 4/4, `schemaVersion` 25, zéro diff moteur/serveur/apps-web (sauf script de build si option B).

## 3. Périmètre interdit

- Steamworks (SDK, ticket, overlay, succès — tranche 2) ; toute modification du moteur/serveur ; `assets-src` ; toute distribution publique (Erik seul exécute) ; les fichiers non trackés d'Erik.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie — captures de la fenêtre de jeu, du login OAuth, de l'installeur). Rapport `REPORT-ELECTRON-SOCLE.md` (y compris : option A/B retenue et pourquoi, le verdict OAuth, la procédure de build/signature à venir), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
