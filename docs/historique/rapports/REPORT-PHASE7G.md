# RAPPORT PHASE 7g — Naval & Espionnage

**Statut : complétée et déployée.** R-117..R-120 transcrites dans `RULES.md` §8.6, implémentées moteur/serveur/UI, couvertes par tests citant leur identifiant, migration `schemaVersion` 10→11 testée, e2e moteur (invasion côtière + vol de GP) vert, session réelle driver + bot sur wrangler dev (3 vols de GP in-vivo), déploiement prod via CI.

## Décisions de tranche (pilotage 7g — appliquées telles quelles)

- **Transport naval** : 1 unité terrestre par Galère/Galion (`cargoCapacity: 1`, data-driven) — **inclus**.
- **Vol de GP** : jalon retiré à la victime, **escalade T-27 inchangée** (aucun `greatPersonsObtained` ne varie).
- **Soutien naval** : s'ajoute à `S_att` (R-118).
- **Alternance Artiste/Penseur** : conservée (déterministe, testable, lisible).
- **Rythme T-27** (« Palais seul = 20 tours ») : inchangé — fidèle à CivRev, la culture exige la démographie.

## Livrables

### L0 — Règles écrites (`RULES.md` §8.6)

- **R-117 · Mouvement naval** : l'eau praticable pour les unités `aquatic` uniquement (Galère = côte seule ; Galion/Croiseur/Cuirassé/Sous-marin = côte + océan, hook R-107) ; villes portuaires accessibles aux navires (T-11 inchangé pour les terrestres) ; pas de capture d'eau ; production navale limitée aux villes côtières ; **transport** : embarquement (1 PM, chemin restant gelé), état « à bord » (`aboard`/`cargo`, position miroir, l'unité n'occupe plus/ne bloque plus/ne combat plus), débarquement (premier pas terrestre libre adjacent), naufrage (la cargaison coule avec le navire).
- **R-118 · Soutien naval** : un combat terrestre adjacent à la côte reçoit en force d'attaque le meilleur `navalSupport` des navires amis **en mer** adjacents à la case de combat (Galion 15, Croiseur 35, Cuirassé 65) — `S_att = A × (1 + T-01 si vétéran) + navalSupport`.
- **R-119 · Espionnage** : ordre `SpyMission { unitId, cityId, mission: 'stealGreatPerson' }` (Phase C) — Espion adjacent (≤ 1) à une ville ennemie **VISIBLE** ; vol de GP installé (jalons − merveilles > 0) : −1 jalon victime / +1 jalon voleur (raison `gpStolen`), espion consommé ; échec sans frais (espion survit) ; interaction ONU : la suspension R-116 s'applique automatiquement si la victime repasse sous 20 jalons (testé).
- **R-120 · Victoires restantes** : rappel documentaire (domination et culture livrées ; scientifique 7h ; Banque mondiale 7h+).
- **Migration `schemaVersion` 10→11** : champs additifs d'unité `aboard`/`cargo` (null) — idempotent, testé.
- Nouveaux événements : `Embark`, `Disembark`, `SpyMission`, `GreatPersonStolen` + causes `sunk`/`mission` (filtrés par le brouillard comme les autres, R-73).

### L1 — Moteur (`packages/rules`, pur et déterministe)

- **`naval.ts`** (nouveau) : `canEnterTerrain`, `isCoastalCityHex`, `citySiteIsCoastal`, `cargoCapacityOf`, `navalSupportFor` — source unique partagée moteur/UI.
- **`turn.ts`** : `canEnter` (praticabilité par unité) ; `occupants()` ignore les unités embarquées ; embarquement/débarquement dans `executeMoveOrder` ; `moveUnit` miroite la cargaison ; `kill` coule la cargaison (`sunk`) ; **soutien naval** dans `performExchange` ; repli naval via `retreatTarget` (un naval se replie en mer) ; **pas d'avancée** du vainqueur sur une case qu'il ne peut pas entrer (un terrestre qui coule un navire reste sur sa rive — interprétation documentée) ; `applySpyMissions` en Phase C ; production navale refusée hors ville côtière ; fondation impossible depuis l'eau/à bord.
- **Données** : `units.json` — Espion (`implemented`, `spy: true`) + Galère/Galion (`implemented`, `cargoCapacity: 1`) + Croiseur/Cuirassé/Sous-marin (`implemented`) ; aériens/Caravane/Milice/ICBM restent en données (`implemented: false`).
- **Invariants** (amendement documenté) : P2/P4/P5 (`properties.test.ts`) ignorent les unités embarquées — une cargaison n'est plus une entité de carte (co-location avec son transport assumée).

