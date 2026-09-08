# REPORT-FONDERIE-T4 — Intégration des 18 assets v3 (session du 07/09/2026)

Exécution de [HANDOFF-FONDERIE-T4-INTEGRATION-V3.md](HANDOFF-FONDERIE-T4-INTEGRATION-V3.md).
**Zéro changement gameplay** : `packages/rules` et serveur intacts, `schemaVersion` **19**
(`packages/rules/src/state.ts:372`), `visuel3d.json` reste la seule table de mapping.

## M1 — Promotion et archivage ✓

- Les **18 `_v3.glb` validés** copiés de `fonderie/modeles/` vers `assets-src/modeles/`
  + copie servie dans `apps/web/public/modeles/` (noms `_v3` conservés — le mapping
  pointe le fichier exact, revenir en arrière = une ligne de JSON).
- **17 v1 remplacés déplacés** vers `assets-src/archives/modeles-v1/` (nouveau répertoire,
  [README](../assets-src/archives/modeles-v1/README.md) avec date + raison) : les 16
  homonymes + `glace.glb` (servait de modèle au type `legion`). Supprimés de
  `public/modeles/` — **plus servis au jeu** (vérifié : requête → fallback SPA HTML,
  alors que les `_v3` répondent `model/gltf-binary`).
- `assets-src/modeles/` conserve les v1 **non remplacés et toujours mappés** :
  `guerrier`, `colon`, `chasseur`, `sousmarin`, `veloce` (23 .glb au total, miroir
  exact de `public/modeles/`).

## M2 — Le point de teinte (piège knight) ✓ CORRIGÉ

