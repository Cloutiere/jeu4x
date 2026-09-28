# REPORT-CARTE-50 — Carte 50×40 : génération multi élargie, conformité prouvée règle par règle

> **Statut : ARRÊT POUR APPROBATION D'ERIK (L4)** — rien n'est committé. Le livrable de l'expérience est le **tableau de conformité** (§3) : 100 % des seeds satisfont toutes les règles de placement DURES ; deux métriques 🔶 consignées (déjà vetoées) restent sous 100 %. Verdict attendu : activer en jeu (c'est le défaut actuel) ou itérer sur les densités.

## 1. Baseline (L0)

- Tests AVANT : 897 règles + 116 serveur + 398 web verts, typecheck 0 erreur.
- Inventaire des points de contact de la dimension 40 : la taille était codée en dur à **3 endroits** du mode libre (`libre.ts` geoSize :401, fullSize :405, garde :410) ; le miroir 1v1 a ses propres 40×40 en dur (`mirror.ts:440-444`, **intouchés**) ; `parseMap` est générique (aucune taille supposée) ; le serveur (`game.ts`) et le lobby ne savent rien de la taille ; le labo n'exposait pas de sélecteur.
- Machinerie SPAWN-START réutilisée telle quelle (R-157 par spawn, purge, normalisation) — le banc statistique 16 seeds devient un banc exhaustif par règle.

## 2. Changements (L1/L2 — aucune règle touchée)

| Fichier | Changement |
|---|---|
| `progen/settings.ts` | **D1/D2** : nouveaux champs 🔶 `libreLargeur: 50`, `libreHauteur: 40` (bornés 30-80 / 20-60) — la taille du mode libre multi est data-driven. Le miroir 1v1 ignore ces champs (40×40 en dur, byte-identique — testé). |
| `progen/libre.ts` | geoSize/fullSize/garde lisent les settings. **D4 (recalibrage 🔶)** : villages/huttes scalés par l'échelle d'aire `(L×H)/1600` → 15+15 en 50×40 (densité par case inchangée ; 40×40 = ×1 exactement). **Renforcement R-108** (bug préexistant, voir §4) : les injections de normalisation du mode libre re-vérifient l'espacement à chaque pose (`recheckSpacing`). |
| `progen/mirror.ts` | `normalizeStartSite` : option `recheckSpacing` (défaut **false** — le miroir 1v1 reste BIT-IDENTIQUE, testé). |
| `apps/web/pages/Progen.svelte` | Labo : sélecteur « Taille (multi libre) » 50×40 (défaut) / 40×40 (héritage), désactivé à 2 sièges (le 1v1 reste 40×40 — message clair). Comparaison A/B à volonté. |
| `apps/web/lib/render/hexView.ts` | **🔶 recalibrage d'affichage, vetoable** : `ZOOM_MIN` 0,5 → 0,3 — sans lui, la carte 50×40 ne tient JAMAIS en entier dans le labo (plancher précédent trop haut de 25 % pour 2000 cases). Ne fait qu'élargir le dézoom (mipmaps déjà en place). |
| `tests/progen-carte-50.test.ts` | **NOUVEAU** — banc de conformité CI : 60 seeds fixes × 3/4/5 sièges, chaque règle a son assertion + tableau de taux en console. |
| `tests/progen-libre.test.ts` | Test D5 adapté aux totaux × échelle d'aire (15+15 en 50×40). |
| `packages/rules/devtmp/banc-carte-50.mjs` | Banc 500 seeds (hors CI) — produit le tableau §3. |

Zéro changement protocole, `schemaVersion` intouché, zéro règle relâchée (D4).

## 3. LE RÉSULTAT : tableau de conformité 500 seeds (5 sièges, archipel — pire cas)

Banc `devtmp/banc-carte-50.mjs`, seeds 1, 7920, 15839, … (pas de 7919), 500 générations, **0 échec de génération**. Copie : `dev-logs/captures-carte-50/tableau-conformite-500-seeds.txt`.

