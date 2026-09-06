# HANDOFF CHANTIER V2-bis — Correctifs des cartes-ressources et slots

Tu reprends le pilotage pour un **petit correctif visuel** constaté par Erik **en jouant sa première partie solo** (capture du 05/09). **Préalables :** `HANDOFF.md` §4, baseline **868 tests** + typecheck verts, le contexte : `structures3d.ts`, `visuel3d.json`, `REPORT-CHANTIER-V2.md`. `schemaVersion` **18 inchangée**, zéro gameplay.

## Les deux correctifs (décisions d'Erik du 05/09)

1. **Cartes retournées de 180°** : les cartes-ressources sont posées **face à la caméra** — aujourd'hui on voit la carte par l'arrière/le bord (elles penchent à l'opposé du point de vue). Retourner la plaque (inversion de l'inclinaison `rx` ou de l'orientation Y, selon le modèle) pour que **la face — couleur + pictogramme — soit lisible** depuis la caméra par défaut (tilt 58°) ET aux zooms intermédiaires ;
2. **Le slot n'apparaît QUE si la tuile porte une ressource** (décision d'Erik — remplace le défaut V2 « slot visible même vide ») : aucune encoche/socle de slot sur une tuile sans ressource. Les tuiles à ressource gardent leur slot ; l'état neutre « ? » avant technologie (R-92) est inchangé (carte présente, neutre, dans le slot).

## Mission

1. Corriger les deux points dans `structures3d.ts` + `visuel3d.json` (le compte d'instances va baisser — le bench doit le refléter) ;
2. Mettre à jour les tests du planificateur (slot absent sans ressource = test ; orientation = test géométrique sur la normale de la face) ;
3. Vérifier en conditions réelles : partie solo (ou e2e GUI V2 — pilote existant), zoom sur plusieurs ressources aux deux états (neutre/révélée), captures `dev-logs/captures-v2-3d/` ;
4. Livrer : tests verts (868 minimum), typecheck, CI, prod saine, rapport court `REPORT-CHANTIER-V2-FIX.md`.

**Ne pas toucher** : gameplay, moteur, serveur, les autres structures (Mainframe, cratère, huttes), le travail d'atelier d'Erik (**inspecter l'état du répertoire avant de committer** — ses retouches ne partent pas dans ton commit).

## Fin de session
Rapport court, arrêt, remise de la main au pilot.