- `apps/web/src/lib/render3d/unitesglb.ts` faisait `mat.color.set(accentDim)` sur le
  clone `accent_joueur` — le facteur de luminance **6.6 cuit** dans le glb était écrasé
  (rapport HABILLAGE-TRIPO découverte #7). Corrigé en **multiplication** :
  `mat.color.copy(p.mat.color).multiply(accent)` — même comportement que
  `fonderie/viewer.js` (`userData.couleurBase` × teinte). Le matériau source n'est
  jamais muté ; le néon reste un autre matériau, jamais teinté.
- **Nouveau test** (`unites3d.test.ts` « teinte joueur MULTIPLICATIVE ») : J1 ≠ J2,
  `teinte/accent == base` (facteur conservé, pas d'écrasement), néon intact.
- Vérifié à l'œil dans l'atelier : fiche `chevalier_v3.glb` — corps teinté lisible
  (accent), liserés néon constants. Capture
  `dev-logs/captures-fonderie-t4/atelier-chevalier-v3.png`.

## M3 — Mapping visuel3d.json ✓ (17 types v3 + 1 signalé)

| Type moteur | Modèle | | Type moteur | Modèle |
|---|---|---|---|---|
| archer | archer_v3 | | char_d_assaut | char_v3 |
| legion | legion_v3 (ex-glace) | | infanterie_moderne | infanterie_v3 |
| piquier | piquier_v3 | | galion | gallion_v3 |
| catapulte | catapulte_v3 | | croiseur | croiseur_v3 |
| chevalier | **chevalier_v3** | | cuirasse | cuirasse_v3 |
| fusilier | fusiller_v3 | | icbm | icbm_v3 |
| canon | canon_v3 | | espion | espion_v3 |
| bombardier | bombardier_v3 | | galere | galere_v3 |
| artillerie | artillerie_v3 | | | |

- **`echelle` : 1.0 partout** (défaut calé) : la fonderie cuit chaque v3 à « plus
  grande dimension ≈ 2.6 unités » (mesuré : hauteurs 0.45→2.60 mais emprises max
  ~2.6 dans tous les cas), donc `echelle 1.0` donne déjà la cible écran ~2.5-2.75
  homogène. Erik ajuste à l'œil par type = une ligne de JSON.
- **Choix knight vs chevalier** : `chevalier_v3` retenu pour le type `chevalier` (il
  fait partie des 18 validés ; `knight_v3` est le prototype de la session précédente).
  `knight_v3.glb` reste en fonderie — rien n'est détruit.
- **Signalé, non forcé** (consigne M3.1) :
  1. **`barbare_v3.glb`** : promu dans `assets-src/modeles/` + `public/modeles/` (il
     fait partie des 18) mais **SANS type moteur** — les barbares réutilisent les
     types existants (`createBarbarianUnit(state, hex, type)`). Fichier orphelin
     délibéré, documenté dans le `_comment` et dans les tests. → **décision d'Erik**.
  2. **`chasseur_v3.glb` et `colon_v3.glb`** : présents dans le commit du lot mais
     **hors du tableau des 18 validés** du rapport de lot → laissés en fonderie, les
     types `chasseur`/`colon` gardent leurs v1. → validation d'Erik attendue.
- Types non couverts (guerrier, colon, chasseur, cavalier/veloce, sous_marin) :
  rendu v1 inchangé — régression impossible.

## M4 — Vérification

- **Tests** : suite complète verte (web 159/159 dont les tests mis à jour, server 72,
  rules — 3 paquets) ; **typecheck 4/4** (0 erreur). Tests du chargeur mis à jour :
  `legion → legion_v3.glb`, orphelin `barbare_v3` documenté, compte 23 .glb servis —
  **les .glb archivés ne sont plus référencés nulle part** (garanti par
  `unites3d.test.ts` : tout fichier servi est mappé, sauf l'orphelin délibéré).
- **Bench 40×40 (Lab3d, v3 en place)** : **60 FPS**, **197 draw calls** (1600 tuiles,
  973 instances structures / 46 pools, 162 k triangles), **CPU min 0.4 ms/frame**,
  rebuild 14.9 ms, picking 0.01 ms. Capture `dev-logs/captures-fonderie-t4/bench-40x40-v3.png`.
  🔶 **« Avant » non remesuré** : la remesure T3 a échoué de façon répétée — la
  fenêtre de rendu bascule en arrière-plan et `requestAnimationFrame` est suspendu
  (bench bloqué sur « Mesure en cours… », FPS 0). Compensé par : baseline T3
  « 60 FPS » (PILOT-HANDOFF §25) et argument structurel — les v3 ont la même
  organisation que les v1 (2 matériaux TRIANGLES + LINES ⇒ mêmes pools, ~3 draw
  calls/modèle), le calque d'instanciation est inchangé.
- **Atelier** : les fiches des types montrent les `_v3` (catalogue testé vert,
  10/10) ; fiche chevalier_v3 rendue et teintée correctement (capture).
- **Vraie partie solo bot** (XM9NBE, Pangée 40×40, Amérique vs Zoulous bot) : mode
  3D activé, terrain + mainframe + unités rendus, **22 modèles préchargés dont les
  17 v3 mappés, AUCUN .glb archivé chargé** (relevé `performance.getEntriesByType`).
  Tour 0→1 joué (fin de tour + reprise bot OK). Captures
  `dev-logs/captures-fonderie-t4/partie-3d-tour1.png` / `partie-3d-tour1-j1.png`.
  🔶 Non vérifiable au tour 1 : teintes J1/J2 sur les **v3** en jeu (aucune unité v3
  recrutable en ère ancienne — couvert par le test M2 + la fiche atelier) et le fog
  sur unité adverse (aucun contact). Même cause : l'arrière-plan suspend le rendu.
- À noter (environnement) : le serveur de dev sur 8787 était dans un état bloqué
  (hang sur `/api/me` même hors navigateur, respawn workerd figé d'un node daté du
  06/09) — il a été redémarré (`pnpm dev:server`, répond en 6 ms). Vite tournait déjà
  sur 5174.

## Critères d'acceptation

- Les 17 types couverts affichent **uniquement les v3** ; teinte multiplicative
  corrigée et testée ; playback/sélection inchangés (zéro gameplay). ✓
- `assets-src/modeles/` = 18 v3 + 5 v1 non remplacés ; 17 anciens dans
  `assets-src/archives/modeles-v1/` (README). ✓
- `visuel3d.json` = seule table de mapping ; activer/désactiver = une ligne. ✓
- Bench sans régression (60 FPS, DC cohérents de la structure du calque) ; suite
  verte ; schemaVersion 19 ; `packages/rules`/serveur non touchés. ✓

## T4bis — Les trois arbitrages d'Erik (appliqués le 07/09, même session)

Suite à la remise de la main, Erik a tranché les trois signaux — appliqué :

1. **`barbare_v3` = le modèle des barbares** ✓
   Nouvelle table DATA-DRIVEN `visuel3d.json` §`structures.unites3dSurchargeProprietaire` :
   `"barbarien": { "glb": "barbare_v3.glb", "echelle": 1.0 }` (id `barbarien` =
   `BARBARIAN_ID` de `barbares.json`). Le calque (`spec3d.ts` : `SURCHARGE_UNITES3D_PAR_PROPRIO`,
   `entreeUnite3DDe(owner, type)` ; `unites3d.ts` : la surcharge gagne sur l'entrée par type)
   l'applique à TOUTE unité barbare, quel que soit son type moteur ; `aModele3D(type, owner)`
   suit (le sprite 2D est masqué — pas de double rendu). Changer/retirer = une ligne de JSON,
   zéro durcissement dans le code. Le type moteur des unités n'est pas touché (zéro gameplay).
   **Tests** : `entreeUnite3DDe('barbarien', …)` → `barbare_v3` (guerrier, archer, et tout
   type), joueur humain inchangé, et `unitesGLBStructures` produit l'entrée `barbare_v3`
   pour une unité `owner: 'barbarien'` tout en gardant `guerrier_v3` pour un humain.
   **Visuel** : `dev-logs/captures-fonderie-t4/fonderie-barbare-v3-j7.png` (barbare_v3 teinté
   J7 rouge — corps lisible, néon constant). 🔶 En vraie partie : les barbares engendrés
   (vérifiés côté état debug — u4 en 8,20…) restent hors de la vision du joueur à tour 30 ;
   le rendu en jeu sera visible au premier contact (mécanisme couvert par les tests du calque).
2. **`chasseur_v3` / `colon_v3` validés** ✓ — sortis de `fonderie/modeles/` (git mv),
   promus `assets-src/modeles/` + `public/modeles/`, mappés sur `chasseur` et `colon` ;
   les v1 `chasseur.glb`/`colon.glb` archivés. Hauteur/emprise vérifiées au parse
   (chasseur h 0.93 / emprise 2.54 ; colon h 1.74 / 2.59 — convention max-dim ≈ 2.6,
   `echelle` 1.0). Fiches atelier rendues : `atelier-colon_v3.png`, `atelier-chasseur_v3.png`.
3. **Le knight EST le guerrier** ✓ — `fonderie/modeles/knight_v3.glb` déplacé et renommé
   `assets-src/modeles/guerrier_v3.glb` (h 2.60, face -Z vérifiée, `echelle` 1.0) ; le
   mapping `guerrier` pointe `guerrier_v3.glb` (remplace le `guerrier.glb` v1 et son
   `echelle` 0.67). L'ancien `guerrier.glb` est archivé avec la note « non retenu par
   Erik, remplacé par la version knight ». Le README d'archivage est mis à jour ; plus
   aucun `knight_v3.glb` servi ou en fonderie (le visualiseur fonderie a un nouveau
   défaut, `barbare_v3.glb` ; les mentions historiques dans les rapports/captures restent).

**Vérifications T4bis** : suite complète verte (web 161/161 — 2 nouveaux tests, server 72,
rules), typecheck 4/4, bench 40×40 inchangé (60 FPS / 197 draw calls / 0.6 ms CPU —
capture `bench-40x40-t4bis.png`), zéro fichier gameplay touché. En jeu (tour 10+) :
le guerrier du joueur rend bien le knight teinté (`partie-3d-tour10.png`) et la liste
des requêtes modèles ne contient AUCUN .glb archivé (22 mappés chargés, `barbare_v3`
sur demande). 23 .glb servis = 23 branchés (test), plus aucun orphelin.

## T4ter — Calibrage d'Erik après vérification en ligne (07/09)

1. **Unités réduites de moitié** ✓ — les 20 entrées `_v3` du catalogue `unites3d` et la
   surcharge propriétaire passent à `echelle: 0.5` (JSON uniquement ; `veloce`/`sousmarin`
   v1 restent à 1.0).
2. **Rotation vers l'avant de la carte** ✓ — data-driven et générale, sans ré-écriture des
   fichiers : nouvelle clé `rotation` (DEGRÉS autour de Y, défaut 0) au format du catalogue
   ET de la surcharge, validée par `spec3d.ts` (`parseEntreeUnite3D` — hors [-360, 360]
   refusé), portée par `UniteGLBEntree` (`unites3d.ts`) et appliquée à la pose dans
   `unitesglb.ts` (`makeRotationY × échelle` sur les pools instanciés + `rotation.y` sur
   les clones LINES). Le lerp de playback ne porte QUE la position : la rotation, constante
   par modèle, suit le déplacement sans casser l'interpolation (tests à l'appui). L'atelier
   rend les fiches COMME EN JEU (`entreesGlbPour` passe `echelle` + `rotation`, y compris
   via la surcharge). `rotation: 180` posé sur les 20 types v3 + barbare.
   **Tests** : parse (défaut 0, degrés, erreur claire), pose matricielle (180° = -1 sur X/Z,
   échelle conservée, position inchangée), portée catalogue + surcharge.
   **Visuel** : la fiche `guerrier_v3` montrait le DOS avant, la FACE après
   (`atelier-guerrier-v3-rotation.png` vs `atelier-guerrier-v3-knight.png`) ; en jeu le
   barbare (`barbare_v3`, teinte rouge) est vu de face à mi-taille
   (`partie-3d-t4ter-barbare.png`, `partie-3d-t4ter-taille-moitie.png`) ; déplacement soumis
   et résolu proprement en 3D (`partie-3d-t4ter-playback-*.png`, tour 37→38).

**Vérifications T4ter** : suite complète verte (web 164/164 — 3 nouveaux tests, server,
rules), typecheck 4/4, bench 40×40 sans régression (60 FPS / 197 draw calls / 0.6 ms CPU —
`bench-40x40-t4ter.png`). Zéro gameplay touché.

## Reste à Erik (décisions, hors de cette session)

1. ~~`barbare_v3.glb` : quel type moteur ?~~ **Tranché T4bis** : surcharge propriétaire
   `barbarien` → `barbare_v3.glb`.
2. ~~`chasseur_v3.glb` / `colon_v3.glb` : validés ?~~ **Tranché T4bis** : promus et mappés,
   v1 archivées.
3. ~~`knight_v3.glb` : à archiver ou garder pour A/B ?~~ **Tranché T4bis** : c'est LE guerrier
   (`guerrier_v3.glb`), l'ancien `guerrier.glb` v1 archivé.
4. Calibrage fin des `echelle` à l'œil (défaut 1.0 posé, cf. M3).
5. Teintes J3-J6 : toujours en attente de ta décision (non branchées, cf. périmètre
   interdit).