| Règle | Taux |
|---|---|
| Dimensions 50×40 (D1) | **500/500 — 100 %** |
| parseMap : capitales all-pairs ≥ 12 (T-44/moteur) | **500/500 — 100 %** |
| R-157 anneau de départ (×5 spawns = 2500 spawns) | **2500/2500 — 100 %** |
| T-45 purge rayon 2 sans ressource (×5 spawns) | **2500/2500 — 100 %** |
| Équidistance ≤ tolérance évolutive (≤ 12) | **500/500 — 100 %** |
| 🔶 Équidistance STRICTE ≤ 8 (`librePairSpreadMax`) | 82/500 — **16,4 %** (voir §5) |
| 7o : ≥ 4 artefacts posés | **500/500 — 100 %** |
| 7o : artefact à ≥ 4 de toute capitale (R-151/R-152) | **500/500 — 100 %** |
| 7o : Atlantide en haute mer (si tirée) | **500/500 — 100 %** |
| 7d : villages/huttes aux totaux × échelle d'aire (15+15) | **500/500 — 100 %** |
| R-96 : villages ≥ 6 des spawns, ≥ 6 entre eux | **500/500 — 100 %** |
| R-98/7d : huttes ≥ 3 spawns / ≥ 3 entre elles / ≥ 2 des villages | **500/500 — 100 %** |
| R-91 : chaque ressource sur un terrain légal | **500/500 — 100 %** |
| R-108 : espacement ≥ 2 sur TOUTES les paires | **500/500 — 100 %** (après renforcement, §4) |
| 🔶 R-108 : couverture complète (1 de chaque type × 5 joueurs) | 245/500 — **49 %** (voir §5) |
| Connexité (archipel exempt) | **500/500 — 100 %** |
| R-80 déterminisme (test CI, 1 seed/5) | **100 %** |

**Perf** : génération moyenne 615 ms (p95 968 ms, max 1,5 s) au GameDO — même ordre de grandeur que 40×40 (0,2-2 s consignés à CARTE-MULTI). e2e rendu : la partie réelle 50×40 (§6) a été jouée sans lag notable. Le bench rendu Lab3d reste calibré 40×40 (1600 cases) — 2000 cases = +25 % linéaire par case, aucun point de code ne suppose 1600.

## 4. Découverte du banc — bug préexistant corrigé (renforcement, pas relâchement)

Le banc a prouvé que **R-108 était violée par les injections de normalisation du mode libre** (aussi en 40×40 : 99/30 seeds de test) : `normalizeStartSite` filtre les cases injectables de l'anneau 3 UNE fois, puis pose plusieurs ressources adjacentes le long du bord de l'anneau (bétail à distance 1 du bétail voisin). Correctif : re-vérification de l'espacement à CHAQUE pose, **mode libre uniquement** (option `recheckSpacing`) — le miroir 1v1 reste bit-identique (test non-régression vert). Après correctif : 0 violation sur les 500 seeds.

## 5. Les deux métriques 🔶 sous 100 % (tolérances DÉJÀ vetoées — pas des manquements nouveaux)

1. **Équidistance stricte ≤ 8 : 16,4 %** (contre ~100 % à 40×40 sur les seeds CARTE-MULTI). La porte d'acceptation effective est la **tolérance évolutive** (fix CI LOBBY-5 : +1 toutes les 2 tentatives, plafond +4) : 100 % des seeds restent ≤ 12 et DÉTERMINISTES. En 50 de large, 5 spawns parfaits sont plus rares — c'est le prix de cartes plus grandes. 🔶 Option d'ajustement si ça choque à l'œil : remonter `librePairSpreadMax` à 10 dans les settings (data-driven, 1 ligne) — décision d'Erik.
2. **Couverture complète 49 %** : les déficits cumulés sont dominés par le **soufre** (1039 poses manquantes sur 500 seeds, ~2/seed), puis pétrole (150) — le désert est rare en archipel. Tolérance best-effort consignée et assumée depuis CARTE-MULTI (rapport §3 : « soufre −8..−10 »). À 5 joueurs le besoin (5 poses) dépasse ce que l'archipel par défaut offre souvent. 🔶 Options : remonter `desertDensity` au labo, ou accepter le déficit documenté (visible au labo + dump admin).

