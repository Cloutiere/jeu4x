# HANDOFF-ORIENTATION-UNITES — Les unités regardent dans le sens de leur déplacement

**Décisions Erik 17/10** (tranchés D1-D5 présentés — veto possible). Chaque unité affiche une orientation droite/gauche déterminée par la case D'ORIGINE de son dernier mouvement (3 voisins à gauche ↔ 3 à droite) ; création et début de partie = droite.

## 1. Préalables

- Lire `hex.ts` (DIRECTIONS — les 6 voisins se partagent en 3 gauche : O/N-O/S-O, et 3 droite : E/N-E/S-E — VERIFIER le mapping en espace colonne CARTE-RONDE T1), R-40..R-44 (mouvements, premier pas), PILE-AFFICHÉE/positions dessinées, PLACEMENT-MELEE, le rendu des sprites (calques entités, `textures.ts`).
- Baseline : suites vertes à jour, `schemaVersion` 27. Champ ADDITIF attendu (miroir du flag `arrivanteSurCase` — pas de migration si optionnel). Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 17/10 — non négociables)

- **D1 — État** : champ optionnel `faceGauche: boolean` sur `Unit` (défaut absent = droite) ; mis à jour à chaque PREMIER pas de mouvement résolu : direction(origine → destination) gauche → `faceGauche = true`, droite → `false` ; mouvement multi-tours = orientation du dernier pas exécuté ; création/spawn/début de partie = droite (jamais défini). Barbares compris, navires compris, GP compris ; à bord = suit son transport.
- **D2 — Rendu miroir** : retournement AU RENDU (`scale.x = −1`) selon `faceGauche` — AUCUN asset miroir à produire ; s'applique au sprite terrain, aux icônes/compactes (garnison — icône symétrique : au choix de l'agent, consigné), aux positions dessinées et au playback/relecture ; copies couture comprises.
- **D3 — Inventaire des faces natives** : l'agent dresse la TABLE par type (l'art regarde-t-elle à droite ?) en inspectant les cuites/captures ; bascule data-driven `faceDroiteParDefaut: false` par type pour corriger sans code ; la table complète figure au rapport pour validation à l'œil d'Erik.
- **D4 — Zéro gameplay** : l'orientation n'affecte ni combat ni portée — affichage/état seulement ; événement : aucun (le champ voyage dans l'état, fog standard).
- **D5 — Déterminisme** : rien de nouveau côté RNG ; reprise d'une partie antérieure = tout à droite (défaut), consigné.

## 3. Mission

- **L1 — test-first (moteur)** : helper pur `directionOrientante(origine, destination)` (les 6 voisins → gauche/droite ; cas hors voisinage = pas d'orientation) ; mise à jour de `faceGauche` au premier pas (mouvement simple, multi-tours, gelé repris, dépose navale — la dépose oriente ? tranché par défaut : OUI, côté du pas de dépose), création = absent.
- **L2 — moteur** : D1 (Phase A), migration/optionnelité D5, serveur `orderShapeError` non concerné (aucun nouvel ordre).
- **L3 — client** : retournement au rendu (sprite + compacte), lecture de l'état, D3 (table + bascules data-driven).
- **L4 — captures GUI avant commit** (`dev-logs/captures-orientation-unites/`) : unité allant vers l'Est puis vers l'Ouest (flip), début de partie à droite, pile mêlée à orientations mixtes, relecture cohérente, couture.
- **L5** : suites vertes complètes, RULES.md (une règle courte §6 « orientation »), commit, push, rapport `REPORT-ORIENTATION-UNITES.md` (table D3 complète, 🔶).

## 4. Critères d'acceptation

1. Une unité qui marche vers l'Est regarde à droite ; vers l'Ouest, à gauche ; en début de partie, à droite ;
2. L'orientation persiste entre les tours et voyage dans la relecture ;
3. Table des faces natives livrée pour calibrage à l'œil ;
4. Suites et bancs verts, `schemaVersion` inchangée (champ optionnel).

## 5. Périmètre interdit

Toute valeur de gameplay ; les assets (aucun miroir cuit) ; la mêlée/placement ; le 3D (dort) ; `schemaVersion` sauf nécessité démontrée.

## 6. Fin de session

Rapport (table des faces, décision dépose, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
