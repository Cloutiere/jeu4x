# REPORT CHANTIER V2-bis — Correctifs cartes-ressources et slots

Suite de `HANDOFF-CHANTIER-V2-FIX.md` (décisions d'Erik du 05/09, capture de sa
première partie solo). Zéro gameplay, zéro moteur, `schemaVersion` inchangée.

## Livré

1. **Slot uniquement sur tuile à ressource** (`structures3d.ts`) — la pose du
   slot + liseret est passée derrière le test `t.ressource` : plus aucune
   encoche sur une tuile productive vide (remplace le défaut V2 « slot visible
   même vide »). Ville/cratère restent exclues ; l'état neutre « ? » (R-92)
   est inchangé.
2. **Cartes posées face caméra (retournement 180°)** (`structures3d.ts`) — la
   rangée de mini-glyphes de bonus est passée de l'ancienne « face intérieure »
   (côté centre de tuile, -z) au côté sud (+z) : la caméra par défaut (tilt
   58°, azimut 0, au sud) voit désormais la face — couleur + pictogramme +
   glyphes — et non plus le dos/le bord de la carte. Les cartes restent des
   plaques verticales (décision Erik 05/09).

## Tests

- `structures3d.test.ts` : le test « slot identique partout, vide sans
  ressource 🔶 » est remplacé par « slot QUE sur tuile à ressource » ; le test
  ville/cratère vérifie désormais zéro slot même avec ressource ; le test fog
  pose le slot sur une tuile à blé ; **nouveau test géométrique** « carte face
  caméra » (tous les glyphes `cg:*`/`cgSocle` à z > carte.z) ; le bench 40×40
  reflète la baisse du compte d'instances : **274 slots exacts** (320 tuiles au
  fer − 46 villes), contre > 1300 quand le slot était visible même vide.
- Suite complète verte : **867 tests** (695 rules + 107 web + 65 server),
  typecheck et build verts.
- Vérifié en conditions réelles : partie réelle via le pilote
  `dev-logs/scripts/gui-v2.mjs` (partie 2HNMJP, FoundCity tour 1 + bot),
  bascule 3D, zoom sur cartes aux deux états — face lisible, aucune encoche
  sur les tuiles sans ressource. Captures : `dev-logs/captures-v2-3d/
  V2FIX-cartes-face-camera-zoom.png` et `V2FIX-vue-generale-slots.png`.

## Limites / notes

- `visuel3d.json` n'a pas eu besoin de modification : l'inclinaison de la
  plaque était déjà à 0 ; le retournement est purement un choix de côté
  d'orientation (Y) dans le planificateur.
- Le répertoire contenait les retouches d'atelier d'Erik (Mainframe
  Transistor, visages huttes/villages, unités 3D, catalogue) — **non committées**
  (consigne du handoff) ; elles restent dans l'arbre de travail.