## 6. e2e et captures (L3)

- **e2e PASSANT** : `apps/server/src/carte-multi-e2e.mjs` sur wrangler dev — partie 5 sièges (1 humain + 4 bots) **en 50×40, jouée de bout en bout en ligne** : fondation R-64, éliminations intermédiaires, **VICTOIRE p1 par DOMINATION au tour 65**, méta « domination » ✓. (Un 1er run a calé au tour 200 sur un timeout WebSocket de wrangler dev — non reproduit au 2e run, sans lien avec la taille.)
- Captures `dev-logs/captures-carte-50/` : vue entière 50×40 seeds 4242 / 777777 (archipel), 20260924 (pangée), **comparaison A/B 40×40 / 50×40** au même seed 4242, zooms terrains, tableau de conformité.
- Ce qu'Erik peut valider en ligne : labo `#/progen` → Sièges 5, Taille 50×40/40×40 au sélecteur, seeds au choix ; en jeu : créer une partie 5 joueurs solo → 4 bots.

## 7. Recommandation

**Tenir le 50×40 en jeu** : toutes les règles dures sont à 100 % sur 500 seeds, la génération est plus rapide que le pire 40×40 consigné, l'e2e passe. Taille max réaliste : le pipeline est générique — 60×40 passe probablement dans les mêmes taux (le banc s'essaie à toute taille via `libreLargeur`), mais les densités de ressources rares et l'équidistance stricte se dégradent avec la taille : 50×40 est le bon palier validé aujourd'hui. Le plancher de zoom 0,3 (🔶) est nécessaire pour la vue entière au labo.

## 8. Ce qui reste ouvert (à l'œil d'Erik)

