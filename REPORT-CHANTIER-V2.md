# REPORT CHANTIER V2 — Structures 3D : Mainframe, cartes-ressources, cratère

**Date :** 04/09/2026 · **Statut :** ✅ **L0→L4 livrés — en attente de l'acceptation visuelle d'Erik (session en ligne).**
**Préalables tenus :** baseline 803 tests verts, typecheck vert, rendu 3D V1 accepté (option B hybride), `schemaVersion` **18 inchangée**, `packages/rules` et serveur **non touchés** (chantier de rendu pur). Sources visuelles : Refonte Cybernétique §Langage visuel + réflexions d'Erik du 04/09 (handoff CHANTIER-V2).

---

## 1. Ce qui a été livré, dans l'ordre du handoff

| Étape | Contenu | Vérification |
|---|---|---|
| **L0** | `visuel3d.json` §`structures` (slots, 22 cartes, Mainframe + paliers, cratère, hutte/village) + chargeur validé dans `spec3d.ts` | tests chargeur (`structures3d.test.ts` + `visuel3d.test.ts`) |
| **L1** | **Mainframe** sur chaque ville (socle + corps hexagonal + bande accent joueur + antenne à pointe néon), **croissance par pop** (3 paliers 🔶 pop ≤6 / ≤18 / ≤31 — miroir R-60bis), **capitale distincte** (couronne + antenne longue + accent élargi ×1,35 🔶), **modules génériques par catégorie** (science/or/production/culture/défense), **module doré des merveilles** | tests d'état (pop → gabarit, capture → couleur, bâtiments → modules, merveilles → module or) |
| **L2** | **Slot standard** (socle hex + liseré néon, géométrie identique PARTOUT, visible même sans ressource 🔶) + **22 cartes-ressources** (plaque inclinée / pilier / borne selon la ressource, couleur + pictogramme peint dédiés, taille significative 🔶) ; **état neutre avant tech** (échelle ×0,58 🔶 + gris + « ? », miroir du marqueur R-92) → **état plein à la découverte** | tests neutre/plein, slot identique, élévation, fog |
| **L3** | **Cratère stérile** (rebord torique + fond assombri — 7m C15) ; **huttes** (dôme + accent doré) et **villages barbares** (dôme + mur d'enceinte) en 3D discrète | tests présence/états |
| **L4** | Perf 40×40, e2e, GUI vraie partie, captures, CI, prod | §2 |

## 2. Vérifications L4

- **Tests : 829 verts** (695 rules + **96 web** dont 26 nouveaux structures/visuel3d + 38 serveur). Typecheck **4/4, 0 erreur**. `packages/rules` intact — zéro changement gameplay, `schemaVersion` 18.
- **E2E conditions réelles** (`e2e-bascule-3d.mjs`) : **VERT** avec la couche structures intégrée — dpr 1.5, bascule 2D→3D à chaud, entités sur leurs cases, échelle stable après zoom/restampillage/ordre, aller-retour 3D↔2D.
- **Perf (bench labo 40×40, 180 frames, vsync, cartes + structures)** : **60 FPS**, **0,4 ms CPU/frame**, **55 draw calls** (budget V1 : 27-41 — l'ajout de 14 pools structures porte le total à 55, objectif ≥ 60 FPS tenu), 1 600 tuiles / 12 304 instances terrain / **3 465 instances structures**, rebuild 4 ms, picking 0,009 ms. Pire cas réel : toutes les ressources de la vraie génération + 30 Mainframes synthétiques (paliers variés, capitales, modules, merveilles).
- **GUI sur vraie partie** (procédurale 40×40, pilote `dev-logs/scripts/gui-v2.mjs` : FoundCity moteur réel au tour 1 + bot p2) : bascule 3D, Mainframe de la capitale posé sur sa case (bande rouge joueur, antenne néon, badge pop), slots/cartes répartis, **clic réel sur la ville → panneau ville réactif** (picking 3D → fonctions pures inchangées), sprites unités billboard inchangés. Captures : `dev-logs/captures-v2-3d/` (vue générale, capitale sélectionnée, zoom Mainframe, zoom cartes, comparatif 2D, bench 40×40).
- **Revue visuelle automatisée (juge)** : **6/6 pass** — aucune structure flottante, aucun hors-tuile, slots distincts des glyphes néon, carte 40×40 lisible. Réserves non bloquantes reportées en 🔶 (§4).
- **Interaction sans réécriture** : `interaction.test.ts` / `hexView.test.ts` verts sans modification — clic/clic droit/alternance R-2/Échap inchangés.

## 3. Décisions posées (et pourquoi)

1. **Planificateur pur (`planifierStructures`) + monde instancié (`StructuresWorld`)** — comme world3d : le plan (position/taille/rotation/couleur par pool) est **pur et déterministe**, testé sans DOM ni WebGL ; Three.js ne fait que consommer. 1 draw call par pool (~14 pools actifs).
2. **« Tuile productive » = terrain avec glyphes** (prairie, plaine, forêt, colline, montagne, désert, eau, océan) — la case de ville et le cratère n'ont pas de slot (non productives). L'eau a des slots (baleine, poisson) — la carte suit l'élévation basse.
3. **État neutre piloté par l'état filtré (R-92)** : toute ressource dont l'id n'est pas résolu (marqueur « inconnue » ou id sans carte) rend la **carte neutre grise « ? »** — aucune logique de tech dupliquée côté rendu ; `hiddenUntilRevealed:false` donnerait la carte pleine d'office (aucune ressource v1 dans ce cas). Le bonus reste verrouillé par R-93 côté moteur (inchangé).
4. **Module générique par CATÉGORIE présente** (défaut 🔶 du handoff) : pas un module par bâtiment — `categorieBatiment` data-driven dans `visuel3d.json` (tous les bâtiments couverts, testé). Art dédiée : V3+.
5. **Le marqueur 2D des villes est masqué en 3D** (sprites base/accent cachés) mais **l'UI projetée reste** : badge de population, barre de production, barre PV du village — infos de jeu intactes. Ressources 2D déjà masquées en 3D depuis V1 : les cartes prennent naturellement le relais.
6. **Couleur joueur injectée** (`couleurDe`) : `structures3d.ts` ne dépend pas de pixi.js/textures — l'accent propriétaire (bande, couronne) et le fog (dim par instance) sont des couleurs par instance.
7. **Espagne/Inde et traits de faction** : rien de dupliqué — la lueur des glyphes passe déjà par `tileYield` (helpers moteur partagés, V1) et les cartes n'affichent que l'identité/le bonus verrouillé, pas de calcul local.

## 4. 🔶 à calibrer par Erik (en ligne — le JSON est calibrable sans code)

1. **Taille des cartes** (`formes` + `carteNeutre.facteur` 0,58) : lisibles aux zooms intermédiaires (forme+couleur), le pictogramme se lit au zoom proche — agrandir si souhaité ;
2. **Paliers du Mainframe** (pop 6/18, hauteurs 0,50/0,80/1,10) ;
3. **Couronne de capitale** : le juge visuel ne la distingue pas clairement du plateau accent — à renforcer (rayon/épaisseur) ou à repositionner ;
4. **Contraste du corps sombre** sur fond nuit (`mainframe.corps.couleur` #24384A) ;
5. **Slot vide visible sur toute tuile productive** (défaut posé) : liseré néon plus ou moins discret (`slot.liseret`) ;
6. **Couleurs des modules** par catégorie (`mainframe.modules.categories`) ;
7. **Bloom du labo** (allumé au banc, éteint en partie — inchangé V1).

**À vérifier en ligne avec le login OAuth d'Erik** : ouvrir une partie, basculer « 3D », vérifier Mainframe/capitale/modules sur ses villes, cartes neutres → pleine après découverte d'une tech (R-92), cratère après ICBM (7m), interaction complète (sélection, chemin, fin de tour, relecture), labo `#/lab3d` (bench + bouton Carte 40×40).

## 5. État fin de session

- Baseline : **829 tests verts**, typecheck 4/4, `schemaVersion` 18, `packages/rules`/serveur non touchés ;
- Captures : `dev-logs/captures-v2-3d/` (6 PNG + `game-code.txt` de la partie de démo) ;
- Pilote GUI réutilisable : `dev-logs/scripts/gui-v2.mjs` (crée une partie procédurale, fonde la capitale tour 1 via le moteur, lève le bot p2).

**Arrêt ici conformément au handoff (L4 — acceptation visuelle d'Erik obligatoire).** La main est rendue au pilot.