### L2 — Serveur

- `orderShapeError` + `orderOwnerError` : cas `SpyMission` (forme + possession de l'unité ; le reste est re-validé par le moteur).
- Dump admin : section `naval` (flottes : transports + type de cargaison ; espions ; missions en brouillon).
- **Bot** : production navale filtrée par la côte (R-117), navigation sur ses eaux (`navalAccess`), embarquement/débarquement, missions d'espionnage dès qu'une ville ennemie visible adjacente a un GP installé, log étendu (navigation(s)/embarquement(s)/débarquement(s)/mission(s)).

### L3 — UI

- **UnitPanel** : badge ⚓ Naval (côte / côte+océan) + compteur de cargaison, ligne « à bord de », **boutons « Débarquer »** (cases terrestres libres adjacentes — mêmes contraintes que le moteur), **boutons « Mission : voler un GP »** (villes ennemies visibles adjacentes), libellé d'ordre SpyMission.
- **CityPanel** : production navale grisée hors côte (« Requiert : accès à la mer »), libellés naval (côte/océan, « transporte 1 unité terrestre »).
- **GameCanvas** : les unités embarquées ne sont plus rendues ; **point ambré de charge** sur le transport.
- **interaction.ts** : `enterableKnown` (l'eau est traçable pour un naval), embarquement autorisé comme arrivée de chemin, cargaison non cliquable, `unitsWithoutOrders` ignore les cargaisons.
- **labels.ts / playback.ts** : libellés + durées + toasts des 4 nouveaux événements.
- **Sprites** (generate.py + sync-art, LICENSES régénérée) : `unite_galere`, `unite_galion`, `unite_croiseur`, `unite_cuirasse`, `unite_sous_marin`, `unite_espion` (+ `_accent`) — 12 PNG, conformes (`generate.py --check` : CONFORME).

## Vérifications

1. **Suites vertes : 510 tests** (rules 427 — dont 17 nouveaux `phase7g.test.ts` citant R-117/R-118/R-119 + migration + e2e ; server 33 ; web 50) ; `pnpm typecheck` vert (4 packages).
2. **e2e moteur** (`tests/phase7g.test.ts`) : mouvement côte/océan, terrestres bloqués, ville portuaire, combat naval, production côtière, **soutien naval décisif** (même graine, issue inversée par le Galion), embarquement/miroir/chemin gelé, débarquement (+ cas refusés), naufrage (`sunk`, pas d'avancée sur l'eau), vol de GP (succès + échec + escalade inchangée + suspension ONU), migration v10→11, **e2e complet embarquement→traversée→débarquement→assaut de ville soutenu par le Galion → victoire par domination, avec vol de GP en parallèle**.
3. **Session réelle driver + bot** (wrangler dev, partie `68X7YF`, carte variée-40) : ville portuaire fondée, galère + espion produits, **embarquement** (`Embark`), traversée maritime de ~40 tours avec cargaison miroir, **débarquement** (`Disembark`), marche d'approche, puis **3 vols de GP réussis in-vivo** (`SpyMission success` + `GreatPersonStolen` : p2 −1 jalon / p1 +1, t137, t225, t349) — journal : `dev-logs/captures-7g/journal-session-gui.txt`.
4. **Déploiement** : commit `4542efb` + push main → CI `deploy.yml` (build, tests, typecheck, `wrangler deploy --env prod`).

## Captures (`dev-logs/captures-7g/`)

- `capture-7g-01-vue-partie-navale.png` — vue générale de la partie 68X7YF (barre supérieure : jalons X/20 ; carte ; journal).
- `capture-7g-02-toast-vol-gp.png` — prise au moment du vol de GP (toast/journal).
- `capture-7g-03-journal-jalons.png` — barre 13/20 + journal après vols.
- `journal-session-gui.txt`, `journal.txt`, `preuves-embarquement.txt` — journaux de session (événements moteur réels).

**Limite assumée** : l'automatisation headless (CDP) n'a pas permis de piloter la sélection canvas de façon fiable (calibration caméra + input) — les captures d'écran sont des vues générales, pas des panneaux d'unité ouverts ; la preuve de la chaîne complète tient aux **journaux d'événements moteur réels** (protocol-level, ci-dessus) et aux tests e2e. Les panneaux (mission d'espion, débarquement, badge naval) restent à vérifier visuellement par Erik en ligne — cf. « Points à vérifier ».

## Interprétations & écarts (signalés)

1. **R-118 — un seul navire compte** 🔶 : le soutien = MAX des `navalSupport` adjacents (pas de cumul) ; 3 cuirassés ≠ triple bonus. Localisé dans `navalSupportFor`.
2. **R-117 — pas d'avancée sur case non entrable** : un terrestre qui coule un navire en mer reste sur sa rive (miroir de l'exception R-59-a des unités à distance).
3. **R-117 — armée navale** : `cargoCapacity` ignoré pour `isArmy` (une armée de galères ne transporte rien).
4. **R-117 — embarquement** : le chemin restant est gelé (repris au tour suivant — un chemin tracé « à travers » le navire enchaîne débarquement + marche).
5. **R-117 — production côtière** : refus moteur + grisé UI (« Requiert : accès à la mer ») — cohérent avec la géographie CivRev (les capitales préfabriquées sont intérieures : il faut fonder un port).
6. **R-117 — cargaison** : régénère ses PM en Phase D (débarque avec ses PM), ne participe pas à la vision d'un hexagone supplémentaire (position miroir du transport), ne peut pas être capturée ni ciblée.
7. **R-117 — attaque depuis la rive** : un terrestre peut attaquer un navire adjacent en mer (mêlée R-51 standard) — autorisé, déterministe.
8. **R-119 — le GP volé est « installé d'office »** chez le voleur : +1 jalon direct, aucune unité spawnée, aucun `greatPersonsObtained` (escalade inchangée — décision d'Erik). Le compteur « GP installés » dérivé (R-115) reste cohérent : le vol transfère un jalon GP, pas un jalon merveille (condition : jalons − merveilles > 0).
9. **R-119 — échec sans frais** : rien à voler (merveilles seulement) ou conditions non remplies → `SpyMission { outcome: 'failed' }`, l'espion survit (rejouable) 🔶.
10. **R-119 — détection/contre-espionnage reportés 7h** : la mission réussit toujours quand les conditions sont remplies ; Remparts sans effet sur l'espionnage en l'état.
11. **Espion depuis un navire** : mission autorisée depuis la cargaison (position miroir adjacente à une ville portuaire) — cas limite déterministe, non interdit.
12. **Invariants P2/P4/P5 amendés** : une unité embarquée n'est plus « une entité par case » — le co-emplilement cargo/transport est légal et invisible hors du transport.

