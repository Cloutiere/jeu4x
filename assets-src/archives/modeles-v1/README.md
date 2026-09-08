# Archives modèles v1

**Date** : 07/09/2026
**Raison** : remplacés par les `_v3.glb` du lot FONDERIE-LOT, validés par Erik le 07/09
(voir `fonderie/REPORT-FONDERIE-LOT.md`). Ces fichiers ne sont plus servis au jeu :
la table `visuel3d.json` §`structures.unites3d` pointe désormais les `_v3.glb` de
`assets-src/modeles/` (copies servies dans `apps/web/public/modeles/`).

## Contenu (20 fichiers)

- `archer`, `artillerie`, `bombardier`, `canon`, `catapulte`, `char`, `chevalier`,
  `croiseur`, `cuirasse`, `espion`, `fusiller`, `galere`, `gallion`, `icbm`,
  `infanterie`, `piquier` — v1 remplacés par leur `_v3.glb` homonyme (lot
  FONDERIE-LOT, 07/09).
- `glace.glb` — servait de modèle au type `legion`, remplacé par `legion_v3.glb`.
- `chasseur.glb`, `colon.glb` — v1 remplacés par `chasseur_v3.glb`/`colon_v3.glb`
  (validés par Erik, T4bis du 07/09).
- `guerrier.glb` — **non retenu par Erik, remplacé par la version knight**
  (promue `guerrier_v3.glb`, T4bis du 07/09) comme modèle du type `guerrier`.

## Toujours en jeu (NON archivés, toujours mappés)

`veloce.glb` (cavalier) et `sousmarin.glb` (sous_marin) — pas de v3 validé.
Les unités barbares (owner `barbarien`) affichent `barbare_v3.glb` via la table
`visuel3d.json` §`structures.unites3dSurchargeProprietaire` (T4bis).
