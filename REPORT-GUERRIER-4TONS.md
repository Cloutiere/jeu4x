# REPORT-GUERRIER-4TONS — Nouveau guerrier SVG d'Erik, palette factions 4 tons, 7 variantes + barbare

**Statut : FEU VERT ERIK 23/09 (« c'est parfait ») + correctif barre de PV intégré.**
Mission du 23/09 (HANDOFF-GUERRIER-4TONS.md). 2D uniquement, zéro changement
moteur/serveur/protocole — le mécanisme `cuites` par `<type>@<owner>` est inchangé.

## 1. Le nouveau système 4 tons

- **`accents.json` §`factions4`** : 7 factions × 4 tons (Lightest/Base/Dark/Darkest,
  rampes linéaires, table Erik 23/09) + **`ordre_joueurs4`** (mapping J1..J7,
  défaut : J1 = Bleu Saphir, puis ordre de la table) + **`barbare4`** =
  `rouge-royal` (décision Erik). Data-driven : changer une couleur = éditer le
  JSON + re-cuire (`node assets-src/tools/import_svg.mjs guerrier-4tons`),
  zéro code. L'ancienne table 3 gris (`factions`) reste la source des AUTRES
  assets (traits fins UI, accents runtime, tuiles…).
- Validation miroir : `accents.ts` (`valider4` : 7 factions, hex, 4 tons
  distincts, ordre cohérent) et `import_svg.mjs` (`lireFactions4`).

## 2. Le mappeur 4 tons (pipeline)

- `import_svg.mjs` : nouveau mode **`remplacementsPalette4`** — les 4 hex
  sources du maître sont remplacés PAR RÔLE (`#649EFF`→lightest, `#233A9D`→base,
  `#4571C4`→dark, `#0D174F`→darkest), rechercher/remplacer global insensible à
  la casse sur `fill` + `stop-color` (le SVG porte bien les variantes de casse :
  35 occurrences remplacées par variante : ×2/×16/×2/×15). 8 variantes cuites :
  `unite_guerrier_j1..j7` + `unite_guerrier_barbare`. Gate G5 étendue : les
  **4 tons au pixel ±2/canal** par variante (test pipeline dédié).
- Nouveau drapeau profil **`sansAccent`** : le maître peint à la main ne porte
  AUCUNE forme blanche — rendu direct sans calque accent (l'accent teinté
  runtime n'a plus de sens pour cet asset).

## 3. Maître + calibrage

- **`assets-src/modeles/guerrier_ref.svg`** : copie de travail du fichier d'Erik
  `new_units/guerrier.svg` (md5 identiques, `496c70c9…`), **jamais modifié**.
  Les fichiers `new_units/` ne se committent pas (règle) — la copie oui.
- Profil `guerrier-ref` (base) + `guerrier-4tons` (8 cuites) remplacent
  `guerrier-bronze`/`guerrier-cuite` (le SVG bronze racine n'est PAS suivi par
  git — rollback : git revert + régénérer, l'ancien profil est dans l'historique).
- **Export ×2 (512×640, G3/G4 vertes, 171-174 Ko)**. `echelle` recalibrée à
  **0,7765** pour que le contenu occupe la même fraction de hauteur (0,713)
  qu'à l'ancien calibre 256×320 — la hauteur écran est pilotée par
  `echelleUnite` (texture entière), donc la taille en jeu est INCHANGÉE, seule
  la résolution double. Nouveau ratio de forme 0,776 (vs 0,548 bronze) : c'est
  le dessin d'Erik, plus large.
- `unite_guerrier_accent.png` **SUPPRIMÉ** (exports + public/art) : plus de
  calque accent ; le test atelier est mis à jour (guerrier = base seule, comme
  les barbares). Le painter generate.py ne régénère toujours pas le guerrier
  (ligne déjà commentée, commentaire mis à jour).

## 4. Écart assumé référence / variante saphir (§2 du handoff)

La variante J1 EN JEU vaut `dark=#151F6F` / `darkest=#0A0F3D` (table) là où le
maître porte `#4571C4` / `#0D174F` — le maître reste intouchable, retouches de
tons possibles sur la seule table.

## 5. Ordre J1-J7 (défaut §2, non tranché par Erik — éditable)

J1 Bleu Saphir, J2 Rouge Royal, J3 Vert Émeraude, J4 Jaune d'Or, J5 Violet
Améthyste, J6 Cuivre Ardent, J7 Cyan Céleste ; barbare = Rouge Royal (= J2,
PNG pixel-identiques, testé). À valider (L4).

## 6. Démonstration + captures (`dev-logs/captures-guerrier-4tons/`)

- Labo `#/labo-rendu` enrichi (préview archer PRÉSERVÉE, ajout sans
  remplacement) : 7 guerriers seuls sur les tuiles du nouveau style
  (prairie/plaine/colline/désert/forêt/montagne) + cohabitation 3 nations
  (p1/p3/p5) sur colline. Le brouillard est levé dans le labo (les démo sont
  hors de la vision de p1 sinon). Driver : `driver-captures-guerrier-4tons.mjs`.
- Captures : `fiche-8-variantes.png` (composée, avec le barbare),
  `labo-ligne-7-variantes.png`, `labo-variantes-zoom-max.png` (×2,25 — netteté
  export ×2), `labo-variantes-dezoom-max.png` (×0,5 — accent lisible,
  mipmaps OK), `labo-cohabitation-3-nations.png`.

## 6bis. Barre de PV liée à la couleur de base (retour Erik 23/09, « c'est parfait, toutefois… »)

`PLAYER_COLORS` (accents.ts) et `playerColor()` (textures.ts) sont REBANCHÉS sur
le système 4 tons (tonalité `base`, ordre J1-J7 + barbare4) : barres de PV,
camps, frontières et traits fins suivent AUTOMATIQUEMENT `accents.json` — toute
retouche de table se propage sans code. Vérifié sur captures (barres = base de
chaque faction). Test PLAYER_COLORS mis à jour. L'ancienne fonction
`couleurAccent` (3 gris, reflet/ombre) reste disponible pour les assets non
migrés mais n'a plus d'appelant.

## 7. Ce qu'Erik valide en ligne (L4)

1. **Teintes** des 8 variantes (fiche + ligne sur tuiles) ;
2. **Calibre** (`echelle` 0,7765 — taille en jeu vs l'ancien guerrier) ;
3. **Lisibilité de l'accent au dézoom** (bouclier 4 tons à ×0,5) ;
4. **Ordre J1-J7** proposé.

## 8. 🔶 Ouverts / consignés

- **Barbare** : le guerrier barbare EN JEU a un sprite peintre DÉDIÉ
  (`unite_barbare_guerrier`, R-95) — non retouché. La cuite
  `unite_guerrier_barbare.png` (Rouge Royal) est cuite et cataloguée à
  l'atelier mais le rendu barbare continue d'utiliser le sprite dédié.
  Migration dédiée plus tard.
- **Migration 4 tons des autres unités** : hors mission (archer suspendu,
  colon, chevalier restent en 3 gris/recraft).
- **`--check` painter** : échec préexistant au HEAD sur `unite_colon`/
  `chevalier_accent` (documenté REPORT-TUILES-SVG), non corrigé ici.
- **Écarts de comptage vs handoff** : `#649EFF` ×2 (handoff disait ×2 via
  lignes ; occurrences réelles 2) — 35 remplacements/variante, conforme.
- **UI 3 gris** : les couleurs de camps/barres PV (PLAYER_COLORS) restent sur
  l'ancienne table — cohérent tant que les autres unités ne sont pas migrées ;
  à l'œil d'Erik (barres visibles sur les captures).

## 9. Chaîne de validation

Tests **372 web verts** (dont +1 palette 4 tons, test atelier corrigé) +
**15 tests pipeline** (dont +1 remplacementsPalette4 : 8 stems, 4 tons au
pixel, barbare≡J2, casse-insensible) ; typecheck 0 erreur ; `--check` des deux
nouveaux profils idempotent ; zéro changement `packages/rules` + `apps/server` +
protocole ; `new_units/` non commité.
