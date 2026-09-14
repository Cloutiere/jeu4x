# REPORT-CIV-CAPITALE-FONDEE — Les bonus de civ au niveau de la capitale s'appliquent à la FONDATION

Mission du handoff `HANDOFF-CIV-CAPITALE-FONDEE.md` (constat d'Erik du 14/09 : la Grèce qui fonde sa
capitale au Colon n'avait pas son Tribunal). **Terminée — suite verte, typecheck 4/4, GUI vérifiée.**

## M1 — Audit des bonus capital-dépendants

Source : `map.ts` §setup (R-150), lignes ~572-660. Tableau complet bonus × chemin de création :

| # | Bonus (civs) | Nature | Préfabriquée (setup) | Fondée (R-64, avant correctif) |
|---|---|---|---|---|
| 1 | Techs gratuites (Grèce Démocratie, Arabie Religion, Chine Écriture, Rome Code des lois…) | joueur | ✅ appliqué | ✅ appliqué (niveau joueur — non concerné) |
| 2 | Gouvernement de départ (Rome République, Arabie Fondamentalisme) | joueur | ✅ | ✅ (non concerné) |
| 3 | **Bâtiments gratuits** (Grèce Tribunal, France Cathédrale) | **capitale** | ✅ (`civStartBuildings`) | ❌ **MANQUANT** |
| 4 | **Merveille Antique Égypte** (tirage seedé `egyptWonderRng` × `egypteWonderChoices`) | **capitale** | ✅ | ❌ **MANQUANT** |
| 5 | **GP gratuit Amérique** (posé sur la capitale, classe rotation index 0) | **capitale** | ✅ | ❌ **MANQUANT** |
| 6 | Or de départ Aztèques (+25) | joueur | ✅ | ✅ (non concerné) |
| 7 | Révélation de carte Russie (rayon 5) | joueur (ancre capitale **ou site du Colon** — `capital ?? spawn.capital`) | ✅ | ✅ (ancrée au site du Colon au setup) |
| 8 | Ère de départ (compage T-36, techs gratuites comptées) | joueur | ✅ | ✅ (non concerné) |

Conclusion : exactement les trois bonus du bloc « si capitale » (3, 4, 5) manquaient à la fondation.
Aucun autre traitement capital-dépendant (pas de dégagement de rayon au setup).

## M2 — Correctif

- **Nouveau module `packages/rules/src/civStartBonus.ts`** : `applyCapitalStartBonuses(st, playerId, city, opts)` —
  source UNIQUE des trois bonus capital-dépendants, avec garde `includes` (idempotent) et garde `city.capital`.
  Il porte aussi `EGYPT_WONDER_SEED_SALT` (valeur historique inchangée `0x2a7f3b91`).
- **`processFoundCity` (turn.ts, R-64)** : après l'émission de `CityFounded`, une capitale fondée reçoit
  les mêmes bonus que le setup (miroir commenté).
- **`map.ts` §setup** : le bloc « bâtiments + merveille + GP » est remplacé par l'appel au même helper
  (RNG Égypte partagé passé en option — ordre des spawns inchangé). Comportement préfabriqué identique,
  zéro diff attendue sur les cartes existantes.
- **Déterminisme** : à la fondation, un RNG frais `rngSeed ^ salt` rend le PREMIER élément du flux salé —
  même seed ⇒ même merveille ; le RNG de résolution n'est PAS consommé (miroir artefacts R-151).
  Cas documenté : si la carte porte une Égypte préfabriquée ET qu'une Égypte fonde, les deux tirent le
  même élément du flux (accepté, documenté dans l'en-tête du module).
- **Journal pédagogique** (fondation uniquement — le setup n'émet rien) : `BuildingCompleted` par bâtiment
  offert, `WonderCompleted` pour la merveille **sans** jalon culturel R-131 (la préfabriquée n'en reçoit
  pas non plus — la fondation ne doit pas être plus forte), `GreatPersonSpawned` pour le GP Amérique.
- **Invariant anti-double application** : une capitale préfabriquée ne repasse jamais par `processFoundCity`
  comme fondation ; la garde `includes` du helper protège de plus tout re-traitement. Une partie où le
  joueur fonde sa capitale au tour 1 reçoit tout exactement une fois (testé).
- **Bot** : le choix de civ seedé du bot passe par le même `resolveTurn` → même chemin (testé avec p2).
- Périmètre interdit respecté : aucun changement aux autres traits, à R-111, à l'équilibrage, au 3D, ni
  dans `assets-src`. `schemaVersion` inchangée (**23**, aucune migration).

## M3 — Vérification

- **Tests (test-first)** : 7 nouveaux tests dans `packages/rules/tests/phase7n.test.ts`
  (`CIV-CAPITALE-FONDEE`) — Grèce→Tribunal (+ journal), France→Cathédrale, Égypte→merveille au tirage
  (même seed = même merveille), Amérique→GP (même classe que le setup), neutre→rien, invariant
  anti-double (seconde ville non capitale + préfabriquée inchangée), bot p2 couvert. Rédigés AVANT le
  moteur, échec confirmé, puis verts.
- **Suite** : 812 (rules, dont 7 nouveaux) + 75 (server) + 254 (web) = **1141 tests verts**
  (baseline 1134 + 7). `pnpm typecheck` **4/4**.
- **e2e moteur** (`tests/e2e.test.ts`) : vert dans la suite.
- **GUI partie solo Grèce** (partie 9ZDK6N, vs bot Inde) : fondation au tour 1 → journal
  « Ville c1 fondée en (3,8) — capitale ! » puis « tribunal achevé dans c1 » ; panneau ville :
  **Palais + Tribunal** dans Bâtiments ; le trait d'ère Médiévale `gpFrequents` n'est pas touché
  (aucune modification des traits). Captures dans `dev-logs/captures-civ-capitale/` :
  - `grece-fondation-tour1-journal.png` (carte + journal)
  - `grece-capitale-panneau.png` (panneau de la capitale avec Tribunal)

## Ouverts / notes

- Le libellé du journal affiche l'id interne (« tribunal achevé dans c1 ») — convention journal existante,
  non modifiée (le client le met en forme avec les noms affichés).
- Pas de mise à jour RULES.md demandée par le handoff ; une phrase dans R-64 (« la capitale fondée reçoit
  les bonus capital-dépendants R-150 ») peut être ajoutée sur demande d'Erik.
- Serveurs de dev arrêtés après vérification ; atelier icônes (`assets-src`) non touché.

**Aucun commit/push** — remise de la main (validation locale + captures faites AVANT tout commit).
