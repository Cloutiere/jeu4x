# LICENSES.md

Tous les fichiers de `exports/` sont générés **procéduralement** par
`tools/generate.py` (dessin vectoriel Pillow, antialiasing supersampling x4).
Aucune ressource tierce, aucune police, aucun texte incorporé.

| Fichiers | Source | Licence |
|---|---|---|
| 9 tuiles `tile_*.png` | Généré par tools/generate.py | Licence projet |
| 37 entités `unite_*`/`ville_*` (+ `_accent`) | Généré par tools/generate.py | Licence projet |
| 9 icônes `icone_*.png` | Généré par tools/generate.py | Licence projet |
| 23 ressources `res_*.png` (Phase 7c, R-91) | Généré par tools/generate.py | Licence projet |

Annexe palette : voir `palette.txt` (hex figés).

Régénérer après modification : `python tools/generate.py`.
Dernière génération : 2026-09-02
