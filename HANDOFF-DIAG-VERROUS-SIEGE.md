# HANDOFF-DIAG-VERROUS-SIEGE — Classer les 3 verrous restants de l'approche de siège (diagnostic, zéro code)

**Mission de DIAGNOSTIC — pas une livraison de fonctionnalité. Zéro modification de code, zéro re-banc LLM, lecture des journaux existants + re-simulations locales tsx.** Contexte : COLLISION-MOBILE (`2b4e386`) a restauré l'approche de siège (victoires bot ×5 : 0/1/0 → 2/2/1, plafond relâché, contact +17 %) mais le critère « ≥ ~8/difficulté » reste raté. Trois verrous candidats, non hiérarchisés : **(V1) le gate R-190 en début de guerre** (k = 2, la courbe de pression ne décolle qu'à t = 9) ; **(V2) le seuil TB-SIEGE** (effectif ≥ 4 au rayon — une armée de 3 ne peut jamais assiéger) ; **(V3) D1 qui éping des membres** en marche près de leurs propres villes. Le pilot cadrera UNE implémentation finale (avec fin de partie garantie) sur tes conclusions.

## 1. Préalables

- Docs : courbe de pression (`kEffectif` — PRESSION-CAMPAGNE), TB-SIEGE-DEFENSE (effectif d'assaut), ANTICOLLISION D1 (`planAntiCollision` — refuge/tiering), COLLISION-MOBILE (`estEnnemiMobile`), GUERRE-VIVANTE (les bots demandent la paix).
- Baseline : `2b4e386` (pushé, Deploy SUCCESS, prod 200), suites rules 1214 / server 531 / web 793 / jev-port 52. Journaux : `sableuse/bancs/joueur-*` (Jev) et traces banc bot dans `devtmp/banc-bot-td-{AVANT,APRES}-collision-mobile.json`.
- **UNE seule implémentation à la fois** — ce diagnostic est READ-ONLY, il peut tourner immédiatement.

## 2. Les trois questions (le rapport doit les répondre chiffrées)

1. **V1 — Gate tôt** : dans les guerres du banc bot qui n'aboutissent pas, combien d'attaques d'approche/assaut sont REFUSÉES par le gate avec k = 2 (guerre < 9 tours) vs k décroissant ? Une fois k ≤ 1,3 dispo, les assauts partent-ils ? (mesure : répartition des refus gate par tranche de durée de guerre, sur les journaux/traces).
2. **V2 — Effectif 4** : combien de sièges RESTENT bloqués parce que l'armée n'atteint jamais 4 réunies (3 unités produites, jamais plus — la production défensive B pivote guerrier, mais l'effectif plafonne ?) ; durée moyenne de réunion vs durée de guerre restante.
3. **V3 — D1 épinglant** : combien d'unités/membres sont retenus par le refuge D1 pendant une guerre OFFENSIVE en cours (conflit refuge vs campagne) ? Le tiering déficit > menacée ramène-t-il des assiégeants ?

**Méthode** : forensic sur les traces/journaux du banc bot 40×3 existant (les 3 difficultés sont là), re-simulations locales `tsx` ciblées (miroir `diag-d2-siege.ts`), pas de partie nouvelle, pas de banc. Chaque verrou : FRÉQUENCE (combien de guerres bloquées par LUI), CONTRIBUTION relative (le classement demandé), et **levier chiffré** (quel paramètre, quelle valeur, quel effet attendu, quel risque de rouvrir GZJQZX/piétinement).

## 3. Livrable

`DIAG-VERROUS-SIEGE.md` à la racine : le classement des 3 verrous (dominant d'abord, chiffré), pour chaque verrou le levier candidat (paramètre + valeur proposée + risque + test de verrouillage), et **une recommandation unique** (« le levier X à valeur Y ferme Z % des blocages, risque W »). Si les verrous interagissent (ex. V2 sans V1 = armée réunie mais refus gate), le dire explicitement avec l'ordre de pose. Puis arrêt, remise de la main.

## 4. Périmètre

Zéro modification de code, zéro partie, zéro banc nouveau ; scripts d'analyse en `devtmp/`. Ne jamais committer les secrets ni les fichiers personnels d'Erik.

**Pièges** : cache vitest RACINE ; re-sim via `tsx` (pas de serveur) ; Guerrier = mouvement 1 (d réels BFS) ; la durée de guerre du banc vs `dureeGuerre` moteur (warsDepuis) — ne pas confondre tour de partie et durée de guerre ; chaque analyse cite fichier:ligne.
