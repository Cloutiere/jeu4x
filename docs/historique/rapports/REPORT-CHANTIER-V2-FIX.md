# REPORT CHANTIER V2-bis — Correctifs cartes-ressources et slots

Suite de `HANDOFF-CHANTIER-V2-FIX.md` (décisions d'Erik du 05/09, capture de sa
première partie solo). Zéro gameplay, zéro moteur, `schemaVersion` inchangée.

## Livré

1. **Slot uniquement sur tuile à ressource** (`structures3d.ts`) — la pose du
   slot + liseret est passée derrière le test `t.ressource` : plus aucune
   encoche sur une tuile productive vide (remplace le défaut V2 « slot visible
   même vide »). Ville/cratère restent exclues ; l'état neutre « ? » (R-92)
   est inchangé.
2. **Rotation 180° de la tuile entière** (2e itération, à la demande d'Erik —
   « c'est la tuile qu'il faut pivoter, pas la carte ») :
   - `structures3d.ts` : le slot + la carte sont posés à l'offset MIROIR
     `[0, −0.58]` — le coin de la tuile le plus ÉLOIGNÉ de la caméra (nord) ;
     la carte revient à son sens d'origine (le retournement de carte de la
     1re itération est annulé), glyphes sur la face intérieure, qui regarde
     désormais naturellement la caméra ;
   - `world3d.ts` : le calque glyphes du terrain pivote aussi — voies de bus,
     empreintes CPU (positions en miroir + lacet + π) et barettes RAM
     ((dx, dz) → (−dx, −dz)) ; les pulses suivent. La tuile est bien
     symétrique 180° autour de son centre, pas seulement le slot.

## Tests

- `structures3d.test.ts` : le test « slot identique partout, vide sans
  ressource 🔶 » est remplacé par « slot QUE sur tuile à ressource » ; le test
  ville/cratère vérifie désormais zéro slot même avec ressource ; le test fog
  pose le slot sur une tuile à blé ; **nouveau test géométrique** « TUILE
  pivotée 180° » (slot à l'offset miroir — z < 0, coin nord ; glyphes
  `cg:*`/`cgSocle` côté centre de la tuile) ; le bench 40×40 reflète la baisse
  du compte d'instances : **274 slots exacts** (320 tuiles au fer − 46
  villes), contre > 1300 quand le slot était visible même vide.
- Suite complète verte : **867 tests** (695 rules + 107 web + 65 server),
  typecheck et build verts.
- Vérifié en conditions réelles : partie réelle via le pilote
  `dev-logs/scripts/gui-v2.mjs` (partie 2HNMJP, FoundCity tour 1 + bot),
  bascule 3D, zoom sur cartes aux deux itérations — après rotation, les
  cartes sont au fond des tuiles (coin nord), face glyphes vers la caméra,
  aucune encoche sur les tuiles sans ressource. Captures :
  `dev-logs/captures-v2-3d/V2FIX-tuile-pivotee-cartes-coin-nord.png`,
  `V2FIX-vue-generale-tuiles-pivotees.png` (2e itération) et
  `V2FIX-cartes-face-camera-zoom.png`, `V2FIX-vue-generale-slots.png`
  (1re itération, conservées pour l'historique).

## Limites / notes

- `visuel3d.json` n'a pas eu besoin de modification : l'inclinaison de la
  plaque était déjà à 0 ; le retournement est purement un choix de côté
  d'orientation (Y) dans le planificateur.
- Le répertoire contenait les retouches d'atelier d'Erik (Mainframe
  Transistor, visages huttes/villages, unités 3D, catalogue) — **non committées**
  (consigne du handoff) ; elles restent dans l'arbre de travail.
