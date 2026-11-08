# HANDOFF-ASSETS-6COULEURS — Vague 1 : guerrier, archer, barbares (unité + tuile), icônes de rendement

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X. Lis `HANDOFF.md` §4, `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline), `REPORT-GUERRIER-4TONS.md` (système 4 tons, variantes cuites), `REPORT-TUILES-SVG.md` (mode tuile), `REPORT-LOBBY-5.md` (nuancier). **2D uniquement.** Zéro changement moteur/serveur/protocole (sauf accents.json, données). **Les fichiers d'Erik (`new_units/`, `new_barbares/`, `new_icones/`, `new_ressources/`) ne se committent JAMAIS** — copies de travail en `assets-src/` uniquement.

## 1. Objectif (demande d'Erik du 26/09)

Intégrer la première vague de ses nouveaux assets peints : **guerrier ×6 couleurs, archer ×6 couleurs, barbare (unité + tuile de camp), 5 icônes de rendement**. Changement de flux assumé par Erik : les variantes par couleur sont **peintes à l'avance dans des SVG distincts** (par AI sous sa direction) — le pipeline ne recolore PLUS ces sprites (fin du maître + `remplacementsPalette4` pour ces cibles : chaque faction reçoit son SVG).

## 2. Décisions tranchées (réponses d'Erik du 26/09 — à appliquer telles quelles)

- **D1 — Le jeu passe à 6 couleurs de joueur (réduction assumée)** : Bleu (Saphir), Rouge (Rouge Royal), Vert (Émeraude), Jaune (Jaune d'Or), Orange (Cuivre Ardent), Ardoise. Violet Améthyste et Cyan Céleste **sortent** de la table active. Mapping fichiers→factions : `*_bleu`→Saphir, `*_rouge`→Rouge Royal, `*_vert`→Émeraude, `*_jaune`→Jaune d'Or, `*_orange`→Cuivre Ardent, `*_ardoise`→Ardoise.
- **D2 — Approximation de teinte ACCEPTÉE** : les SVG peints n'utilisent pas les hex exacts des palettes (vérifié : zéro occurrence). Les sprites gardent leurs teintes ; les éléments d'UI (barres de PV, frontières, anneaux, zone cultivée) gardent les hex exacts d'`accents.json`. Aucun repérage/recoloriage d'accent.
- **D3 — Rampe « Ardoise » à créer** : aucun 4 tons n'existe pour ardoise (l'ancien gris ardoise 3 tons #44484E est mort avec le système précédent). Défaut : l'agent dérive une rampe 4 tons depuis #44484E (data-driven dans `accents.json`), **🔶 Erik calibrera à l'œil**.
- **D4 — Barbares : `unit_barbare.svg` remplace le guerrier barbare, `tuile_barbare.svg` remplace la tuile du camp barbare.** Le barbare reste HORS système J1-J6 : sprite peint cuit tel quel (aucune variante par joueur), accent UI barbare = rouge sang historique inchangé pour l'instant. ⚠️ À vérifier en L1 : si la tuile du camp et la tuile « hutte bonus » partagent le même asset, ne remplacer QUE le camp et remonter le cas à Erik à l'arrêt.
- **D5 — Icônes : les 5 PNG (nourriture, production, or, sciences, culture) remplacent les icônes de rendement en jeu**, déscalées aux dimensions existantes. Le fichier `keep-the-black-circular-background…png` est un artefact de génération : écarté (non intégré, non committé).
- **D6 — Le lobby/nuancier passe à 6 palettes** (5 sièges parmi 6 — cohérent avec LOBBY-5). Parties existantes référençant une 7e palette : repli documenté (ex. p7 → ardoise), migration additive idempotente.
- **D7 — Hors vague (en réserve, ne pas toucher)** : `new_ressources/` (21 SVG), les autres dossiers `new_units/*` (colon, légion, tank, PNG seuls, `guerrier_sexy`, `legion_blonde`, `image.svg-*`), navals/aériens. Vague suivante sur instruction d'Erik.

## 3. État des lieux (vérifié pilot 26/09)

- **Sources** : `new_units/guerrier/guerrier_{bleu,rouge,vert,jaune,orange,ardoise}.svg` ; `new_units/archer/archer_{...mêmes 6}.svg` (1024×1024, ~0,7-1,4 Mo) ; `new_barbares/unit_barbare.svg` + `tuile_barbare.svg` ; `new_icones/icone_{nourriture,production,or,sciences,culture}.png` (~1,5 Mo chacun).
- **Cibles jeu** : `unite_guerrier` (actuel : maître saphir + variantes cuites `remplacementsPalette4`), `unite_archer` (actuel : sprite gothique en préview labo, mission suspendue — **cette vague le REMPLACE et clôt la suspension**), guerrier barbare (`barbare` cuit rouge), tuile camp barbare (id à confirmer en L1 — cf. D4), icônes rendement (ids/dimensions à inventorier).
- **Pipeline** : `import_svg.mjs` — le mode actuel (maître + `remplacementsPalette4` + G5) ne s'applique plus à ces cibles : nouveau mode **« variantes fournies »** (liste de SVG, un par palette, aucun recoloriage). Export ×2 (512×640) — standard actuel. G4 poids, G1/G2 inchangés ; G5 (teintes) remplacé par un contrôle de cohérence « la variante cuite correspond bien au SVG source fourni ».
- **Attention** : `guerrier.svg` maître saphir reste en réserve (il EST la variante bleu d'origine) — ne pas le supprimer du dépôt, consigner son statut (supplanté par `guerrier_bleu.svg` si les dessins diffèrent, à l'œil d'Erik).

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état ; inventaire des ids cibles (icônes rendement : ids, dimensions, consommation ; tuile camp barbare vs hutte bonus : ids distincts ou partagés — D4).

### L1 — Données : 6 couleurs
- `accents.json` : 6 factions actives (Saphir, Rouge Royal, Émeraude, Jaune d'Or, Cuivre Ardent, **Ardoise rampe dérivée 🔶**), violet/cyan retirées (repli p7 documenté), barbare inchangé. Consommateurs vérifiés : lobby nuancier, barres PV, frontières, anneaux, zone cultivée, mêlée (les 6 seules couleurs doivent apparaître partout sans trou).
- Profil pipeline « variantes fournies » : cible → {svg par paletteId} ; tests du mode (pas de recolor : la cuite = rendu du SVG, gate cohérence source).

### L2 — Cuisson unités
- **Guerrier ×6** : profils par variante (cadrage bbox, ×2 512×640, `echelle` = calibre guerrier actuel) → cuites `unite_guerrier@p1..p6`. **Archer ×6** : idem, même calibre (les deux sprites doivent tenir la même hauteur écran). Barde A/B `unite_guerrier_avant`, `unite_archer_avant` (PNG du HEAD).
- **Barbare** : `unit_barbare.svg` → sprite barbare cuit sans variantes ; `tuile_barbare.svg` → tuile camp (mode tuile du pipeline : recadrage bbox, fenêtre 224×256 collée haut, masque hexagone + contour — conventions TUILES-SVG), fiche A/B.
- **Icônes** : déscale les 5 PNG aux dimensions existantes des icônes rendement (inventaire L0), remplacement, A/B.
- Suite + typecheck verts.

### L3 — Vérification visuelle (AVANT tout commit — règle d'Erik)
- Labo `#/labo-rendu` : guerrier + archer ×6 couleurs posés sur les nouvelles tuiles (unités seules + cohabitations multi-nations + mêlée), calibre guerrier vs archer, netteté au zoom ×2 ; barbare (unité + camp) sur carte ; icônes en HUD (barres de ville, journal, topbar).
- **Captures `dev-logs/captures-assets-6couleurs/`** : fiches 6 couleurs guerrier/archer, mêlée 3 nations, barbare, icônes avant/après.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter fiches + captures (notamment : rampe ardoise dérivée 🔶, calibre archer vs guerrier, camp barbare, icônes). NE COMMITTER QU'APRÈS FEU VERT.

### L5 — Rapport
- `REPORT-ASSETS-6COULEURS.md` : mapping fichier→faction, rampe ardoise (valeurs 🔶), statut du maître saphir, tuile camp vs hutte (conclusion D4), ce qu'Erik valide en ligne, 🔶 (ardoise, écart teintes AI/UI, calibre archer).

## 5. Critères d'acceptation

1. En jeu : 6 couleurs de joueur partout (sprites, UI, lobby), plus aucune trace de violet/cyan actifs ; parties existantes toujours jouables (repli p7).
2. Guerrier ET archer = les SVG d'Erik (style intact, approximation de teinte assumée), même calibre hauteur, ×2 net au zoom.
3. Barbare : nouvelle unité + camp sur tuile `tuile_barbare`, hutte bonus intacte (ou cas remonté si asset partagé).
4. Icônes de rendement remplacées (5), lisibles aux tailles du HUD.
5. Suites vertes, zéro changement moteur/serveur/protocole, fichiers d'Erik non commités, artefact fond noir écarté.

## 6. Périmètre interdit
- `new_ressources/` et tous les autres dossiers `new_units/*` (D7) ; toute retouche des SVG fournis ; le recoloriage d'accent (D2) ;
- Moteur/serveur/protocole/rendu (au-delà des assets et d'`accents.json`) ; le maître saphir existant (statut consigné, pas supprimé) ; 3D ; tuiles terrain déjà livrées.
