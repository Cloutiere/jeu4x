# HANDOFF-ARMEE-STRENGTH — R-31 enfin branchée : une armée attaque et défend à ×3 (canon confirmé A ET D)

**Statut : prêt — NON LANCÉ — PRIORITÉ HAUTE.** Canon confirmé par Erik (09/11) : **A et D = somme des membres (×3 pour 3 même type), les deux côtés.** Le bogue capturé en prod (partie BJ5VC5, tour 26 — dump `devtmp/etat-BJ5VC5/`) : l'armée u31 (7 PV) a attaqué le gardien barbare fortifié (colline +50 % T-02, fortification +10 % T-17, force défensive 1,6) **à force 1 au lieu de 3** — 7 rounds sans jamais toucher, mort ; le gardien intact 3/3. À force 3, la probabilité de toucher montait à 78 %/assaut : victoire quasi certaine. **Aujourd'hui, former une armée affaiblit** — elle est un sac à PV qui frappe comme une seule unité.

## 0. Préalables

1. `RULES.md` §3.2/R-31 (« Statistiques : A et D = somme des membres — 3 Guerriers → A3 D3 ») ; le bogue : `packages/rules/src/turn.ts` `processFormArmy` (l'armée formée ne porte PAS de A/D sommés) et `combatStrengthsOf` (lit `unitType(type).attack/defense` — SANS multiplicateur `isArmy` nulle part) ; le helper correct non branché : `packages/rules/src/army.ts` (`formArmy` calcule A/D = somme — utilisé ailleurs, pas par le chemin de combat) ;
2. ⚠ Les armées des IA aussi : les « fusion trios » de botPolicy et les propositions de Jev émettent de vrais `FormArmy` → mêmes unités moteur → **le bogue frappe tout le monde** ; le fix les renforce tous ;
3. ⚠ Attention au changement récent ORACLE-VERDICT (`c2a8c34`) : les jets de combat mêlée sont désormais le **dérivé par hash** — ce fix ne touche PAS aux jets (seulement aux FORCES) ; mais les issues des tests de combat impliquant des armées vont ENCORE changer (forces ×3) → re-verrouillage à nouveau, un par un, assertions strictes.
4. Discipline : tests FIRST, bancs bot 40×3 AVANT/APRÈS (re-baseline — les armées des bots deviennent réelles, expect des écarts), banc Jev UNIQUE ≤ 0,40 $ si drift notable (sinon reporté, consigné), sonde crédits, jev-port via config dédiée, suites complètes avant push.

## 1. Décisions de tranche (votées — ne rien étendre)

- **D1 — La force canon** : dans `combatStrengthsOf`, pour une unité `isArmy` : `sAttBase` et `sDefBase` = base du type **× ARMY_SIZE** (×3). Le canon R-31 dit « somme » ; pour 3 unités du même type — seul cas d'armée existant — somme = base × 3 (le type est unique dans une armée, canon « 3 unités du même type »). Les traits nationaux (R-149, par type) et les bonus par type s'appliquent à la base AVANT ×3 ? NON — tranché : **le ×3 s'applique à la BASE du type, puis les traits/bonus de type s'ajoutent (ou se multiplient) comme pour une unité** — l'armée de 3 samouraïs gagne 3× le bonus samouraï. Le détail de combat (`CombatForceDetail`) affiche un mod nommé **« Armée ×3 (R-31) »** — le décodeur de combat l'expliquera (vérifier que le décodeur d'affichage gère un nouveau mod : consigné si oui).
- **D2 — La vétérance** : déjà portée par l'armée à la formation (`veteran` = ≥ 2 membres vétérans, R-31 🔶) — `effectiveStrength(base, veteran)` continue de s'appliquer après le ×3 (l'armée vétéran = base ×3 ×1,5). Vérifier le test d'un cas vétéran.
- **D3 — La défense** : ×3 aussi (confirmé Erik). Les bonus défensifs (terrain T-02, fortification T-17, palais/remparts) s'appliquent en % APRÈS le ×3 (ordre canon existant des bonus) — une armée fortifiée sur colline défend à 3 × 1,6 = 4,8. Consigné : les armées deviennent de vrais murs — c'est CivRev.
- **D4 — Intouchés** : les PV (déjà ×3 canon), les PM (= type), la vétérance à la formation, les tirs R-59, le dérivé de jets ORACLE-VERDICT, le soin, gainSite, Zii, `schemaVersion` 28. Le décodeur de combat (client) : vérifier l'affichage du nouveau mod — AFFICHAGE seulement si besoin.

## 2. Mission L0→L4

- **L0** : préalables, sonde crédits, suites vertes (rules 1146, server 443, web 793, jev-port 40).
- **L1 — Tests FIRST (moteur)** : armée de 3 guerriers attaque à force 3 (détail : mod « Armée ×3 (R-31) ») et défend à 3 (+ bonus % après) ; armée vétéran ×1,5 après ×3 ; traits par type ×3 (3 samouraïs) ; LE CAS BJ5VC5 reconstitué : armée 7 PV force 3 vs gardien 1,6 → victoire quasi certaine (assertion sur la force, PAS sur le résultat du dé — le dérivé décide) ; unité simple INCHANGÉE (force 1, zéro mod armée) ; barbares sans armée inchangés ; re-verrouillage des tests de combat impliquant des armées (consigné un par un).
- **L2 — Client** : le décodeur de combat affiche le mod « Armée ×3 (R-31) » proprement (AFFICHAGE seulement) ; captures du détail de combat avant commit.
- **L3 — Bancs** : bot 40×3 AVANT/APRÈS (les armées des bots deviennent réelles — percée/captures attendues en hausse ; zéro collapse) ; banc Jev UNIQUE ≤ 0,40 $ SEULEMENT si drift notable (les armées de Jev se renforcent — la conduite de guerre s'en trouve changée, consigné).
- **L4 — Suites complètes** (rules, server, jev-port, sableuse, web, svelte-check, typechecks), commit + push, vérifier Deploy, rapport `REPORT-ARMEE-STRENGTH.md` (le bogue, le fix, les tableaux, la force avant/après du cas BJ5VC5).

## 3. Critères d'acceptation

1. Armée de 3 même type : attaque et défense à base ×3 (mod nommé au détail de combat) ; vétéran ×1,5 après ; unité simple inchangée ;
2. Le cas BJ5VC5 reconstitué : force 3, victoire au dérivé ;
3. Bancs bot sans collapse, armées des IA actives ; suites vertes ; `schemaVersion` 28 ; Deploy vérifié.

## 4. Périmètre interdit

Les PV, les PM, la vétérance à la formation, le dérivé de jets, les tirs R-59, la formation FormArmy (elle existe), le client hors décodeur ; Zii ; jamais de secret ni de fichier non tracké d'Erik ; pas de banc hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : les armées valent enfin trois hommes — le triangle armée est complet ET honnête.
