# REPORT-ASSETS-6COULEURS — Vague 1 : guerrier, archer, barbares (unité + tuile), icônes de rendement

> Mission exécutée le 26/09 (HANDOFF-ASSETS-6COULEURS.md). **Non committé — ARRÊT L4 : feu vert d'Erik requis.**
> Suites : web + serveur + règles VERTES, typecheck 0 erreur (rien de caché : la baseline du matin était 895+116+380).

## 1. Mapping fichier → faction (D1)

| Fichier d'Erik | Faction (accents.json) | Suffixe cuite |
|---|---|---|
| `new_units/*/*_bleu.svg` | Bleu Saphir | `j1` |
| `new_units/*/*_rouge.svg` | Rouge Royal | `j2` |
| `new_units/*/*_vert.svg` | Vert Émeraude | `j3` |
| `new_units/*/*_jaune.svg` | Jaune d'Or | `j4` |
| `new_units/*/*_orange.svg` | Cuivre Ardent | `j5` |
| `new_units/*/*_ardoise.svg` | **Ardoise (nouvelle)** | `j6` |

Violet Améthyste et Cyan Céleste **sortent** de `factions4`/`ordre_joueurs4` (réduction assumée). L'ordre devient : saphir, rouge royal, émeraude, jaune d'or, cuivre ardent, ardoise. La table 3 gris `factions` (p1..p7 historiques) est INTACTE — elle ne sert plus que les assets non migrés.

## 2. Rampe Ardoise dérivée (D3) 🔶 Erik calibre à l'œil

Aucune table 4 tons n'existait pour ardoise. Dérivée depuis l'ancien gris ardoise 3 tons **#44484E** (conservé comme `base`) :

```json
"ardoise": { "lightest": "#9CA4AE", "base": "#44484E", "dark": "#2B2E33", "darkest": "#191B1F" }
```

Éditable dans `apps/web/src/lib/render/accents.json` — tout l'UI (barres PV, frontières, anneaux, mêlée) suit automatiquement (PLAYER_COLORS lié).

## 3. Repli p7 / violet / cyan (D6)

