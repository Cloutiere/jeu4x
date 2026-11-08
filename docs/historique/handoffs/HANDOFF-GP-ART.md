# HANDOFF-GP-ART — Sprites des Personnages Illustres (6 classes, art d'Erik) + icône sciences v2

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline), `REPORT-ASSETS-6COULEURS.md` (mécanisme « variantes fournies » et icônes). **2D uniquement.** Zéro changement moteur/serveur/protocole. **Les fichiers d'Erik (`new_units/`, `new_icones/`, `new_others/`) ne se committent JAMAIS** — copies en `assets-src/`.

## 1. Objectif (demande d'Erik du 27/09)

1. **Intégrer son art des Personnages Illustres** : 6 SVG peints (`new_units/great people/`) remplacent l'art dédiée actuelle des 6 classes de GP.
2. **Icône de sciences v2** : `new_icones/icone_sciences2.svg` remplace l'icône sciences (v1 avait été intégrée en 64×64 par le profil `icone-sciences`).

## 2. Décisions tranchées (réponses Erik du 27/09 — à appliquer telles quelles)

- **D1 — Mapping fichiers→classes** (croisé avec `figures.json`/`units.json`, vérifié pilot) :

| Fichier Erik | Classe (id) |
|---|---|
| `artist.svg` | `artiste_penseur` |
| `builder.svg` | `batisseur` |
| `humanitaire.svg` | `humanitaire` |
| `industrial.svg` | **`explorateur`** (décision Erik : « Explorateur = industriel ») |
| `leader.svg` | `leader` |
| `scientist.svg` | `savant` |

  - **`general.svg` = EN RÉERVE** (aucune classe Général dans le jeu — non intégré, non committé, consigné au rapport pour le jour où la classe existera).
- **D2 — Cible d'asset** : `unite_<id>.png` pour chaque classe (`unite_artiste_penseur`, `unite_batisseur`, `unite_humanitaire`, `unite_explorateur`, `unite_leader`, `unite_savant`) — la chaîne de résolution générique (textures.ts:738-753) les prend telles quelles, zéro code. Les anciennes variantes `_accent` : vérifier leur consommation réelle ; si un consommateur exige le fichier, poser le sprite de base comme accent (aucun recoloriage), sinon les retirer proprement. **🔶 consigner** le sort des `_accent` au rapport.
- **D3 — Cuisson** : mode unité du pipeline, export ×2 (512×640), calibre = hauteur unités standard (les GP s'affichent comme des unités). Pas de variantes par joueur (GP peints neutres — comme aujourd'hui). Fiches A/B « avant » (art painter du HEAD).
- **D4 — Icône sciences** : profil `icone-sciences` mis à jour vers `icone_sciences2.svg` (même mode icône 64×64, même stem `icone_science`) — re-cuisson + exports. A/B avant.
- **D5 — Barbare : PAS de changement de code (décision Erik)** — vérification pilot faite le 27/09 : la prod sert bien le nouveau PNG (`unite_barbare_guerrier.png`, 257 552 o). Le vieux sprite vu par Erik = cache local de sa coquille ; il vide son cache et valide à l'œil. La mission inclut juste une **capture de vérification** en partie locale + la consigne de nettoyage au rapport (pour Steam : noter qu'un cache-busting des assets serait souhaitable — tranche future, pas dans cette mission).
- **D6 — Hors périmètre confirmé par Erik** : `tuile_hutte.svg` et les 7 tuiles d'artefacts de `new_others/` (déjà intégrés), les autres dossiers `new_units/*`, le recoloriage, toute retouche des SVG fournis.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. Vérifie la chaîne GP (textures.ts:738-753, placeholders l.345-352) et l'usage des `_accent` GP (liste des consommateurs).

### L1 — Cuisson GP
- Copier les 6 SVG en `assets-src/modeles/` ; profils pipeline (mode unité, ×2, calibre standard) ; cuites → `apps/web/public/art/unite_<id>.png` + exports ; A/B « avant ».
- Placeholders/alias : l'art dédiée existante prime sur les alias (textures.ts:738) — après cuisson, ce sont les SVG d'Erik qui s'affichent. Ne rien changer au code si la résolution suffit ; sinon minimaliser et documenter.

### L2 — Icône sciences v2
- Profil `icone-sciences` → source `icone_sciences2.svg`, re-cuisson 64×64 (art + exports). Vérifier la rendue : topbar (Game.svelte:717) et vue ville (CityView.svelte:440) — lisibilité à la taille du HUD.

### L3 — Vérification
- Suite + typecheck verts. Labo `#/labo-rendu` ou partie locale : les 6 GP posés en carte (calibre vs guerrier), lisible au dézoom ; icône sciences en topbar + vue ville.
- **Captures `dev-logs/captures-gp-art/`** : fiche 6 classes avant/après, close-up, icône sciences, barbare (vérification post-cache : le bon sprite).
- Barde : ne COMMITTER qu'après le feu vert d'Erik (règle d'Erik).

### L4 — Rapport
- `REPORT-GP-ART.md` : mapping D1, sort des `_accent` (🔶), A/B, captures, note cache-busting (Steam), consigne de nettoyage de cache pour Erik, ce qu'il valide en ligne.

## 4. Critères d'acceptation
1. Les 6 GP en jeu = les SVG d'Erik (style intact), calibre unité correct, lisibles au dézoom.
2. `general.svg` non intégré, consigné en réserve ; explorateur = `industrial.svg`.
3. Icône sciences v2 visible en topbar et vue ville, 64×64 net.
4. Aucun changement moteur/serveur/protocole ; suites vertes ; fichiers d'Erik non commités.
