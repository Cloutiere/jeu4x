# HANDOFF-GUERRIER-4TONS — Nouveau guerrier SVG d'Erik, palette factions 4 tons, 7 variantes + barbare

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X. Lis `HANDOFF.md` §4, `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline, pièges sharp), `REPORT-TUILES-SVG.md` (mode tuile récent, même pipeline), `ATELIER-ASSETS.md`. **2D uniquement.** Zéro changement moteur/serveur/protocole (l'accent reste un choix de variante cuite à l'import — le moteur `cuites` par `<type>@<owner>` est inchangé). Les fichiers d'Erik à la racine (`new_units/`) ne se committent JAMAIS — les copies de travail `assets-src/` oui.

## 1. Objectif (demande d'Erik du 23/09)

Nouvelle génération d'assets unités : Erik peint désormais **à la main, directement dans le SVG, les couleurs de faction** (4 tons par faction — plus riche que l'ancienne convention 3 gris, abandonnée à partir de cet asset). Le SVG de référence `new_units/guerrier.svg` (594 Ko, ~60 couleurs) arrive **déjà peint en Bleu Saphir**. Mission : **intégrer ce guerrier** (remplacement de l'actuel), produire **les 7 variantes de factions + le barbare**, et **les montrer sur les tuiles** (labo + captures).

## 2. Le nouveau système de couleurs (décisions Erik, à appliquer exactement)

- **4 tons par faction, rampes linéaires** (Lightest / Base / Dark / Darkest) — la logique « Accent » intermédiaire est abandonnée. Table officielle (Erik, 23/09 ; **data-driven, éditable, les valeurs peuvent changer**) :

| Faction | Lightest | Base | Dark | Darkest |
|---|---|---|---|---|
| Rouge Royal | #E85A5A | #A62121 | #7A0A0A | #490000 |
| Bleu Saphir | #649EFF | #233A9D | #151F6F | #0A0F3D |
| Vert Émeraude | #6ED78D | #1A6A36 | #124A27 | #0B2B18 |
| Jaune d'Or | #FFE98F | #D8A61C | #AA8215 | #7E610A |
| Violet Améthyste | #A26ED7 | #60128C | #480D69 | #310848 |
| Cuivre Ardent | #FFCD99 | #D97B30 | #9A4E20 | #633114 |
| Cyan Céleste | #B3EFEF | #00D2D2 | #009797 | #005E5E |

- **Ordre joueurs (défaut, non répondu par Erik — mapping dans un tableau éditable de toute façon)** : J1 Bleu Saphir (couleur de la référence), puis ordre du tableau : J2 Rouge Royal, J3 Vert Émeraude, J4 Jaune d'Or, J5 Violet Améthyste, J6 Cuivre Ardent, J7 Cyan Céleste.
- **Barbare = Rouge Royal** (décision Erik) — le barbare migre donc vers le nouveau système dans cette mission (8e variante, rouge royal ; sa variante rouge sang historique est remplacée).
- **Remplacement par position de ton** : le SVG de référence contient #649EFF (×2), #233A9D (×16), #4571C4 (×2), #0D174F (×15). Le mappeur remplace PAR RÔLE : #649EFF→Lightest, #233A9D→Base, **#4571C4→Dark**, **#0D174F→Darkest** (simple rechercher/remplacer global des 4 hex, insensible à la casse, fill + stop-color — Erik garantit que ces 4 couleurs n'apparaissent QUE sur l'élément d'accent).
- ⚠️ **Conséquence assumée** : la variante saphir EN JEU utilise les valeurs du tableau (#151F6F/#0A0F3D sur les tons sombres), donc diffère LÉGÈREMENT de la référence. C'est voulu : **la référence est isolée et jamais modifiée** ; Erik pourra demander des retouches de tons sur la variante saphir sans toucher au maître.
- **Insensibilité casse** : vérifier les variantes de casse dans le SVG (ex. `#233a9d`) — tout remplacer (Erik garantit l'unicité, pas l'homogénéité de casse).

## 3. État des lieux

