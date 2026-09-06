# REPORT-ATELIER-GUERRIER-3D — Refonte du Guerrier 3D en humanoïde cyber

**Session d'atelier visuel** (rituel `ATELIER-ASSETS.md`, handoff `HANDOFF-ATELIER-GUERRIER-3D.md`) — 06/09.
**Statut : première livraison faite, en attente des retouches d'Erik dans l'atelier. Rien n'est commité** (le commit se fera sur sa demande explicite, `pnpm test` + `pnpm typecheck` verts — vérifiés, 961 tests web inclus).

## 1. Ce qui a été livré (M1)

Le gabarit `guerrier` (« Script de Base ») est passé de la créature à 4 pattes à un **humanoïde cyber** conforme à la référence `image_ref/guerrier.jpg` :

- **casque à visière** néon (pas de visage) + crête ; **torse plastronné** (abdomen + plastron saillants) ; **épaulières** facettées inclinées ; **bras/moufles** (avant-bras droit levé présentant l'épée) ; **jambes/bottes** en stance légère — pieds posés sur l'élévation de la tuile ;
- **cœur-process néon** conservé sur le plastron (identité Mainframe) ;
- **épée à lame plate** accent joueur (R-65) avec **fil émissif** : traits blancs aux deux bords de la lame + halo (emissiveMap — du *shading*, zéro géométrie de lignes) ;
- **effet « hologramme matriciel » par shading** : le corps sombre porte une emissiveMap « arêtes néon + rangées de glyphes binaires » (déterministe, `mulberry32`) — chaque plaque apparaît bordée de néon, style wireframe de la référence, sans mailler les lignes.

### Data-driven et validation (M1.2)

- `visuel3d.json` §`structures.uniteGuerrier` remplacé par le gabarit humanoïde (toutes cotes/angles/couleurs/émissifs calibrables, groupés par partie du corps) ;
- `spec3d.ts` : interface `SpecUniteGuerrier` réécrite + **`validerUniteGuerrier` exporté**, appelé au chargement — tout champ manquant, couleur invalide, dimension non positive ou fraction hors [0,1] est **refusé avec erreur explicite** (16 chemins de champs testés) ;
- mapping `§unites3d` inchangé (`guerrier → guerrier`) — zéro changement gameplay, `packages/rules` et serveur intacts, `schemaVersion` 19 inchangée.

### Budget (M1.3) — mesuré (bench vitest)

| Métrique | Valeur |
|---|---|
| Triangles par unité | **284** (corps fusionné 252 + lame 12 + cœur 8 + visière 12) — budget < 5 000 largement tenu |
| Draw calls | **4 par scène** pour TOUTE l'armée de guerriers (pools instanciés `guCorps`/`ugCoeur`/`guVisiere`/`guLame`), quel que soit l'effectif |
| Matériaux | 4 (corps sombre à arêtes émissives, cœur néon, visière néon, lame accent à fil) |

Note d'architecture : le handoff visait « 1 mesh fusionné + 2 matériaux, ~1 draw call/unité ». Le rendu retenu est **moins coûteux** que l'objectif (4 draw calls **par scène**, pas par unité — l'instancing rend le coût marginal d'une unité supplémentaire nul), en restant dans l'idiome existant des pools (zéro refonte du renderer). Les 4 matériaux séparent ce qui n'est pas fusionnable par instance : accent joueur (lame) vs néon fixe (cœur/visière) vs corps sombre.

### Effets de bord (M3)

- **Archer inchangé** : le gabarit créature (pools `ug*`) lui reste dédié ; le pool `ugCoeur` (octaèdre) est partagé — son matériau lit `uniteGuerrier.coeur` (mêmes noms de champs dans le nouveau spec).
- **En partie (GameCanvas, mode 3D)** vérifié sur une vraie partie solo vs bot (partie `93Q6WS`, serveur dev 8787) : le Guerrier s'affiche en 3D, sélection au clic (anneau + panneau « Guerrier — PV 3/3, PM 1/1 »), barre projetée, Colon toujours en sprite 2D (pas de modèle) — captures `11`/`12`.
- **Retouches d'Erik en vivo** :
  1. « il est trop petit, il faut une dimension normale » → `echelle` 1.15 → 2.3 puis **→ 2.875** (×1,25 supplémentaire validé) — hauteur ~1,5 unité monde ;
  2. « arêtes plus lumineuses + intérieur transparent teinté par la couleur des joueurs » (validé) → **hologramme** : `aretes.intensite` 0.6 → 2.0 avec traits plus épais ; corps **semi-transparent** (`materiau.opacite` 0.5, nouveau champ du spec) dont l'intérieur est **teinté par l'accent joueur** (les nuances du gabarit sont devenues des gris neutres multipliés par l'accent de l'instance — chaque joueur a son hologramme à sa couleur ; le cœur et la visière restent en néon fixe de l'identité du jeu) ;
  3. **Acceptation finale d'Erik : « L'image est bonne tu peux commiter et pousser »** (06/09).

## 2. Atelier et captures (M2)

- La fiche `structures:uniteGuerrier` (« Unité 3D — Script de Base (Guerrier humanoïde cyber) ») montre le nouveau modèle : isolement, orbite, Bloom, grille hex, A/B.
- 12 captures dans **`dev-logs/captures-guerrier-3d/`** : trois-quarts avant (bloom on/off), fond clair (bloom on/off), grille hex (fond sombre/clair), profil, dos, vue d'ensemble, **2 captures en partie 3D** (dont sélection).
- Test de complétude du catalogue (`atelier-catalogue.test.ts`) : vert.

### Fix outil atelier au passage 🔶

La bascule **« Fond clair » de l'atelier était cassée** (préexistante, jamais fonctionnelle : le fond 3D ne changeait jamais). Cause : le fond était posé par un `$effect` Svelte dépendant de `stage`, variable non réactive. Corrigé impérativement (`appliquerFond()` appelé à l'installation du stage et au clic) — `Atelier.svelte` uniquement, zéro impact jeu.

## 3. Tests

- Suite complète **verte** (web 145 dont les nouveaux : rendu humanoïde, budget < 5 000 tris testé, chargeur strict 16 chemins de refus), typecheck **4/4**.
- Piège port 8787 rencontré et traité : deux `wrangler dev` périmés de sessions antérieures relançaient leurs `workerd` — chaînes tuées, worker relancé proprement sur 8787 (proxy Vite).

## 4. Reste pour Erik (acceptation visuelle + itérations)

1. Regarder le Guerrier dans l'atelier (`#/atelier` → « Unité 3D — Script de Base (Guerrier humanoïde cyber) ») et en partie — **c'est lui qui dit « commite »** (atome par atome) ;
2. Calibrages à la main dans `visuel3d.json` §`uniteGuerrier` si envie : `echelle` (2.3), `materiau.aretes.intensite` (0,6 — intensité des arêtes néon), `casque.visiere.emissif`, `arme.lame.fil.emissif` (2,6), proportions par partie du corps ;
3. Le Handoff prévoit la même refonte pour l'**Archer** en session ultérieure (son gabarit créature est intact).

## 5. Fichiers touchés (aucun commit)

- `apps/web/src/lib/render3d/visuel3d.json` (gabarit humanoïde) ;
- `apps/web/src/lib/render3d/spec3d.ts` (spec + validateur strict) ;
- `apps/web/src/lib/render3d/structures3d.ts` (usine `creerGuerrierHumain`, pools `gu*`, planificateur, textures arêtes/fil) ;
- `apps/web/src/lib/atelier/catalogue.ts` (libellé de fiche) ;
- `apps/web/src/pages/Atelier.svelte` (fix « Fond clair ») ;
- tests : `structures3d.test.ts`, `unites3d.test.ts`, `visuel3d.test.ts` ;
- `dev-logs/captures-guerrier-3d/` (12 captures).
