# HANDOFF-ELECTRON-RESOLUTION — Résolution logique fixe 1280×720 et modes d'affichage (fenêtre par défaut, letterbox)

**Retouche du socle Electron** (suite de `REPORT-ELECTRON-SOCLE.md`, option A). Décisions d'Erik du 18/09 : **résolution logique fixe 1280×720** — peu importe la machine, l'écran ou le facteur d'échelle Windows, tout le monde voit **la même vue globale** ; **mode 1 (fenêtre fixe dimensionnée) par défaut**, plein écran letterbox accessible (F11 et bouton). **Le jeu (`apps/web`) n'est pas touché.**

## 1. Préalables

1. Lire `docs/historique/rapports/REPORT-ELECTRON-SOCLE.md` (socle, option A, sécurité, bug carte noire) ;
2. Baseline : suite verte, typecheck 4/4, `git status` propre (fichiers non trackés d'Erik intouchés).
3. **Zéro gameplay** : le canvas du jeu suit déjà la taille de son conteneur — c'est le **conteneur** (la fenêtre Electron) qui devient fixe ; aucune logique de jeu, aucun changement `apps/web`.

## 2. Mission

### M1 — La résolution logique fixe (data-driven)
1. **Configuration** : un fichier de config desktop (éditable par Erik sans code — ex. `desktop/config.json` ou section du fichier existant) : `resolutionBase: { largeur: 1280, hauteur: 720 }`, `modeDefaut: "fenetre"`, réutilisant le mécanisme de config de l'option A ;
2. **Fenêtre fixe dimensionnée** (mode par défaut) : fenêtre de contenu exactement 1280×720 (bordures/barre de titre en sus), **non redimensionnable par défaut** ;
3. **Plein écran letterbox** (F11 / bouton) : le contenu 1280×720 est **mis à l'échelle au maximum en préservant le ratio 16:9** — **bandes noires** si l'écran n'est pas 16:9 (jamais d'étirement, jamais de crop) ; échappement par F11/Échap comme aujourd'hui ;
4. **Neutralisation du DPR** : facteur d'échelle forcé/normalisé (`deviceScaleFactor`) pour que le rendu soit identique au pixel sur toutes les machines (le piège dpr>1 déjà mordu en 3D) — le texte net reste l'objectif : si le nettement souffre au scale-up, tester `useContentSize` et documenter le compromis ;
5. La vue reste **identique au pixel** entre : fenêtre, plein écran, et le navigateur à viewport 1280×720 (référence de test du projet).

### M2 — Vérification
1. Tests purs : config (valeurs, défauts, valeurs invalides refusées), calcul de letterbox (ratios 16:9, 16:10, 21:9, portrait) ;
2. e2e + captures `dev-logs/captures-electron-resolution/` : fenêtre 1280×720, letterbox sur ratio non-16:9 (émuler si nécessaire), F11 aller-retour, bench 60 FPS conservé ;
3. **La vue identique** : capture comparée fenêtre Electron vs navigateur 1280×720 (même composition) ;
4. Suite verte forcée, typecheck 4/4, `schemaVersion` 25, zéro diff `apps/web`/moteur/serveur/3D.

## 3. Périmètre interdit

- Le jeu (`apps/web`), le moteur, le serveur, Steamworks (tranche 2), `assets-src` ; tout changement d'auth/session (option A inchangée).

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-ELECTRON-RESOLUTION.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
