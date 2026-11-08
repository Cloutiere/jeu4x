# REPORT-BONUS-DECOUVERTE — Placement des bonus « premier découvreur » + Milice de bord

**Mission** : `HANDOFF-BONUS-DECOUVERTE.md` (décisions Erik 07/10, D1-D6). Test-first (L1), moteur (L2), client (L3), GUI avec captures (L4), suites/RULES/commit/push/rapport (L5).

**Verdict : PASS** — critères d'acceptation 1-4 satisfaits (détail ci-dessous). Suites : rules **1057** (+25) / web **588** (+2) / server **123**, tsc 0 erreur ×3, svelte-check 0 erreur.

## 1. Ce qui a été livré

### L1 — Tests (test-first, rouge confirmé avant implémentation)
`packages/rules/tests/bonus-decouverte.test.ts` — **25 cas**, carte côtière 8×7 (miroir phase7g) :

- **D1 spawn naval** : galion dans la ville côtière au tri (jamais sur terre), égalité → capitale, égalité sans capitale → tirage seedé reproductible, toutes cases d'eau occupées → spawn sur la CASE VILLE (port R-117), port occupé aussi → ville suivante, tout occupé → annulé + chronique, aucune ville avec cases d'eau → annulé + chronique, helper `siteSpawnNaval` : la Galère (côte seule) ignore l'océan → port en repli, le Galion y entre en eau (R-107).
- **D2 Milice** : galion bonus → milice à bord (miroir de position, `cargo` posé), sous-marin SANS milice, production en ville (galère) → milice à bord, barbares EXCLUS (`embarqueMilice` → null), naufrage : la milice coule avec son navire (`UnitDestroyed` cause `sunk`).
- **D3 bâtiments à terrain** : Comptoir → la ville au plus de déserts (pas la capitale), rayon actuel vide → rayon POTENTIEL Tribunal (2), jamais bénéficiaire → non construit + chronique, Atelier miroir collines, ville choisie déjà dotée → non accordé + chronique (pas de re-choix).
- **D4 sans terrain** : Marché → ville la plus peuplée (Caravane `implemented:false` ignorée), Remparts → égalité → capitale, égalité sans capitale → seedé reproductible.
- **D6 inchangés** : terrestre (capitale → adjacente), or Banque 100.
- **Déterminisme** : même seed ⇒ état identique après récompense navale ; `trieVillesCandidates` pop ↓ / capitale / seedé.

