# REPORT-CULTURE-RESSOURCES — canal culture des ressources travaillées : Encens +2, Soie +3

**Mission livrée — ARRÊT L4 : captures + chiffres ci-dessous, AUCUN COMMIT tant qu'Erik n'a pas donné son feu vert à l'œil.**

## 1. Formule (L1 — moteur)

Un seul terme ajouté à la culture de ville, dans `cityEconomyInputs` + `processEconomy` (`packages/rules/src/turn.ts`) :

```
cultureCumulee += round((cultureGains(ville, bonusEmpire, techs, régime)   // R-113 inchangée
                         + directCulture)                                   // ← NOUVEAU
                         × multiplicateurGP_artiste_penseur)
```

- `directCulture` = **helper partagé moteur/UI** `cultureRessourcesTravaillees(map, workedTiles, techs, bypassTech)` (`packages/rules/src/resources.ts`) : Σ des `culture > 0` des ressources sur les cases **TRAVAILLÉES** (mêmes cases que les rendements R-60), accessibilité **R-93** (`revealedByTech` null ou tech débloquée ; `bypassTech` = trait Indien R-149). Générique data-driven : toute future ressource avec `culture > 0` fonctionne sans code.
- Coule dans `cultureCumulee` → paliers T-27, jalons, GP, frontière culturelle R-162 : **zéro changement aval** (aucune nouvelle mécanique).
- **Anarchie R-122** : `directCulture` forcé à 0 (comme l'or direct R-134) et `gainCulture` déjà gated.
- **Capture** : le moteur lit les techs du **propriétaire actuel** de la ville → « celui qui travaille reçoit » (D4-f testé).
- 🔶 **Centre-ville exclu** (miroir exact du canon R-134 de l'or direct, qui ne compte que `workedTiles`) : une ressource culturelle sur la case de ville elle-même ne rapporterait pas. La ressource est de toute façon détruite à la fondation (miroir `processFoundCity`) — cas théorique, à re-trancher seulement si Erik veut l'alignement sur les rendements (qui incluent le centre).

## 2. Cas D4 — tests (`packages/rules/tests/culture-ressources.test.ts`, 8 tests, vert)

| Cas | Résultat |
|---|---|
| Encens travaillé + Rites funéraires | +2 culture/tour (baseline palais 1 → 3) |
| Encens non travaillé | rien (baseline) |
| Soie cachée avant Littératie | rien ; révélée + travaillée → +3 |
| Encens avant Rites funéraires | rien (accessibilité R-93) |
| Anarchie | 0 (R-122) |
| Ville capturée qui travaille | bonus selon les techs du nouveau propriétaire |
| Invariance (aucune ressource culturelle) | culture inchangée |
| Données inchangées | `encens.culture = 2`, `soie.culture = 3` (aucune valeur touchée) |

**Invariance générale / migration** : aucune partie existante ne change (les villes sans ressource culturelle travaillée ont `directCulture = 0` — bit-identité: le flux RNG n'est pas touché). `schemaVersion` **inchangée** : le champ `culture` existait déjà dans `resources.json` (données), rien ne persiste côté état — **migration inutile, vérifié**. Zéro changement protocole/serveur.

🔶 **Découverte de données à re-trancher par Erik** : le handoff disait « encens actif dès le départ », mais `resources.json` porte `encens.revealedByTech = "rites_funeraires"` (la tech existe dans techs.json — l'ancienne recommandation D4 « null pour les 13 sans tech » n'a donc pas été appliquée à l'encens). Le canal respecte les données : **l'encens ne rapporte ses +2 qu'après Rites funéraires**. Si Erik veut l'encens actif dès le tour 0 : édition JSON d'une ligne (`revealedByTech: null`), aucun code.

## 3. Affichage (L2)

- **Icône culture** : ajoutée aux `yieldIcons` des textures (`icone_culture.png` — l'icône des paliers T-27 déjà dans l'art), fallback null propre (optionB).
- **Glyphe tuile (D2)** dans l'overlay des rendements de GameCanvas (même boucle que N/P/C, mêmes filtres Rendements/fog/rayon de ville) :
  - **culture +N** : ressource `culture > 0` accessible ET case **travaillée** ;
  - **or +N** (ADDENDUM « or gem ») : `directGold` de gemmes (+2) / or (+3) dès que la ressource est accessible — caché avant Monnaie (brume + terrain seul, comme aujourd'hui). **Subtilité documentée** : ce glyphe or ne suit PAS la conversion R-90 — l'or direct va à la trésorerie même si la ville convertit en science (contrairement au commerce des autres tuiles, qui bascule or/science dans le rayon d'une ville convertie). Client seul : R-134 était déjà implémenté côté moteur (c0adb96).
- **Panneau de ville (D3)** : la ligne existante « Frontière culturelle — +N culture /tour » (CityView + PanneauVille) intègre désormais `cultureRessourcesTravaillees` (miroir exact du moteur — même helper). La culture était jusque-là trop faible pour être significative ; elle l'est maintenant, aucune nouvelle ligne nécessaire.

## 4. Vérification (L3)

- Suites complètes ×2 : **rules 944/944** (dont 8 nouveaux), **web 481/481**, **server 120/120**, **svelte-check 0 erreur**.
- **E2E solo réel (wrangler) : TENTATIVE ET BLOQUÉE par la carte, pas par le canal** — `devtmp/culture-prep.mjs` joue une vraie partie solo (pangee-40) : Rites funéraires en légal (conversion science), pop 2, `SetWorkedTile` encens, mesure du delta `cultureCumulee`. Constats : (a) le spawn pangee-40 est quasi fixe et sans gemmes/or à proximité (≈2 % par seed) ; (b) la science d'un spawn intérieur prairie est ≈ 0 (limite connue du banc, cf. OR-RUSHBUY 29/09) — Rites funéraires (30 🔬) non atteintes en 30 tours sur les 8 seeds testées. Le script est conservé et rejouable ; le **canal moteur est lui prouvé par les 8 tests resolveTurn** (mêmes chemins que l'e2e : workedTiles + techs + cumul).
- **Captures GUI réelles** (moteur + rendu de production, page labo dédiée `#/labo-culture` — client pur, miroir `#/labo-rendu`) dans `dev-logs/captures-culture-ressources/` :
  1. `1-encens-travaille-glyphe-culture.png` — encens travaillé révélé : **glyphe +2 culture** sur la tuile (icône paliers, distincte du blé), **panneau « +4 culture /tour »** (palais pop 2 = 2 + encens 2), gemmes **+2 or direct** visible, **or +3 masqué avant Monnaie** (montagne aux filons jaunes sans glyphe or) — la règle d'accessibilité de l'addendum est visible sur la même capture ; soie cachée à l'est sans glyphe. Jauge frontière 0/10, prochain anneau 3 tours.
  2. `2-sans-rites-encens-cache.png` — bascule Rites funéraires OFF : l'encens redevient « inconnue » (tuile générique + jeton), **glyphe culture disparu**, panneau redescend à **« +2 culture /tour »** (palais seul) — exactement la démonstration cachée/révélée demandée pour la soie, jouée sur l'encens (même mécanisme R-92/R-93).
- Verdict juge visuel : **pass** sur les deux captures (après une boucle de réparation : prop `showYields` du labo + masquage R-92).

## 5. Ce qu'Erik valide en ligne (🔶)

1. **Style du glyphe** : +N avec l'icône culture des paliers sur la tuile (capture 1) — calibre/position à l'œil.
2. **Panneau** : la ligne « +4 culture /tour » intègre l'encens — suffisant, ou veux-tu une décomposition (base + ressources) ?
3. **Encens gated par Rites funéraires** (données actuelles) ou actif dès le départ (édition JSON `revealedByTech: null`) — le handoff suggérait « dès le départ », les données disent le contraire.
4. **Centre-ville exclu** du canal culture (miroir R-134) — confirmer.
5. **Glyphe or direct** (gemmes/or) sur la tuile, non converti R-90 — conforme à l'addendum, à l'œil.

## 6. Fichiers touchés (non commités)

- `packages/rules/src/turn.ts` — `directCulture` dans `CityEconomyInputs`, branché dans `gainCulture` (gated anarchie).
- `packages/rules/src/resources.ts` — helper pur `cultureRessourcesTravaillees` (source unique moteur/UI).
- `packages/rules/tests/culture-ressources.test.ts` — 8 tests D4.
- `apps/web/src/lib/render/textures.ts` — icône culture dans `yieldIcons` (chargement réel + fallbacks).
- `apps/web/src/lib/render/GameCanvas.svelte` — glyphes culture (travaillée) et or direct (accessible) dans l'overlay des rendements.
- `apps/web/src/components/CityView.svelte`, `PanneauVille.svelte` — culture/tour du panneau = miroir moteur.
- `apps/web/src/lib/render3d/optionB.ts` — fallback icône culture.
- `apps/web/src/pages/LaboCulture.svelte` (nouveau) + route `#/labo-culture` (App.svelte) — labo de validation, conservé comme les autres labos.
- `devtmp/culture-prep.mjs`, `devtmp/culture-captures.mjs` — scripts e2e/captures.
- DONNÉES/PROTOCOLE/SERVEUR : **intacts**.