Data-driven dans `accents.json` : `"repli_palette4": { "violet-amethyste": "ardoise", "cyan-celeste": "ardoise" }`. `paletteDe()` résout tout override de partie ancienne vers ardoise ; les sièges p6/p7 sans config tombent aussi sur ardoise (dernier de l'ordre). Parties existantes jouables, aucune migration serveur.

## 4. Pipeline — mode « variantes fournies »

`import_svg.mjs` : nouveau mode `variantesFournies` (profil → { paletteId : SVG }) — **aucun recoloriage**, la cuite = rendu direct du SVG peint (fin du maître + `remplacementsPalette4` pour ces cibles). Nouveau mode `icone` (PNG 1024² → 64×64). Corrections au passage : le compte 4 tons exige 6 factions ; la variante barbare n'est plus produite par le profil guerrier (le barbare a son SVG dédié).

Cuites écrites (`assets-src/exports/` → `public/art/`) : `unite_guerrier_j1..j6`, `unite_archer_j1..j6`, `unite_guerrier.png` (bleu), `unite_archer.png` (bleu), `unite_barbare_guerrier.png`, `village_barbare.png` (mode tuile, hexagone + contour), `icone_{nourriture,production,or,science,culture}.png`. **Supprimés** : `unite_guerrier_j7.*`, `unite_archer_accent.*`, `unite_barbare_guerrier_accent.*`, `village_barbare_accent.*` (accents blancs obsolètes qui se seraient composés sur les sprites peints).

**Calibre** (mesuré au pixel) : guerrier ET archer = **71,3 %** de hauteur de contenu — identique à l'ancienne cuite guerrier ; barbre aligné (71,1 %). `echelle` par profil : guerrier 0,8808, archer 0,8312, barbare 0,9674. Export ×2 512×640.

## 5. Maître saphir — statut

`assets-src/modeles/guerrier_ref.svg` **conservé**, jamais modifié. Le sprite de base `unite_guerrier.png` est désormais cuit depuis `guerrier_bleu.svg` d'Erik (supplanté si les dessins diffèrent — **à l'œil d'Erik** ; les profils `guerrier-ref`/`guerrier-4tons` ont été retirés du JSON de profils).

## 6. Tuile camp vs hutte bonus (conclusion D4)

Inventaire : **assets distincts** — camp barbare = `village_barbare.png` (remplacé par `tuile_barbare.svg`), hutte bonus = `hutte.png` (INTACTE). Aucun partage : cas remonté à l'arrêt non requis.

## 7. Barbare (D4)

`unit_barbare.svg` → `unite_barbare_guerrier.png` (512×640, HORS J1-J6, aucune variante). L'archer barbare (`unite_barbare_archer`) est inchangé (hors vague). Accent UI barbare = rouge royal historique (barbare4), inchangé.

**Retour Erik 26/09 (correctif appliqué)** : le camp barbare doit être EN ARRIÈRE-PLAN des personnages — `GameCanvas.svelte` : zIndex du village barbare 50 → **-100** (décor de fond ; les structures bâties restent à 50). Vérifié sur `labo-barbare-camp.png` refaite.

## 8. Icônes (D5 — rév. 26/09 v2)

**Erik a fourni les SVG sources** (26/09, complément) : les 6 icônes sont cuites depuis `new_icones/icone_*.svg` → 64×64 (dimensions HUD), **coins transparents vérifiés au pixel** (le fond blanc de l'ancienne `icone_culture` PNG n'est plus un cas). La **balance** (`icone_balance.svg`) remplace `icone_commerce` (l'ancienne était aussi une balance). Fiche : `fiche-icones-avant-apres.png` (refaite). Artefact `keep-the-black-circular-background…png` écarté.

## 9. Ce qu'Erik valide en ligne (L3-L4)

Captures `dev-logs/captures-assets-6couleurs/` (driver `driver-captures-assets-6couleurs.mjs`, labo `#/labo-rendu` mise à jour : guerrier ×6, archer ×6, mêlée 3 nations, barbare + camp) :

1. `fiche-6couleurs-guerrier-archer.png` — les 12 sprites sur tuiles, calibre identique.
2. `labo-guerrier-6couleurs.png` / `labo-archer-6couleurs.png` — rendu réel GameCanvas, barres PV aux 6 couleurs.
3. `labo-melee-3-nations.png` — cohabitation (saphir/émeraude/cuivre).
4. `labo-barbare-camp.png` — barbare peint + camp `tuile_barbare` sur carte.
5. `labo-archer-zoom-max.png` / `labo-dezoom-max.png` — netteté ×2 au zoom, lisibilité au dézoom.
6. `fiche-ab-guerrier/archer/barbare.png` — avant/après peintre.
7. `fiche-icones-avant-apres.png` — icônes ×3.

## 10. 🔶 ouverts

- **Rampe ardoise** (valeurs §2) — dérivée, non calibrée par Erik.
- **Écart de teinte SVG vs hex UI** (D2 assumé) : les sprites peints ne portent pas les hex exacts ; l'UI reste sur accents.json.
- **Calibre archer vs guerrier** : même hauteur de contenu (71,3 %) — vérifier le rendu à l'œil (silhouettes plus larges chez l'archer).
- **Maître saphir vs `guerrier_bleu.svg`** : dessins à comparer à l'œil (statut consigné §5).
- `unite_guerrier_barbare.png` (ancien rouge cuit) reste à l'atelier comme fiche historique, plus utilisé au rendu.

## 11. Tests

- `accents-palette.test.ts` : rebanché 6 factions (repli p6/p7→ardoise, ordre J1-J6, rampes linéaires, violet/cyan absents).
- `accents-par-palette.test.ts` : + repli D6 override violet/cyan → ardoise ; suffixe j1..j6.
- `atelier-catalogue.test.ts` : archer ajouté aux sprites SANS accent (SVG peints).
- `config-partie.test.ts` / `lobby-5.test.ts` : palettes serveur au 6 couleurs (violet/cyan → cuivre/ardoise).
- Zéro changement moteur/serveur/protocole (hors données `accents.json` consommées par shared). Fichiers d'Erik (`new_units/`, `new_barbares/`, `new_icones/`) NON commités. Artefact `keep-the-black-circular-background…png` écarté.