## Points à vérifier en ligne (pour Erik)

1. Le menu de production d'une ville **côtière** propose Galère (immédiate), Espion (Écriture), puis Galion/Croiseur/Cuirassé/Sous-marin selon les techs ; une ville intérieure les grise avec « Requiert : accès à la mer ».
2. Panneau d'une Galère : badge ⚓ + « cargaison 0/1 → 1/1 » + boutons « Débarquer » quand une cargaison est à bord et une rive libre adjacente.
3. Panneau de l'Espion adjacent à une ville ennemie visible : bouton « Mission : voler un GP — <ville> » ; après réussite : toast + journal « GP VOLÉ ! » et jalons ±1 (l'escalade du seuil T-27 de la victime est inchangée).
4. Sprites navals/espion sur la carte (base + accent couleur joueur).

## En suspens (reportés, à proposer pour 7h)

- **Détection/contre-espionnage** (Remparts, espion défensif) — 7h.
- **GP or/science/production/combat** + **gouvernements** (mods culturels Monarchie/Communisme anticipés) — 7h.
- **Conversion culturelle passive** (territoire/frontières — proposition d'implémentation attendue) + **D2 culture-ressources** (Encens/Soie) + **sauts technologiques**.
- **Merveilles à effets complexes** (Grande Bibliothèque, Oracle, Grande Muraille, Himeji, Magna Carta, Hollywood) — 7h.
- **ICBM/SDI**, **aériens** (Chasseur/Bombardier), **Caravane/Milice** — 7h+.
