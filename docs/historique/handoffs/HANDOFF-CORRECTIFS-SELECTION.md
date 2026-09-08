# HANDOFF-CORRECTIFS-SELECTION — Clics sélection/déplacement, flèches orphelines, aperçu animé

**Trois signalements d'Erik du 08/09** (post-TRAVAIL-VILLE-3D). Zéro changement gameplay : input, rendu d'overlay et aperçu uniquement.

## 1. Préalables

1. Lire `PROJET.md`, `PILOT-HANDOFF.md` §3, et les rapports DEPLACEMENT-PLANIFIE + TRAVAIL-VILLE-3D (aperçu, flèches, fantômes).
2. Baseline : tests verts, typecheck 4/4, `schemaVersion` **19**, `git status` propre (attention : `unites3d.test.ts` a des modifications préexistantes hors mission — ne pas les absorber, convention des dernières sessions).
3. **Phase d'investigation d'abord** : pour chacun des 3 signalements, localiser la cause dans le code AVANT de corriger et la consigner dans le rapport (le « pourquoi » vaut la moitié de la mission).

## 2. Mission

### M1 — Les rôles des clics (sélection vs programmation)
**Comportement voulu par Erik** : le **clic droit doit changer de sélection** (unité ou ville sous le curseur), et ne doit PLUS programmer un déplacement ; la **programmation de déplacement se fait au clic gauche**.
1. Investiguer le routage actuel des clics (2D et 3D — le picking 3D est calé sur le sprite 2D, cf. sessions passées) : où le clic droit déclenche `pathTo`/programmation, où le clic gauche sélectionne.
2. Inverser/remapper proprement : clic droit = sélection de ce qui est sous le curseur (unité, ville, et en priorité la sélection existante si rien de nouveau) ; clic gauche = sélection d'une unité PUIS programmation de son déplacement sur les cases suivantes (schéma « clic-gauche destination »), en 2D ET 3D.
3. **Point à clarifier avec Erik en session** (il est dispo, ne pas inventer) : le comportement exact du clic gauche sur une unité déjà sélectionnée (re-sélection ? déplacement direct ?), et si le clic droit garde des actions secondaires existantes (annulation d'ordre ?). Proposer un défaut, faire trancher, consigner.
4. Les menus/annulations portés par le clic droit aujourd'hui (si présents) sont relocalisés sans perte — inventorier avant.

### M2 — Flèches orphelines à l'annulation d'ordres
**Symptôme** : en annulant les ordres, le **corps de la flèche demeure** sur le terrain alors que la **pointe disparaît** — le dégone d'annulation nettoie le fantôme/pointe mais pas le chemin (ou les deux passent par des pools de rendu distincts dont un n'est pas purgé).
1. Investiguer : corps et pointe de flèche sont-ils rendus par des pools/entrées séparés ? Qui appelle la purge à l'annulation (cancel d'ordre, replace, fin de tour) ?
2. Corriger à la racine : l'annulation (et tout retrait d'ordre — remplacement, abandon) purge corps + pointe + fantôme **ensemble**, et ajouter un test qui l'attache (annulation → aucune géométrie de flèche résiduelle dans les stats/pools).
3. Vérifier les cas limites : annulation de TOUTES les flèches d'un coup (si l'UI le permet), re-programmation après annulation, flèches multi-étapes (corps vert d'action finale inclut).

### M3 — L'aperçu animé du déplacement programmé
**Attendu par Erik** (de mémoire du chantier DEPLACEMENT-PLANIFIÉ) : pendant la programmation, l'unité doit être vue **en déplacement** vers sa destination — aujourd'hui elle reste en place jusqu'à la résolution.
1. Investiguer ce qui existe : les fantômes aux destinations (DEPLACEMENT-PLANIFIÉ) sont rendus ? L'unité reste-t-elle en position source dans le calque ?
2. Implémenter l'**aperçu animé** : une copie translucide de l'unité (ou son fantôme) **glisse le long du chemin programmé** (animation en boucle douce, vitesse lisible, 2D et 3D) — l'unité réelle reste à sa case source jusqu'à la résolution (miroir du moteur, inchangé). L'aperçu s'arrête au bord du fog + 1 pas (R-161) comme les flèches.
3. Cohérence : cet aperçu coexiste avec les flèches et le rayon de cultivation sans se chevaucher visuellement ; il disparaît proprement à l'annulation (lien avec M2 — un seul chemin de purge).
4. Perf : une animation de preview ne doit pas instancier un nouveau modèle par frame (réutiliser le pool du modèle).

## 3. Critères d'acceptation

- Clic droit = changement de sélection (unité/ville), jamais un déplacement programmé ; clic gauche = programmation — en 2D ET 3D ; comportements ambiguïtés tranchés par Erik et consignés.
- Annulation d'un ordre : plus AUCUNE trace de flèche (corps, pointe, fantôme) — verrouillé par un test.
- L'unité programmée montre un aperçu animé glissant le long de son chemin (2D et 3D), l'unité réelle restant en place ; disparition propre à l'annulation.
- Suite complète verte + typecheck 4/4 ; bench sans régression ; captures `dev-logs/captures-correctifs-selection/` ; vraie partie solo jouée (sélection, programmation, annulation en 2D et 3D).

## 4. Périmètre interdit

- Toute règle gameplay (ordres, priorité R-159, validation serveur) ; `packages/rules` ; serveur ; `schemaVersion` ;
- Le design des marqueurs/fantômes existants au-delà des 3 signalements ;
- V3 renommage, RELECTURE-3D, tuiles terrain T5.

## 5. Fin de session

Rapport `REPORT-CORRECTIFS-SELECTION.md` (avec les causes racines des 3 bugs), commit/push sur demande explicite d'Erik, arrêt, remise de la main. Ne pas archiver le handoff ni éditer PROJET.md/PILOT-HANDOFF.md (le pilot s'en charge).
