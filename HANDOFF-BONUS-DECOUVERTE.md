# HANDOFF-BONUS-DECOUVERTE — Placement des bonus « premier découvreur » + Milice de bord

**Décisions Erik 07/10** (tranchés D1-D6 présentés — defaults, veto possible). Les bonus de tech ne se posent plus « dans la capitale » bêtement : navales JAMAIS sur terre, bâtiments là où ils rapportent. Nouveau : les unités navales (sauf Sous-marin) démarrent avec une Milice à bord.

## 1. Préalables

- Lire RULES.md §7a (premier découvreur — table `firstToDiscover` de `techs.json`), R-117 (naval/port), R-66 (bâtiments — `tileBonus` : Comptoir=désert +2 commerce, Atelier=colline +2 production, Marché/Remparts sans terrain), R-81 (tri déterministe), spawn GP (première adjacente libre) ; la logique actuelle d'octroi : `grantBuildingToCity` + le spawn d'unités bonus dans `turn.ts` (chercher « firstToDiscover » / `bonusUnit`).
- Baseline : suites vertes à jour, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 07/10 — non négociables)

- **D1 — Spawn naval** : « cases d'eau » = dans le rayon cultivable de la ville (miroir Port/production navale). Ordre de choix : plus grande ville (pop) ayant UNE case d'eau libre ; égalité → capitale d'abord ; sinon tirage SEEDÉ (RNG dédié, miroir R-154 — jamais Math.random). Toutes les cases d'eau occupées → spawn sur la CASE VILLE (port, R-117) ; port occupé aussi → ville suivante ; épuisée → annulé. Aucune ville avec cases d'eau → bonus annulé. Jamais une unité navale sur terre (bug actuel : Gallion en capitale intérieure).
- **D2 — Milice à bord** : tout spawn naval SAUF sous-marin (bonus `firstToDiscover`, production en ville, dotation/traits) embarque une **Milice** (type `milice`) — barbares EXCLUS 🔶. Navire coulé = Milice coule (R-117 standard) ; capture = comportement R-117 existant (consigné au rapport, non modifié).
- **D3 — Bâtiments à terrain (Comptoir=désert, Atelier=colline)** : ville au PLUS de cases du terrain dans le rayon cultivable actuel ; sinon rayon potentiel TRIBUNAL (rayon 2, même sans Tribunal construit) ; sinon jamais bénéficiaire → **pas construit** (annulé).
- **D4 — Bâtiments sans terrain (Marché, Remparts)** : ville la plus peuplée ; égalité → capitale ; sinon seedé.
- **D5 — Annulation annoncée** : bonus non accordé = entrée Chroniques nommée (« aucun port valide — X non accordé »), jamais reporté au tour suivant.
- **D6 — Inchangés** : unités terrestres bonus (capitale → adjacente), bonus d'empire (pop/science/culture/or/GP/remises), événements et labels existants (seulement la CIBLE change).

## 3. Mission

- **L1 — test-first (moteur)** : suite `bonus-decouverte.test.ts` : naval → ville côtière au tri (pop, capitale, seedé reproductible), port occupé, aucune eau (annulé + chronique), Milice à bord (bonus/production, sous-marin SANS, barbare SANS, coulage de la cargaison) ; Comptoir (déserts actuels → Tribunal potentiel → annulé), Atelier (collines, miroir), Marché/Remparts (pop/capitale/seedé) ; terrestres et empire inchangés (checksums).
- **L2 — moteur** : D1-D5 (helper partagé de choix de ville, déterministe, réutilisable) ; `grantBuildingToCity` et le spawn d'unités bonus passent par lui.
- **L3 — client** : rien à changer sauf lecture des événements si un champ additif est nécessaire (consigné ; pas de migration attendue — `schemaVersion` 27 sauf nécessité justifiée).
- **L4 — vérification GUI locale avec captures AVANT commit** : partie solo légale — Navigation (Galion en ville côtière avec Milice), Code des lois (Comptoir dans la ville désertique), annulation propre si aucun port. Captures `dev-logs/captures-bonus-decouverte/`.
- **L5** : suites vertes complètes, RULES.md (§7a — la politique de placement EST la spécification), commit, push, rapport `REPORT-BONUS-DECOUVERTE.md`.

## 4. Critères d'acceptation

1. Aucune unité navale bonus n'apparaît jamais sur terre ; Milice à bord sauf Sous-marin/barbare ;
2. Comptoir/Atelier dans la ville au meilleur bénéfice (actuel puis Tribunal-potentiel) ;
3. Annulation propre et annoncée ; déterminisme total (même seed ⇒ mêmes choix) ;
4. Suites et bancs verts.

## 5. Périmètre interdit

Les valeurs des bonus (montants, coûts) ; le canal GP (monarchie/invention) ; la production normale d'unités navales en ville (R-117 côtière — seul le SPAWN BONUS change, la production existante est déjà correcte) ; tout le 3D ; `schemaVersion` sauf nécessité.

## 6. Fin de session

Rapport (décisions de détail, 🔶 barbares/capture), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