- Veto sur les recalibrages 🔶 : ZOOM_MIN 0,3 ; villages/huttes 15+15 (échelle d'aire) ; éventuellement `librePairSpreadMax` 8→10 si l'équidistance stricte à 16 % déplaît.
- Densités (désert/soufre) si la couverture doit remonter.
- Suite : banc 3/4 sièges au-delà du test CI (60 seeds) si souhaité.

## 9. CAMPS-RESSOURCES — demande d'Erik du 28/09 (même session, non commité)

**Demande** : « quand on découvre une hutte ami ou détruit un village barbare, la tuile en dessous est révélée et contient une ressource » + espacement R-108 entre ces tuiles et les autres.

**Implémentation** (aucune mutation d'état à l'exécution, zéro protocole) : la ressource est posée **dès la génération** sous chaque village/hutte — canon CivRev « villages always on top of a resource » déjà consigné dans le code du miroir. Détruire le camp retire seulement l'entité : la tuile révèle ce qu'elle a toujours porté (fog R-92 : présence visible à l'exploration, identité filtrée par tech). En jeu : oui, la tuile est révélée (vision de l'unité, rayon 2) ; désormais elle porte TOUJOURS une ressource de son terrain (tirage pondéré `spawnWeight` seedé).

**Espacement garanti** : les camps sont désormais posés à ≥ `minResourceDistance` (2) de TOUTES les ressources (exclusion amont dans `entityCandidates`, images miroir comprises) — leur ressource respecte donc R-108 par construction, et jamais deux ressources côte à côte après une destruction. Les huttes (≥ 3 des spawns) ne peuvent pas non plus violer le rayon de purge T-45.

**Tests** : `tests/camps-ressources.test.ts` (5) + nouvelle ligne au banc CARTE-50 ; suites **904 + 116 + 398** vertes, typecheck 0.

**À l'œil d'Erik** :
- 🔶 Les totaux villages/huttes deviennent légèrement best-effort (l'exclusion d'espacement retire quelques cases éligibles) : 140/150 au banc CI (93 %) — aucun seed ne perd plus d'un camp ou deux.
- 🔶 Préfabriquées : `variee-40` avait DÉJÀ 2 villages posés sur la soie (et des huttes à d=1 du vin — non corrigeable sans toucher la carte, la révélation y est donc tolérante : un camp ne reçoit une ressource que si l'espacement le permet).
- 🔶 Le miroir 1v1 change d'octets (ressources sous camps, par paire miroir identique — équité préservée, checksums verts).

## 10. ARTEFACTS-ILES — demande d'Erik du 28/09 (même session, non commité)

**Demande** : « le placement des artefacts ne doit jamais être sur une île ou un continent accessible au départ par les joueurs ; surfaces accessibles en bateau, peu importe le type de carte. » Arbitrages Erik (28/09) : île = **masse terrestre sans AUCUNE capitale** ; **max 1 artefact par île si possible** ; **Atlantide inchangée** (haute mer) ; sur carte sans île, **basculer vers une génération garantissant des îlots** après quelques échecs.

**Implémentation** (`artefacts.ts`) :
- Terrestre = **île libre uniquement** (composante sans capitale — inaccessible à pied par construction, entourée d'eau donc bateau-reachable en Phase 7). L'ancien repli continental (`maxMainland`) est supprimé ; il ne subsiste qu'en **dernier recours 🔶** : dernier essai d'une carte procédurale pathologique, ou carte préfabriquée sans alternative (pédagogique-40 : presque toute terre, 6 cases d'eau — aucun îlot possible sans la mutiler). Cases alors les plus éloignées des départs.
- **Max 1 par île** : passe 1 = un artefact par île (îles triées par éloignement des départs), passe 2 = réutilisation des îles déjà pourvues.
- **Plancher dur 🔶 4** cases des départs (l'invariant déjà testé) ; le canon **8** (`minDistanceToCapitals`) reste l'ordre de préférence. Abaissement nécessaire : sur certaines pangées à 5, tout point d'eau est à <8 d'une capitale (mesuré, seed 32176).
- **Bascule transparente 🔶** (`garantirIlesLibresPourArtefacts`) : tentatives 1-5 pures ; dès la 6e, îlots offshore déterministes (océan ≥ 4 des départs, jamais adjacent à la masse des joueurs, **paires miroir en 1v1**) jusqu'à compter `countMin` îles libres. Les **préfabriquées** (pas de tentatives) reçoivent le même garant au tirage (`artefactsPourCarteFraiche`, utilisé par `map.ts` et le dump admin `game.ts`).
- Découvertes au passage : les pangées actuelles ont déjà des îlots hors masse principale dans **83 %** des grilles (33/40) — la bascule ne sert que pour les 17 % restants.

**Preuve** : banc `tests/artefacts-iles.test.ts` — **108 générations (3 topographies × 2/3/5 sièges)** : **0 artefact sur la masse des joueurs**, 0 artefact à <4 d'une capitale ; île partagée sur 37/108 cartes (pangée surtout — toléré « si possible »). Tests phase7o adaptés (îles strictes, préfabriquées via la voie de production). Suites **906 + 116 + 398** vertes, typecheck 0.

**À l'œil d'Erik** :
- 🔶 Plancher 4 (au lieu de 8) pour l'ÉLIGIBILITÉ des îles — le 8 reste la préférence de tri.
- 🔶 Pédagogique-40 garde un repli continental (carte presque toute terre, non modifiée) — alternative : ajouter des îlots à la main dans le JSON.
- 🔶 Note technique : l'export JSON du labo `#/progen` montre les `rows` d'origine (les îlots de garantie ne sont que dans le terrain runtime) — cosmétique, admin seulement.
