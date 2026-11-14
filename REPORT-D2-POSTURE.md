# REPORT-D2-POSTURE — l'anti-collision suit la posture : collision universelle, approche posturale

**Mini-mission exécutée le 14/11 (canon Erik « je valide ce découpage » — HANDOFF-D2-POSTURE, sur `2eb4c16`).** Commit : ⚠ CI/Deploy à vérifier (§5).

## 1. Le découpage implémenté (L1)

- **D2-collision — UNIVERSAL, inchangé** : jamais un pas qui atterrit SUR une case où un ennemi CONNU peut arriver ce même tour (portée `distanceArrivee` × mouvement). GZJQZX protégé pour tous, armées comprises.
- **D2-approche — POSTURE-DÉPENDANTE** (`postureAssautSiege`, nouvelle fonction pure) : les membres de l'armée de campagne **en guerre déclarée** dont l'effectif AU RAYON de ralliement ≥ `antiCollision.effectifCampagne` (nouvelle table = **4**, miroir du seuil d'assaut TB-SIEGE `effectifAssaut` normal) sont **exonérés de D2-approche** (d≤1 d'un plus fort/égal) — le gate R-190 + la courbe de pression k-durée régulent leur assaut. Armée entamée (effectif < 4), hors guerre déclarée → posture défensive inchangée. **Exception conservée** : la DERNIÈRE combattante de l'empire n'est jamais exonérée (leçon GZJQZX).
- Branchement : `filtrerAntiCollision(ordres, state, me, categories?, profile?)` calcule la posture une fois ; `botPolicy` passe son profil ; `game.ts` passe le profil de la difficulté du siège. `schemaVersion` **28 intacte**, `gateAttaque.ts`/`defenseVille.ts`/escort/L4/L5/gainSite intouchés.

## 2. ⚠ Constat structurel consigné (diagnostic `apps/server/devtmp/diag-d2-siege.ts`)

**D2-approche est structurellement INCLUSE dans D2-collision** : toute tuile adjacente (d≤1) d'un ennemi terrestre est DANS sa portée d'arrivée 1 tour (BFS `porteeMarche` — un pas voisin est toujours praticable-rejoignable en 1 tour). La clause d≤1 ne peut donc jamais refuser un pas que la collision n'aurait pas déjà refusé (hormis le cas de la tuile de ville propre, déjà exemptée). Conséquence directe, **vérifiée par le diagnostic** :

> Armée réunie (effectif 6 ≥ 4, guerre déclarée, assaut autorisé TB-SIEGE) face à une ville garnie : le pas du membre vers la tuile adjacente à la ville (`(10,0)→(11,0)`, dans la portée d'arrivée de la garnison) est **toujours refusé → Fortify** — le blocage d'approche de siège vient de la **clause COLLISION elle-même**, que le canon D2-POSTURE déclare **inchangée pour les armées**.

Le split est donc **sémantiquement exact** (posture documentée, seuil data-driven, exception dernière-combattante) mais **ne rouvre pas mécaniquement l'approche de siège**. Le banc (§3) est l'arbitre prescrit par le handoff.

## 3. Banc bot 40×3 — l'arbitre (AVANT = `2eb4c16` = `banc-bot-td-AVANT-d2posture.json`)

| Difficulté | victoires | villes | unités | pvMil | tours |
|---|---|---|---|---|---|
| facile | 0 → 0 | 2,00 → 2,00 | 144 → 144 | 410 → 410 | 150 → 150 |
| normal | 1 → 1 | 2,00 → 2,00 | 136 → 136 | 389 → 389 | 149 → 149 |
| difficile | 0 → 0 | 2,00 → 2,00 | 136 → 136 | 394 → 394 | 150 → 150 |

## 3bis. Banc Jev 10 seeds (MÊMES seeds corpus, `bancs/joueur-d2posture/`, 0,3585 $ ≤ 0,60 $)

| Critère (handoff) | AVANT (2eb4c16) | APRÈS | Verdict |
|---|---|---|---|
| **Duels de cohabitation perdus par collision** | 0 | **0** | ✓ |
| **Unités Jev perdues /partie** (≤ 10 — la moitié du gain −61 % doit tenir) | 6,6 | **7,2** | ✓ |
| **Chutes** | 1 | **1** (≤ 2) | ✓ |
| **Fondations** /partie | 5,9 | **5,2** (≥ 5,0) | ✓ |
| Élims | 0 | **0** | ✓ |
| Ping-pong rappel | 0 | **0** | ✓ |
| Coût | 0,3663 $ | **0,3585 $** | ✓ |

## 3ter. VERDICT — ARRÊT-POUR-APPROBATION

- **Critère banc bot ÉCHOUÉ** : victoires **inchangées (0-1/difficulté**, cible ≥ ~8) — le banc APRÈS est **bit-à-bit identique à AVANT**, confirmation numérique du §2 : D2-approche était structurellement subsumée par D2-collision ; le split validé est **sémantiquement exact mais mécaniquement neutre** (aucun pas refusé par d≤1 ne pouvait échapper à la collision).
- **Tous les autres critères passent** : banc Jev intact (0 collision, 7,2 ≤ 10, chutes 1, fondations 5,2, zéro collapse), GZJQZX t36 toujours refusé, NP8JEE actif, suites vertes, `schemaVersion` 28.
- Conformément au handoff (« pas d'itération solo sur le seuil d'effectif ») : **aucune itération lancée** — le levier de restauration des victoires est à l'arbitrage Erik (§4, options a/b/c).

## 4. Levier candidat pour l'arbitrage Erik (NE PAS implémenter solo)

Le blocage réel = la collision elle-même : le pas `dist 2 → dist 1` d'une armée en assaut atterrit toujours dans la portée d'arrivée de la garnison. Options à trancher (aucune lancée) :
- **(a) Collision posturale bornée** : pour les membres d'armée réunie en guerre déclarée, la collision ne s'applique qu'aux tuiles adjacentes à des ennemis **HORS du voisinage immédiat de la ville de campagne** (la garnison qui reste dans sa ville n'« arrive » nulle part — le gate R-190 prend le relais au contact) ;
- **(b) Collision à portée réduite pour la posture d'assaut** (ex. « peut arriver CE tour en PARTANT DE SA CASE » = mouvement − 0 ... même formule) 🔶 à définir ;
- **(c) Accepter le statu quo défensif** (le banc Jev est excellent : −61 % pertes, 0 collision — le 4X devient défensif, les victoires viennent des villes non défendues et de l'ONU).

## 5. Suites + déploiement

- L0 FIRST : 7 nouveaux tests (posture) — **rouges avant fix** (`postureAssautSiege` inexistante), verts après ; `anticollision-chasse.test.ts` : **22 verts**.
- Suites : **rules 1214 · server 525 · web 793 · jev-port 52** verts, `tsc -b` ✓.
- Re-sims : **GZJQZX t36 toujours refusé** (ordre fatal → Fortify) · **NP8JEE ordre actif** (`anticollision-resim.ts`).
- Banc Jev 10 seeds : **livré §3bis** — tous critères verts.
- Push `028773d` + Deploy **SUCCESS** (run **43609956142**) + prod **200** ✓.

## 6. Pièges consignés

- Le script banc `devtmp/banc-bot-anticollision.ts` écrivait dans le fichier de la mission précédente — **AVANT 2eb4c16 sauvé au vol** dans `banc-bot-td-AVANT-d2posture.json` (mesures intactes, timestamp 07:35).
- Sableuse 228 non relancée cette passe (aucun changement côté harnais `partie.mjs` — appel 4-arg inchangé, profil par défaut) ; à relancer si le banc l'exige.
