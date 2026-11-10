# REPORT-ARMEE-STRENGTH — R-31 branchée au combat : une armée frappe à ×3

**Statut : livrée, NON ENCORE ACCEPTÉE (CI/Deploy à vérifier après push).** Canon Erik (09/11) : **A et D = somme des membres (×3), les deux côtés.**

## 1. Le bogue

Le bogue capturé en prod (BJ5VC5 t26, dump `devtmp/etat-BJ5VC5/`) : l'armée u31 (7 PV) attaquait le gardien barbare fortifié (colline +50 % T-02 + fortification +10 % T-17 = défense 1,6) **à force 1** — 7 rounds sans jamais toucher, morte ; le gardien intact. Cause : `combatStrengthsOf` (`packages/rules/src/turn.ts`) lisait `unitType(type).attack/defense` SANS jamais considérer `isArmy` ; le helper `army.ts formArmy` (A/D sommés) n'était branché que sur la formation, pas sur le chemin de combat. **Former une armée affaiblissait** : un sac à PV qui frappait comme une seule unité. Le bogue frappait aussi les armées des IA (botPolicy/Jev émettent de vrais `FormArmy`).

## 2. Le fix (`packages/rules/src/turn.ts`, D1-D4 du handoff)

- **`combatStrengthsOf` — attaque** : base du type **× ARMY_SIZE (3)**, traits nationaux R-149 inclus (3 samouraïs = (4+1)×3 = 15) ; vétéran ×1,5 APRÈS le ×3 (`effectiveStrength` inchangée, multiplicatif) ; soutien naval/merveilles/régime inchangés (effets d'empire, non multipliés).
- **`combatStrengthsOf` — défense** : ×3 sur la base (défense si stabilisée R-174, sinon attaque), traits inclus ; bonus % (terrain T-02, fortification T-17, bâtiments) APRÈS le ×3 — l'ordre canon existant de `effectiveStrength` le fait naturellement : armée fortifiée sur colline = **3 × 1,6 = 4,8**.
- **`combatStrengthsOf` — écrasement (R-149)** : `sAttBase` sort multiplié → une armée écrase selon sa vraie force.
- **Mêlée pondérée (Phase E, R-180)** : l'eff d'une armée co-localisée est aussi ×3 (même bogue, même canon « les deux côtés ») ; `MeleeDetail.participants[].base` porté ×3 (le struct n'a pas de liste de mods — consigné).
- **Détail de combat** : mod nommé **« Armée ×3 (R-31) »** dans `modsBase` (valeur = base × (3−1), l'addition base+mods reste exacte) — le client `RapportCombat.svelte` l'affiche déjà génériquement (`+2 Armée ×3 (R-31)` via `modLigne`), **aucune modification client requise** (L2 : AFFICHAGE seulement, et il marchait déjà — consigné).
- **Intouchés (D4)** : PV (déjà ×3 canon), PM, vétérance à la formation, tirs R-59, dérivé de jets ORACLE-VERDICT, soin, gainSite, Zii, `schemaVersion` 28.

## 3. Tests FIRST (`packages/rules/tests/armee-strength.test.ts`, 8 nouveaux)

1. Armée de 3 guerriers attaque à force 3, mod « Armée ×3 (R-31) » présent (rouge avant fix : force 1) ;
2. Armée défend à 3, fortifiée = 3,3 (bonus % après ×3) ;
3. Armée sur colline fortifiée = 4,8 ;
4. Armée vétéran = 4,5 (×1,5 après ×3) ;
5. Trait national ×3 : 3 Chevaliers Samouraïs (Japon, médiévale) = 15, trait listé à ×3 ;
6. **Cas BJ5VC5 reconstitué** : armée 7 PV force **3** vs gardien 1,6 → p(premier assaut) = **0,782** (avant fix : 0,236) — assertion sur la force et p, jamais sur l'issue du dé (le dérivé décide) ;
7. Unité simple inchangée : force 1, zéro mod armée ;
8. Formation `FormArmy` intacte (fusion, PV 9, `isArmy: true`).

## 4. Re-verrouillage

- **rules : 1154/1154** (1146 + 8) — les tests de combat impliquant des armées (cohabitation-hostile cas Erik 5633Y3, oracle-verdict u31, engagement) sont tous restés verts SANS relâchement : leurs assertions étaient structurelles (un mort, survivant seul, prédiction==réalité) ou calées sur le dérivé, non sur les forces. **Aucune assertion changée.**
- serveur **443/443**, web **793/793** + svelte-check 0 erreur, jev-port **40/40**, sableuse **228/228**, tsc rules/server propres.

## 5. Banc bot 40×3 AVANT/APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-armee-strength.json`)

| Difficulté | Villes A→A' | Pop A→A' | Unités A→A' | Trésorerie A→A' | Tours A→A' |
|---|---|---|---|---|---|
| facile | 1,875 → 1,875 | 16,65 → 16,65 | 89,2 → 89,2 | 1115,9 → 1115,9 | 128,7 → 128,7 |
| normal | 1,925 → 1,95 | 14,275 → 14,325 | 79,4 → 78,8 | 889,7 → 861,1 | 123,0 → 121,1 |
| difficile | 1,80 → 1,80 | 11,75 → 11,775 | 72,75 → 72,725 | 563,7 → 566,3 | 125,8 → 125,8 |

**Zéro collapse, drift non notable** : en 150 tours bot-vs-bot les armées formées sont trop rares pour déplacer les moyennes. → **Banc Jev REPORTÉ** (conforme handoff L3 : « SEULEMENT si drift notable ») — consigné : la conduite de guerre de Jev (qui forme de vraies armées) est le banc qui révélera l'effet, au prochain banc naturel.

## 6. Écarts consignés

1. **Capture GUI du détail de combat non produite** : `RapportCombat.svelte` affiche déjà tout mod de `modsBase` génériquement (couvert par les tests web), aucune modif client — la capture d'un combat d'armée en GUI réel est à l'œil d'Erik en prod ;
2. Mêlée pondérée : le mod « Armée ×3 » n'y est PAS décomposé nommément (`MeleeDetail` n'a pas de `modsBase`) — le poids ×3 est correct, la base affichée est ×3 ;
3. Banc Jev reporté (voir §5) ;
4. ⚠ **CI/Deploy prod à vérifier** après push (comme ORACLE-VERDICT avant lui).

## 7. Verdict

Les armées valent enfin trois hommes — attaque ET défense, vétéran et fortification compris. Le triangle armée est complet ET honnête.
