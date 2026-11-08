# HANDOFF-ASSETS-UNITS-4K-VAGUE5 — Les 13 dernières unités passent en 4K Erik (fin du SVG atelier)

**Décisions Erik 16/10.** Dernière vague d'unités : Piquier, Sous-marin, Canon, Milice, Caravane, ICBM, Espion (+ les aériennes Chasseur/Bombardier déjà prêtes et les déjà-livrées à re-vérifier). Après cette vague, **plus aucune unité jouable n'est en SVG d'atelier**. Sources : `new_units/` d'Erik — NE JAMAIS committer tel quel.

## 1. Préalables

- Lire le pipeline 4K (motif VAGUE3/VAGUE4 : profils `import_svg`, cuites ×6 palettes + base, `echelleParVariante`, calibre = hauteur de contenu figée sur l'avant), `textures.ts` (cuites `type@palette`), l'aliasing des uniques R-148.
- Baseline : suites vertes à jour, svelte-check 0, `schemaVersion` 27, **client/asset seul**. Vérifier `git status`.

## 2. Correspondances (pièges de nommage consignés)

| Unité | Dossier | Sources (`_trsp`) | Remarques |
|---|---|---|---|
| piquier | `new_units/new_piquier/` | `piquier_<couleur>_trsp.png` ×6 | ✔ vérifié RGBA 4K |
| sous_marin | `new_units/new_sousmarin/` | `sous-marin_<couleur>_trsp.png` ×6 | tiret dans le nom |
| canon | `new_units/new_canon/` | **ABSENT — 6 JPEG opaques** | D2 ci-dessous |
| milice | `new_units/new_milice/` | `milice_<couleur>_trsp.png` ×6 | ✔ |
| caravane | `new_units/new_caravane/` | `caravane_<couleur>_trsp.png` ×6 | ✔ |
| icbm | `new_units/new_icbm/` | `icbm_<couleur>_trsp.png` ×6 | ⚠ `icbm_bleu.png` sans suffixe — vérifier à la recuisson que c'est bien le RGBA (sinon repli, consigné) |
| espion | `new_units/new_espion/` | `espion_4k_trsp.png` ×1 | **UNIVERSELLE** : une seule image pour TOUTES les palettes (aucune teinte accent) |
| chasseur | `new_units/new_fighter/` | `fighter_<couleur>_trsp.png` ×6 | unité aérienne pas encore active — art préparée |
| bombardier | `new_units/new_bomber/` | `bomber_<couleur>_trsp.png` ×6 | idem |

## 3. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Moteur de vague standard** : même pipeline que VAGUE3/VAGUE4 (sources → profils 6 couleurs + base, cuisson, `textures.ts`, calibre hauteur-avant data-driven, variantes barbare non applicables — barbares hors vague, leur art dédiée reste).
- **D2 — Canon (pas de transparence livrée)** : l'agent DÉRIVE la transparence des 6 JPEG par gate (détection du fond, technique du pipeline) et livre à l'œil avec captures AVANT/APRÈS — si le résultat est imparfait, Canon GARDE son art atelier actuel et le dossier est consigné pour ré-export Erik (veto facile).
- **D3 — Espion universel** : mapping data-driven « source unique sans variantes » ; même sprite pour tous les propriétaires (aucun accent) — l'espion n'apparaît que de façon ponctuelle, ce choix d'Erik est assumé.
- **D4 — Uniques** : rien à faire — l'aliasing R-148 fait hériter les 25 uniques de l'art de leur base automatiquement (ex. Obusier → Artillerie, Canon 88 → Canon, Mustang/Spitfire → Chasseur).
- **D5 — ICBM** : l'ICBM étant instanciée spécialement (7m), vérifier son chemin de texture et le brancher comme les autres ; repli art actuelle si le fichier bleu se révèle inutilisable.
- **D6 — Intouchés** : GP (art dédiée), barbares, bâtiments/merveilles (icônes déjà livrées), tout le gameplay, `schemaVersion` 27.

## 4. Mission

- **L1** : recuisson des 9 types (piquier, sous_marin, canon*, milice, caravane, icbm, espion, chasseur, bombardier) — *canon sous réserve D2 ; captures par unité.
- **L2** : `textures.ts` + calibres data-driven (`echelleParVariante`), vérification cuites ×6 sauf espion ×1.
- **L3 — validation locale à l'œil AVANT commit** (règle Erik) : partie solo légale avec chaque nouvelle unité visible (produire/recruter légalement — le devtmp des vagues précédentes est le motif), à cheval sur palettes différentes ; captures `dev-logs/captures-assets-units-4k-vague5/`.
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push, rapport `REPORT-ASSETS-UNITS-4K-VAGUE5.md` (état final : ZÉRO unité jouable en SVG atelier, sauf consignes 🔶 canon/ICBM bleu).

## 5. Critères d'acceptation

1. Les 9 unités affichent l'art 4K d'Erik en jeu (6 palettes, espion universel) ;
2. Les uniques héritent proprement (spot-check Obusier et Mustang) ;
3. Aucune régression sur les 11 déjà en 4K ; suites vertes.

## 6. Fin de session

Rapport (inventaire final des sources, 🔶 canon/ICBM), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
