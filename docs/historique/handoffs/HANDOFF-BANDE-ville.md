# HANDOFF-BANDE-VILLE — Bannière de ville style Civ VI

**Décisions Erik 07/10** (tranchés D1-D7 présentés — veto possible). Bande au-dessus de chaque ville : symbole de nation, nom, pop, tours avant croissance, item en production (initiale en attendant l'art) + tours restants.

## 1. Préalables

- Lire le rendu des villes 2D (`GameCanvas`/calques entités — le badge pop actuel), `wrap.ts` (copies couture, CARTE-RONDE T2), les logos de nation (lobby/pastilles — `nations.ts`, `logoEchelle`), les données déjà affichées dans `PanneauVille` (pop, tours avant croissance, item + ETA, `coutItem`/`nomItem` MERVEILLE-COUT-FILE), le filtrage fog (`getFilteredState` — ce que le client sait de l'ennemi).
- Baseline : suites vertes à jour, `schemaVersion` 27, **client seul**. Vérifier `git status` (sessions parallèles possibles ; serveur dev 5174 d'Erik — ne pas y toucher).

## 2. Décisions (Erik 07/10 — non négociables)

- **D1 — Contenu** : bande AAA or-sur-sombre au-dessus du sprite ville — **logo de nation** à gauche, **nom** de la ville, **cercle pop** ; en dessous : **tours avant croissance de la pop**, puis **cercle production** (INITIALE du nom de l'item — `nomItem` — en attendant les images d'Erik : structure prévue pour les accueillir) et **tours restants**. Aucun visage, aucun sourire.
- **D2 — Capitale** : étoile dorée à côté du nom.
- **D3 — Fog** : bannière pour toute ville visible ; croissance/production/ETA **uniquement pour les villes du joueur** — rien ne fuit sur l'ennemi (miroir du filtrage existant).
- **D4 — File vide** : cercle production + ETA masqués (pas de « Infinity » ni de zéro).
- **D5 — Rendu** : la bannière REMPLACE le badge pop actuel ; au-dessus du sprite ville, SOUS les unités ; dessinée sur les copies couture (`wrap.ts`) ; lisible au zoom par défaut, calibrage 🔶 (taille/alpha) au fichier de style existant.
- **D6 — Interaction inchangée** : le clic bannière = clic ville (alternance R-2, PanneauVille).
- **D7 — Masquage** : vue ville zoomée et relecture — au choix de l'agent, consigné.

## 3. Mission

- **L1 — test-first (client)** : tests du constructeur de bannière (pure function — données → segments : nom, pop, capitale, croissance si mien, item+ETA si mien, rien si fog ennemi), fallback initiale, file vide masquée.
- **L2 — rendu** : composant/couche bannière (textes poolés — leçon VUE-VILLE-PERF : zéro allocation par frame), câblage copies couture, z-order.
- **L3 — vérification GUI locale avec captures AVANT commit** : partie solo légale — sa capitale (pop, croissance, item unité ET bâtiment/merveille, file vide), une ville ennemie visible (sans fuite), une ville à cheval sur la couture, zoom in/out. Captures `dev-logs/captures-bande-ville/`.
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push, rapport `REPORT-BANDE-VILLE.md` (🔶 calibrages visuels à l'œil).

## 4. Critères d'acceptation

1. Bannière conforme à la référence d'Erik (moins visage/sourire, logo nation à gauche) ;
2. Aucune fuite d'info ennemie (production/growth absents) ;
3. Couture propre, 60 FPS (pas de rebuild par frame) ;
4. Badge pop actuel disparu (pas de doublon).

## 5. Périmètre interdit

Moteur/serveur/protocole ; le clic ville et PanneauVille (l'affichage du panneau est inchangé) ; les données de ville ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Mini-rapport (🔶 calibrages), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
