# HANDOFF-ECLAIRAGE — Calibrer l'éclairage du jeu : les assets externes ne doivent plus être fade

**Constat d'Erik (11/09)** : ses assets externes (tuiles Tripo, unités, ville) sont **superbes dans Tripo mais fade en jeu**. Diagnostic du pilot : ce n'est ni la résolution de texture (512/1K suffit — 8K ne changerait rien au fade et coûterait cher en VRAM) ni les fichiers — c'est l'**écart entre l'éclairage « studio » de Tripo et le rig sobre du jeu** (hémisphérique 0,95 + directionnelle 0,85 + point néon 0,45, pas d'IBL, bloom éteint par défaut). Ce handoff calibre l'éclairage, data-driven, avec validation d'Erik à l'œil.

## 1. Préalables

1. Lire `PROJET.md`, `PILOT-HANDOFF.md` §3, `STYLE-3D.md` et `FONDERIE.md` (§« réglages de rendu copiés du jeu » — la boucle fonderie↔jeu doit rester fidèle).
2. Baseline : tests verts, typecheck 4/4, `schemaVersion` **19** (inchangée), `git status` propre.
3. **Zéro gameplay** : `packages/rules`, serveur, `schemaVersion` intouchés. Périmètre : rig d'éclairage/exposition du rendu 3D + synchronisation du visualiseur fonderie.
4. Règle de travail d'Erik (posée au chantier colline) : **validation locale avec captures AVANT tout commit** — aucune itération en prod.

## 2. Mission

### M1 — Le comparatif (le cœur de la méthode)
1. Choisir 2-3 assets représentatifs dont Erik trouve le rendu fade (une tuile — ex. prairie ou plaine —, une unité v3, la ville) et fabriquer un **A/B dans le labo `#/lab3d` ou l'atelier** : rig actuel à gauche, rig candidat à droite, MÊME asset, MÊME caméra.
2. Captures du comparatif dans `dev-logs/captures-eclairage/` — c'est sur elles qu'Erik tranche.

### M2 — Les leviers (tous data-driven dans `visuel3d.json` §nouvelle section `eclairage`, validée par `spec3d.ts`)
1. **Exposition globale** (le curseur le plus rentable — un seul nombre, effet immédiat sur tout le rendu) ;
2. **Directionnelle** : intensité + direction (une lumière clé plus marquée redonne du modelé) ;
3. **Hémisphérique** : intensité (la BAISSER resserrera le contraste — c'est probablement elle qui lessive) ; couleurs ciel/sol ajustables ;
4. **Lumière d'environnement légère (IBL)** : une skybox simple (RoomEnvironment ou équivalent Three, coût GPU quasi nul) pour que les faces hors lumière ne tombent pas dans le gris terne — à mesurer au bench avant/après ;
5. **Point néon** conservé (c'est l'accent du langage du jeu) ;
6. Toute valeur au-delà du rig actuel : défauts proposés par l'agent, **Erik tranche à l'œil** — les défauts ne sont pas le but, le look validé l'est.

### M3 — Synchroniser la fonderie
Copier le rig final dans `fonderie/viewer.js` (convention « copié, jamais importé ») — la boucle de validation visuelle d'Erik doit rester fidèle à ce qu'il verra en jeu.

### M4 — Vérification
1. Suite complète + typecheck verts ; tests du chargeur étendus à la section `eclairage` (entrées invalides refusées proprement, défauts si section absente — rétrocompatibilité sans surprise).
2. **Bench 40×40 avant/après** : 60 FPS exigé ; l'IBL est le seul levier avec un coût — s'il coûte, le chiffrer et le montrer à Erik (il décide de le garder ou non).
3. Vérification visuelle en partie solo (captures `dev-logs/captures-eclairage/`) : carte complète, unités, ville — y compris avec le bloom allumé et éteint.
4. Vérifier que l'atelier et le labo montrent le nouveau rig (mêmes réglages partout).

## 3. Critères d'acceptation

- **Erik valide à l'œil le comparatif A/B** : les assets ne sont plus fade, le langage néon du jeu est préservé, aucune zone cramée ou trop sombre.
- Rig 100 % data-driven (`visuel3d.json` §`eclairage`) : réajuster = éditer le JSON, sans code ; défauts propres si la section est absente.
- Fonderie synchronisée ; bench 60 FPS (ou coût IBL chiffré et accepté par Erik) ; suite verte ; `schemaVersion` 19 ; zéro gameplay.

## 4. Périmètre interdit

- Modifier les assets eux-mêmes (textures, facteurs cuits — le rig est le levier, pas la re-cuisson) ;
- Le bloom (la bascule en partie existe déjà, décision Erik du 06/09 — ne pas y toucher) ;
- Le mode 2D, les sprites, les glyphes ; V3 renommage, RELECTURE-3D, tuiles restantes (forêt/désert/eau).

## 5. Fin de session

Rapport `REPORT-ECLAIRAGE.md` (avec le comparatif et les valeurs retenues), commit/push sur demande explicite d'Erik APRÈS validation visuelle locale, arrêt, remise de la main. Le pilot archive.