### L2 — Moteur
- **`packages/rules/src/bonusPlacement.ts` (NOUVEAU)** — helper partagé de choix de ville, pur et déterministe :
  - `trieVillesCandidates(cities, seed)` : population ↓ → capitale d'abord → tirage seedé (clés aléatoires tirées dans l'ordre R-81 des cityIds — reproductible ; RNG dédié `createRng(rngSeed ^ BONUS_PLACEMENT_SEED_SALT)`, miroir R-154, jamais Math.random) ;
  - `siteSpawnNaval(st, playerId, unitTypeId, seed)` (D1) : candidates = villes du joueur ayant ≥ 1 case d'eau dans le rayon cultivable (`workRadiusOf` — miroir Port/production navale) ; passe 1 = première ville du tri avec une case d'eau LIBRE praticable par le type (`canEnterTerrain` — la Galère n'entre pas en océan), hors cases d'artefact (miroir freeSpawnTiles R-152) ; passe 2 (repli) = CASE VILLE — ville côtière (`isCoastalCityHex`), case libre ; null = annulé ;
  - `villePourBatimentTerrain` (D3) : décompte des cases du terrain du `tileBonus` au rayon ACTUEL, sinon au rayon 2 (potentiel Tribunal) ; départage des ex-aequo : pop ↓ → capitale → seedé (**détail tranché**, miroir D4 — consigné) ;
  - `villePlusPeuplee` (D4) ; `embarqueMilice` (D2) : milice 0/1/1 à bord (`aboard`, position miroir, `transport.cargo` posé), gardes aquatique + non-sous-marin + non-barbare, idempotent (une milice max par navire) ; `nomTerrain` (chroniques).
- **`packages/rules/src/batiments.ts` (NOUVEAU)** — noyau partagé d'octroi GRATUIT : `accorderBatiment(city, buildingId)` (R-66 déjà dotée → false, R-111 remplacement, `buildings` trié). `grantBuildingToCity` (turn.ts) délègue désormais à ce noyau (Tribunal : réassignation et émission inchangées) et `firstDiscovery` l'utilise — mêmes règles que la production, fin de la divergence (l'ancien octroi Premier découvrir ne triait pas `buildings` ni n'appliquait R-111).
- **`firstDiscovery.ts`** : récompense unité NAVALE → `siteSpawnNaval` (JAMAIS sur terre — bug du Gallion en capitale intérieure corrigé) + `embarqueMilice` ; unité TERRESTRE → comportement historique (D6) ; récompense bâtiment → D3/D4 via helper + `accorderBatiment` + `notGranted` (D5) ; GP → inchangé.
- **`turn.ts`** : `miliceDeBord(board, unitId)` branché aux **7 sites d'engendrement** (production réserve/complétion, rush-buy, Bâtisseur GP, merveille `grantsUnit`, palier économique, hutte ×2) + événement `Embark` existant (fog R-73). La production navale EXISTANTE est intouchée (périmètre interdit §5 — seul le spawn bonus change).
- **`map.ts`** : dotation initiale → garde `embarqueMilice` (no-op tant qu'aucune dotation n'accorde de navire — D2 « dotation/traits »).
- **`events.ts`** : `FirstDiscovered.notGranted?: string` (champ additif — **schemaVersion 27 INCHANGÉE**, zéro migration, rétroactivité nulle : les états anciens n'ont jamais porté le champ).

### L3 — Client
- **`chronique.ts`** : `FirstDiscovered.notGranted` → entrée « découvertes » de ton `bad`, texte moteur (« aucun port valide — Galion non accordé »). **Bug découvert en GUI et corrigé** : la deuxième entrée partageait l'id `e<seq>` de la première → `each_key_duplicate` (Svelte 5) plantait TOUTE la page au rechargement ; fix = suffixe d'id dédié `-ng` (paramètre `suffixe` de `pousser`, stable au rechargement). Test de non-régression ×2 (`chronique.test.ts`, 15 verts).
- **`labels.ts`** : libellé de relecture (journal REPLAY-RESOLUTION) suffixé ` — <notGranted>`.

### RULES.md
- **R-109 révisée** (§8.1bis) : la politique de placement EST la spécification — D1 (tri naval, port R-117, annulation), D2 (Milice de bord, sauf Sous-marin, barbares exclus 🔶), D3 (terrain actuel → potentiel Tribunal → annulé), D4 (population), D5 (`notGranted`, jamais reporté), D6 (terrestres inchangés). Au passage, la liste obsolète des « unités non implémentées » (Espion, Croiseur…) est remplacée par l'état réel des données (`implemented: false` : Caravane, Chasseur, Bombardier…).

## 2. Vérification GUI réelle (L4) — devtmp/bonus-decouverte-gui.mjs

Parties solo légales (procedural-40, vs bot), wrangler 8787 (port du proxy Vite — page et script sur UNE instance), captures `dev-logs/captures-bonus-decouverte/` :

- **A — Navigation (t98, Premier découvrir : p1)** : le Galion bonus `u75` est à (9,10) sur terrain `eau` (JAMAIS sur terre), **Milice à bord** (`naval.transports` cargoType=milice), chronique « Un Galion gratuit » visible. Captures `A1-galion-en-mer-milice-a-bord.png`, `A2-chroniques-galion.png`.
- **B — Code des lois (t106, Premier découvrir : p1)** : aucun désert dans les rayons 1-2 de l'empire → **Comptoir NON construit + annulation chroniquée** (« aucune case de Désert — Comptoir commercial non accordé » dans `lastEvents` ET dans l'UI) — le cas D3/D5 de l'annulation propre, démontré en réel. Capture `B2-chroniques-annulation-desert.png`.
- **C — Navigation dans un empire SANS port** (capitale fondée hors de tout rayon d'eau) : aucun Galion, `notGranted = « aucun port valide — Galion non accordé »` dans `lastEvents` ET chronique UI. Capture `C1-chroniques-aucun-port-valide.png`.

Relues visuelles : **PASS 4/4** (entrées exigées complètes et lisibles ; seuls rognages de recadrage mineurs). Un run antérieur a de plus validé A (t71, Galion en eau + Milice) et B (t79, annulation désert) — le verdict ne repose pas sur une seule partie.

### Pièges consignés (pour les missions GUI suivantes)
1. **Snapshot = dernière résolution SEULE** : la page doit être ouverte PENDANT la partie pour que la Chronique voie les événements en direct ; un rechargement AVANT toute nouvelle résolution rejoue encore les événements manqués ( captures fiables juste après la complétion).
2. **Wrangler zombies** : tuer les ÉCOUTEURS ne suffit pas — le parent node relance son proxy. Purge par ligne de commande (`devtmp/tue-wrangler.ps1` — node.exe « wrangler », ASCII pur sinon PowerShell 5 décode l'UTF-8 en ANSI et casse le parse). Ne JAMAIS tuer les wrappers cmd/bash (on tue ses propres spawns).
3. **UN SEUL wrangler** sur le port du proxy Vite (8787) : deux instances wrangler sur le même stockage DO local = ports empilés et résolutions perdues (plusieurs runs perdus sur ce piège — ports dédiés 8792/8793 abandonnés pour 8787).
4. **R-184 côté script** : un repli de recherche doit VALIDER les PRÉREQUIS (un SetResearch refusé laisse `researching = null` → EndTurn refusé en boucle) ; chaîne technique correcte vers Navigation : alphabet → ecriture → **poterie** → maconnerie → mathematiques → navigation.
5. **Science du départ** : l'auto-assignation (nourriture d'abord) laisse la science à ~0 dans une capitale côtière jeune — migration `SetWorkedTile` des citoyens vers l'eau (3 commerce R-107) ; « ville pleine » : le `null` retire le DERNIER assigné (éventuellement notre propre eau = migration annulée) → désélection EXACTE d'une case de nourriture, puis la case d'eau.
6. **WS mort en silence** : workerd à moitié figé — HTTP vivant, WebSocket mort, EndTurn dans le vide. Vérifier `readyState` avant EndTurn + redémarrage forcé après 3 échecs.

## 3. Décisions de détail (tranchés, à l'œil Erik si besoin)

1. **Départage D3 des ex-aequo** (même nombre de cases du terrain) : population ↓ → capitale → seedé — miroir D4, non spécifié dans le handoff.
2. **`notGranted` pour la ville déjà dotée** : « `<Bâtiment> non accordé — ville <cityId> déjà dotée` » — le bonus n'est PAS reporté sur la ville suivante (le critère D3/D4 désigne UNE ville ; re-choix = déviation non demandée).
3. **Émissions `Embark`** : chaque Milice de bord produit un événement `Embark` (type existant, fog standard) — visible dans la Chronique (« embarque à bord de »), y compris pour la Milice du spawn.
4. **`payload.unitIds`** d'une récompense navale = [navire, milice] (toutes les unités créées par la récompense).
5. **Zéro ville** (joueur éliminé…) : récompense bâtiment silencieusement perdue (edge documenté, pas de chronique) ; récompense navale → chronique « aucun port valide ».
6. **Candidature D1 vs port** : les cases d'océan comptent comme « cases d'eau » pour la candidature d'une ville (isWaterTerrain), mais seules les cases PRATICABLES par le type comptent pour le spawn — une Galère dans une ville bordée d'océan sort sur le port (R-117), testé.
7. **Capture (non modifié, R-117 existant — consigné 🔶)** : à bord, la Milice ne défend pas, n'ouvre rien et coule avec le navire détruit (`kill` récursif, cause `sunk`) ; les navires étant militaires, leur perte passe par la mêlée (à mort) — pas de capture de navire ; une Milice DÉBARQUÉE est une unité pacifique (capture R-43 standard si investie). 🔶 barbares : exclus de la Milice (aucun navire barbare engendré à ce jour — garde défensive).

## 4. Critères d'acceptation

1. **Aucune unité navale bonus sur terre** — test ×8 + GUI A (galion sur `eau`) et C (annulé sans port) ✅ ; **Milice à bord sauf Sous-marin/barbare** — tests ×5 + GUI A (cargo=milice) ✅ ;
2. **Comptoir/Atelier au meilleur bénéfice** (actuel → potentiel Tribunal → annulé) — tests ×5 ✅ ;
3. **Annulation propre et annoncée** — tests ×4 + GUI B (aucun désert) et C (aucun port), champ additif `notGranted`, jamais reporté ✅ ;
4. **Déterminisme total** (même seed ⇒ mêmes choix) — tests ×3 (états JSON identiques) ✅ ; **suites et bancs verts** : rules 1057 / web 588 / server 123, tsc ×3, svelte-check ✅.

## 5. Périmètre interdit — respecté

Valeurs des bonus (montants/coûts) intouchées ; canal GP (monarchie/invention) inchangé ; production navale existante (R-117 côtière) intouchée ; zéro 3D ; `schemaVersion` 27 inchangée.

## 6. Fin de session

Moteur + client + tests + RULES committés et poussés ; captures et scripts GUI dans `devtmp/` (non committés — fichiers de travail, hors `dev-logs/captures-*`). Aucun fichier non tracké d'Erik touché.
