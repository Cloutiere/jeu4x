# HANDOFF-GESTE-ARMEE — Le geste joueur : former une armée de 3 unités depuis l'UI

**Statut : prêt — NON LANCÉ.** Constat vérifié (04/11) : la fusion d'armées existe au **moteur** (R-44 / `packages/rules/src/army.ts` : 3 unités du même type, ordre `FormArmy {members:[3], rally:{q,r}}`, fusion à la résolution si les 3 atteignent le rendez-vous, armée DÉFINITIVE, vétéran si ≥ 2 membres, PV = somme plafonnée 3×max) et les **bots l'utilisent** (fusion trios BOT-ARMEE) — mais **aucune UI ne crée l'ordre** : le joueur ne peut pas former d'armée. Mission : brancher le geste CivRev.

## 0. Préalables

1. `RULES.md` §3 (armées : formation, rendez-vous, définitive, vétéran) + `packages/rules/src/army.ts` (le contrat exact) + `packages/rules/src/turn.ts` R-44 (co-location transitoire des membres, échec propre si rendez-vous manqué) ;
2. Client : `apps/web/src/components/UnitPanel.svelte` (le panneau d'unité qui affiche déjà les ordres — y compris `FormArmy` en lecture), `apps/web/src/lib/gameClient.ts` (envoi d'ordres, dédoublonnage FormArmy déjà écrit l.136 — le canal existe), `apps/web/src/lib/render/interaction.ts` (sélection/clics de cases — le même mécanisme que les chemins d'unité et le placement de fondation) ;
3. **Garde d'or** : zéro changement moteur/serveur — `FormArmy` existe et est validé côté serveur ; si un test serveur manque sur l'échec propre (rendez-vous non atteint), le consigner, NE PAS le coder ici (moteur interdit).
4. Discipline : captures locales navigateur 1280×720 AVANT commit ; suites web + svelte-check ; le geste doit marcher dans une partie solo vs bots (c'est là qu'il sera joué).

## 1. Décisions de tranche (défauts tranchés — veto Erik possible)

- **D1 — Le geste en 3 temps depuis le panneau d'unité** :
  1. **Bouton « ⚔ Former une armée »** dans `UnitPanel.svelte`, visible SI : unité sélectionnée est terrestre non-navire, PAS déjà membre d'un FormArmy en cours, et il existe **≥ 2 autres unités du même type** amies praticables (chemin terrestre existant — le BFS client existant) ;
  2. **Sélection des 2 coéquipiers** : les candidats s'affichent (liste cliquable dans le panneau, ou clic sur les unités candidates — même interaction que la sélection existante ; candidates surlignées comme les cases de chemin). J'en choisis 2 (les mêmes-type seulement ; une unité déjà membre d'un autre FormArmy est exclue) ;
  3. **Pose du rendez-vous** : un clic sur une case praticable par les TROIS (le client pré-vérifie le chemin ; le serveur tranche — refus propre si impossible, `OrderAck` erreur lisible). Confirmation : `gameClient.formArmy(uA, uB, uC, rally)` → message canon.
- **D2 — Le suivi de la fusion est visible** : après envoi, chaque membre montre son ordre « Formation d'armée — en route vers le rendez-vous (n/3) » (le panneau le fait déjà côté affichage : brancher le compteur sur les membres atteignant `rally`) ; à la résolution, la fusion produit l'armée — événement canon existant (Chroniques) ; si échec (un membre mort ou bloqué), les survivants gardent leurs positions (comportement moteur R-44 inchangé) et une chronique le dit.
- **D3 — Armée définitive côté UI** : l'armée formée se joue comme une entité (sélection, ordres, panneau) — vérifier que le client la traite comme une unité (si un cas `isArmy` manque au panneau, le consigner et corriger côté AFFICHAGE seulement) ; aucun bouton de scission (canon : définitive).
- **D4 — Intouchés** : moteur, serveur (sauf si un test serveur du refus propre manque → consigné, pas codé), bots, Jev, `schemaVersion` 28. Les navires : les flottes navales ont leur propre mécanisme d'embarquement — PAS de fusion navale dans cette mission (au backlog si tu la veux).

## 2. Mission L0→L2

- **L0** : suites web 724 + svelte-check verts ; partie solo vs bots locale.
- **L1 — Tests FIRST (web)** : bouton visible/absent selon les conditions (même type ×3, praticable, non-membre) ; sélection des 2 candidats (exclusion des non-compatibles, des membres d'un autre FormArmy) ; pose du rendez-vous (case praticable par les trois — pré-vérification ; refus propre sur case invalide) ; envoi canon `FormArmy` ; compteur n/3 ; D3 affichage armée formée ; zéro régression des autres gestes (chemin, fondation, ordres F/H/S/Z/B).
- **L2 — Captures GUI locales AVANT commit** (le geste complet : bouton → sélection → rendez-vous → fusion à la résolution → armée jouée) + suites complètes web/svelte-check + commit/push + rapport `REPORT-GESTE-ARMEE.md`.

## 3. Critères d'acceptation

1. Erik forme une armée en solo vs bots en ≤ 4 clics (bouton → 2 candidats → rendez-vous) ;
2. La fusion se produit à la résolution quand les 3 arrivent ; l'armée est jouable et définitive ;
3. Échec propre si le rendez-vous n'est pas atteint (chronique, pas de panne) ;
4. Suites web/svelte-check vertes ; `schemaVersion` 28 ; zéro changement moteur/serveur.

## 4. Périmètre interdit

Moteur et serveur (le contrat FormArmy existe) ; fusion navale (backlog) ; les mécaniques d'armée des bots/Jev ; Zii ; jamais de fichier non tracké d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : Erik joue avec les armées comme au CivRev — et le triangle joueur/IA est complet.
