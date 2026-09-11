# HANDOFF-COLLINE-HAUTEUR — caler la tuile colline .glb à la bonne hauteur (validation locale AVANT commit)

## 1. L'objectif

La tuile **colline** (asset Tripo `colline_v2.glb`, rendue par le calque .glb depuis le
09/09) **flotte au-dessus des autres tuiles** : sa base est trop haute, on voit un jour
entre elle et les tuiles voisines (prairies, plaines, forêts procédurales).

**Le but** : sa BASE doit reposer exactement comme les autres tuiles .glb — légèrement
enfoncée sous le plateau des prairies/forêts, sans jour visible, sans flotter. Le rendu
doit être validé **EN LOCAL avec captures d'écran montrées à Erik** avant tout commit :
le déploiement pousse automatiquement sur la prod à chaque push (on a itéré 4 fois en
prod pour rien — interdit désormais).

## 2. État actuel (branche main, tout est committé et déployé)

- `apps/web/public/modeles/colline_v2.glb` : l'asset, avec **dy = −0.3 cuit dans la
  translation du nœud glTF** (outil `fonderie/outils/preparer-structure-tripo.mjs`).
- `visuel3d.json` §`structures.tuileColline3d` : `{ glb: "colline_v2.glb", echelle: 2.0,
  rotation: 0, survol: 0.05 }`.
- **Géométrie de la pose en jeu** : `y_tuile = elev_colline + (y_local + dy_nœud) × echelle + survol`
  avec `elev_colline = 0.3` (visuel3d.json §terrains.colline), echelle 2.0.
  → base actuelle = 0.3 + (0 − 0.3) × 2 + 0.05 = **−0.25**.
- **La référence** : les tuiles prairie (`prairie_v2.glb`, dy nœud −0.095) affichent un
  rebord à **0.000** et un plateau en creux à **≈ −0.035** ; la forêt procédurale a son
  top à **0.000** exactement. C'est l'étalon visuel validé par Erik.
- Le colline culmine à ~1.0 (proportion du modèle — non négocié pour l'instant).

## 3. Pourquoi ça flotte (causes racines déjà éliminées — ne PAS refuser)

1. ~~Transform de nœud perdu~~ : corrigé le 10/09 — `parserModeleGLB` (unitesglb.ts)
   applique maintenant `matrixWorld` aux géométries. La translation du nœud EST appliquée.
2. ~~Caches edge Cloudflare~~ : corrigé par renommages (v1→v2). À chaque changement de
   fichier .glb, **renommer le fichier** (v3, v4…) ou le cache edge peut servir
   l'ancienne version pendant des minutes — piège vérifié 3 fois.
3. ~~Commit manquant~~ : le 11/09, une spec modifiée n'avait pas été commitée → CI en
   échec + prod fausse. **Vérifier `git status` propre avant de conclure.**
4. **Reste donc** : la valeur `dy`/`survol` elle-même. Le calcul ci-dessus donne base à
   −0.25, ce qui DEVRAIT suffire… mais Erik voit toujours la tuile en l'air : il y a
   probablement un écart entre le calcul et le rendu réel (à mesurer, cf. §4).

## 4. La méthode imposée : boucle locale AVANT tout push

1. **Lancer le local** : serveur `cd apps/server && npx wrangler dev --port 8787` +
   client `cd apps/web && npx vite --port 5174 --strictPort` (ou réutiliser ceux déjà
   lancés). ⚠️ Le proxy API a déjà hangé une fois — si `/api/me` ne répond pas en 8 s,
   redémarrer wrangler.
2. **Ouvrir une vraie partie en local** (login → lobby → nouvelle partie) dans le
   navigateur, jouer jusqu'à voir des collines.
3. **Mesurer le rendu RÉEL** : via `window.__fonderie` non disponible en jeu — passer par
   un evaluate ciblant les meshes du calque (matériaux `corps_tripo`) pour lire les
   positions Y réelles des instances colline vs prairie vs le top procédural (0).
4. **Ajuster** : le levier le plus fin est le `survol` de `tuileColline3d`
   (visuel3d.json, rechargé à chaud par Vite) — pas besoin de re-cuire le .glb pour
   ±0.05. Une re-cuisson (`preparer-structure-tripo.mjs ... <dy>`) exige un renommage
   (colline_v3.glb) + maj spec/tests.
5. **Capturer** (`toDataURL` du canvas → PNG dans `fonderie/captures/`), **montrer à
   Erik**, ne commit/push QU'APRÈS son accord explicite.
6. Si un fichier .glb change : renommer (v3) et mettre à jour les 3 tests catalogue
   (`apps/web/tests/{unites3d,atelier-catalogue,structures3d}.test.ts` — comptage des
   .glb servis). `pnpm test` + `pnpm typecheck` verts avant tout push.

## 5. Garde-fous

- Aucun push sans validation d'Erik sur capture locale (le push DÉPLOY en prod).
- Zéro gameplay : `packages/rules` et `apps/server` intouchés ; `schemaVersion` inchangée.
- Le levier `survol` est borné [0, 2] par `parseEntreeUnite3D` (pas de survol négatif —
  pour descendre sous le dy cuit, re-cuire avec un dy plus négatif).
- Rapport : appendre à `REPORT-VILLE-TRIPO-T2.md` (addenda 17-19 couvrent la colline).

## 6. Hypothèse à vérifier en premier

La valeur `survol: 0.05` donne une base calculée à −0.25 — déjà plus bas que le plateau
prairie (−0.035). Si la tuile paraît ENCORE en l'air d'autant, la suspicion porte sur
l'application réelle de `survol`/`echelle`/dy dans `UnitesGLBWorld.update()` (ordre des
multiplications : `makeScale(k,k,k)` puis `setPosition(x, elev + survol, z)` — le dy
NŒUD est multiplié par echelle, le survol non ; vérifier que c'est bien ce qu'on veut).
Mesurer d'abord, déduire ensuite.