- **SVG maître** : `new_units/guerrier.svg` — copie de travail à créer en `assets-src/modeles/guerrier_ref.svg` (**LE maître intouchable**, identique octet pour octet au fichier d'Erik). Toutes les variantes en dérivent par remplacement, **jamais l'inverse**.
- **Guerrier actuel** : `unite_guerrier` importé du pipeline Recraft 3 gris (profil dans `import_svg.profiles.json`, `echelle: 0.75`, calibre hauteur data-driven `calibration-unites.ts`). Rollback = réactiver l'ancien profil/ligne + regenerate (précédent établi).
- **Pipeline** : `assets-src/tools/import_svg.mjs` — mode `remplacementsPalette` (3 gris, G5 teintes ±2) à étendre en `remplacementsPalette4` (4 tons, même gate au pixel), rendu normalisé deux passes, gate G1 fond blanc, G2 couverture, G3 dimensions, G4 poids 300 Ko.
- **Tuiles** : les 8 tuiles terrain sont déjà les SVG d'Erik (nouveau style, commit `b0c905e`) — le guerrier 4 tons sera montré dessus.
- **⚠️ Ne pas casser** : la préview archer du labo `#/labo-rendu` (mission suspendue, conservée) ; le calibre `echelleUnite` ; les variantes cuites des AUTRES unités (3 gris) restent en place — la migration 4 tons ne concerne QUE le guerrier (et le barbare via guerrier barbare ? voir §4 L3).
- **Note préexistante hors périmètre** : `--check` échoue au HEAD sur `unite_colon`/`chevalier_accent` (défaut painter antérieur, documenté dans REPORT-TUILES-SVG) — ne pas tenter de le corriger ici, le consigner tel quel.

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. Lis un profil d'`import_svg.profiles.json` et le code `remplacementsPalette`/G5.

### L1 — Données de palette
- Nouvelle structure data-driven (ex. `palettes4` dans `accents.json` — source unique partagée web+pipeline, schéma validé) : 7 factions × 4 tons + `barbare: rouge-royal` + **table de mapping joueur→faction** (J1..J7, éditable). L'ancienne table 3 gris reste pour les autres assets.
- Le mappeur 4 tons dans `import_svg.mjs` : `remplacementsPalette4` (4 hex rôle→valeur, casse-insensible, fill + stop-color), 8 variantes cuites (J1-J7 + barbare). Gate G5 étendue : 4 teintes au pixel ±2 par variante.

### L2 — Maître + variantes
- Copier `new_units/guerrier.svg` → `assets-src/modeles/guerrier_ref.svg` (vérifier identité octets) ; **jamais modifié ensuite**.
- Profil `unite_guerrier` mis à jour : maître = la copie, **export ×2 (512×640)** — le constat de netteté du 20/09 tient toujours, on intègre directement au standard voulu ; `echelle` recalibrée sur le calibre guerrier existant (hauteur écran pilotée par `echelleUnite`, ancrage pieds au quart bas).
- Cuisson : 8 variantes cuites + gate G5 ; A/B atelier fiche `unite_guerrier_avant` (PNG du HEAD).
- **Barbare** : vérifier comment le guerrier barbare actuel est produit (sprite dédié, silhouette en V, rouge cuit) — décision Erik « barbare = Rouge Royal » : si le barbare utilise le sprite guerrier, la variante barbare = remplacements Rouge Royal et c'est fait ; s'il a un sprite dédié séparé, **ne pas le retoucher** dans cette mission et le consigner en 🔶 (migration barbare dédiée plus tard). Dans le doute : guerrier seul, barbare reporté.
- `sync-art`, suite + typecheck verts (attention aux tests qui figent l'accent J1 3 gris — les mettre à jour vers le saphir 4 tons).

### L3 — Démonstration sur tuiles
- Labo `#/labo-rendu` : guerrier ×8 variantes posés sur les nouvelles tuiles (prairie/colline/désert…), unités seules + cohabitations (2-3 nations côte à côte pour comparer les teintes) ; préserver la préview archer (ajouter, ne pas remplacer).
- **Captures `dev-logs/captures-guerrier-4tons/` AVANT tout commit** (règle d'Erik) : fiche 8 variantes, close-up sur l'élément d'accent, vue en jeu aux deux extrêmes de zoom (netteté ×2), cohabitation multi-nations.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter : les 8 variantes sur tuiles + l'ordre J1-J7 choisi (défaut §2) + l'écart référence/variante-saphir sur les tons sombres. Verdicts attendus : teintes, calibre (`echelle`), lisibilité de l'accent au dézoom. NE COMMITTER QU'APRÈS SON FEU VERT.

### L5 — Rapport
- `REPORT-GUERRIER-4TONS.md` : système 4 tons, mapping/ordre, calibrages, écarts, ce qu'Erik valide en ligne, 🔶 (barbare dédié, accent saphir, migration 4 tons des autres unités, colon/chevalier `--check` préexistant).

## 5. Critères d'acceptation

1. Le guerrier en jeu EST le nouveau SVG d'Erik (style intact), 8 variantes cuites (J1-J7 + barbare), gate G5 4 tons vert.
2. La référence `guerrier_ref.svg` est identique au fichier d'Erik et aucune variante ne réécrit le maître.
3. Changement de palette = édition de `accents.json` + re-cuisson, zéro code.
4. Démonstration sur les nouvelles tuiles, captures fournies, netteté correcte au zoom (export ×2).
5. Suite verte, zéro changement moteur/serveur/protocole, fichiers racine d'Erik non commités, préview archer intacte.

## 6. Périmètre interdit

- Migration 4 tons des AUTRES unités (archer suspendu, colon, chevalier…) — guerrier seul ;
- Toute retouche du maître (pas de recoloriage, pas de lissage, pas de recadrage) ;
- Moteur/serveur/protocole/rendu 2D, calibre `echelleUnite` (inchangé, l'échelle du sprite se règle au profil) ;
- Le fix `unite_colon`/`chevalier_accent` du `--check` (préexistant, hors mission).
