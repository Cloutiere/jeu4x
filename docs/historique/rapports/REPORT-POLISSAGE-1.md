# REPORT-POLISSAGE-1 — Socle de capitale, flèche d'annulation, rééquilibrage barbares

Exécution de [`HANDOFF-POLISSAGE-1.md`](../../../HANDOFF-POLISSAGE-1.md) — trois signalements d'Erik du 07/09. **Livré le 07/09.**

## Résultats

| | |
|---|---|
| Tests | **980 verts** (moteur 750 · web 158 · serveur 72 — baseline 974, +6 nets) |
| Typecheck | **4/4** (rules, shared, server, web) |
| `schemaVersion` | **19 inchangée** — aucune des trois corrections ne touche aux données persistées (confirmé : C3 ne touche que des constantes de génération, pas d'états) |
| e2e bot-solo | Vert (`apps/server/tests/solo.test.ts` + `botPolicy.test.ts`) |

## C1 — La case de capitale produit 1 bus / 1 cpu / 1 ram ✅

- `terrain.json` §`ville` : yields **2/1/1 → 1/1/1** (décision Erik). Le plancher R-66 (`growth.json` `cityCenter.floor` 1/1/1) **reste en place**, redondant, comme garantie des cas futurs (cratère…).
- Miroir 3D vérifié : `render3d/rendement.ts` appelle le `tileYield` du moteur directement — la lueur suit automatiquement, zéro code.
- RULES.md §2 (table des terrains) et `packages/rules/README.md` réalignés.
- **Effet de bord démographique, mesuré et assumé** (conséquence attendue de la décision d'Erik, aucun rééquilibrage caché) — 12 tests moteurs réalignés :
  - surplus de début de partie réduit (centre 1 N au lieu de 2) : la croissance des premières tours ralentit (ex. scénario économique e2e : pop 3 atteinte au tour 20 au lieu du tour 10) ;
  - « pompe à colons » République : repousse en ≤ 5 tours au lieu de 3 (test adapté) ;
  -Aqueduc (7e) et Zoulous (7n) : réserves de départ des tests recalées pour isoler le comportement testé (seuil ÷2, −⅓) du nouveau rendement du centre ;
  - test « Égypte dépasse le socle » : le centre ville donne désormais pile le socle (1 N) — le test vérifie toujours que le plancher ne plafonne pas (trait Égypte sur désert inchangé).
  - Impact gameplay positif non couvert par les tests : à 1 N le centre-ville seul (pop 1, sans case travaillée) est à l'équilibre (1 récolte − 1 consommé = 0) au lieu de +2/tour.

## C2 — Annuler un ordre efface flèche, fantôme et chemin gelé ✅

**Cause racine** : l'`OrderAck` d'annulation du serveur ne portait aucune identification (`order: null`, pas d'unité) — le réducteur client `reduceView` ne retirait donc jamais le brouillon de `view.orders`, et `previewPrograms` (R-160) continuait de dessiner flèche + fantôme. Le **chemin gelé** (`unit.order`), lui, n'était pas du tout annulable : le serveur ne filtrait que les brouillons.

Correctif (serveur autoritaire, protocole additif — pas de changement de version) :
- `OrderAck` (packages/shared) : nouveaux champs optionnels `cancelledUnitId` / `cancelledCityId` remplis par `handleCancel` ;
- `handleCancel` (GameDO) : efface **aussi le chemin gelé** (Move/MultiStep restant sur l'unité) et renvoie un **Snapshot de rafraîchissement** au demandeur (miroir du renvoi immédiat de SetResearch) ;
- `reduceView` + nouvelle fonction pure `removeCancelledOrders` (client) : purge immédiate des brouillons de l'unité/ville annulée (membres de `FormArmy` compris) — `previewPrograms` ne voit plus l'ordre annulé, en 2D comme en 3D (source unique R-160).

Tests : 6 tests web purs sur l'état de l'aperçu après annulation (`gameClient.test.ts` — purge, ciblage, re-programmation D3 en fin de file, refus inchangé) + 2 e2e serveur (`game.test.ts` — brouillon annulé, chemin gelé effacé de l'état avec Snapshot). Le cas « re-programmer remplace » (D3, priorité conservée) reste couvert et vert.

## C3 — Rééquilibrage des barbares ✅ (data-driven, RULES mis à jour)

`barbares.json` (zéro durcissement dans le code) :
| Clé | Avant | Après |
|---|---|---|
| `spawnInterval` (T-18) | 3 | **10** |
| `aggroRadius` (T-19) | 6 | **2** |
| `capPerVillage` (T-22) | 2 | **3** |
| `gardeMinimale` (**T-49**, nouvelle) | — | **1** |
| `initialUnits` (**T-50**, nouvelle) | — | **1** |

- **Dotation initiale (T-50)** : 1 barbare dans chaque camp au début de la partie — posé par `spawnInitialGarrisons` (pure, dans `barbares.ts`) appelé par `applyMapEntities` (cartes préfabriquées ET procédurales) et par les fixtures (`makeState`), inscrit dans `spawnedUnits` (compte pour le cap et la garde). Pas d'événement (hors résolution).
- **Garde minimale (T-49)** dans `barbarianOrders` : chaque unité est rattachée à son village d'origine ; une unité **au camp** (distance ≤ 1) ne sort pas si la garde passerait sous `gardeMinimale`. Avec cap 3 / garde 1, **au plus 2 barbares sortent simultanément — verrouillé par deux tests** (géométrie d'ordres + invariant de longue campagne).
- **Escalade inchangée** (archer après tour 15 — seul le rythme change) ; la dotation initiale reste du type initial (testé).
- RULES.md §7.9 : R-96 (dotation + nouveau rythme), R-97 (aggro 2, garde T-49 et interprétation), R-99 (nouvelles clés) mis à jour ; `constants.ts` ré-exporte `BARBARIAN_GARDE_MINIMALE` / `BARBARIAN_INITIAL_UNITS`.
- Tests 7d réécrits au nouveau rythme (premier réengendrement tour 10, cap 3, hors cycle tours 1-9, anti-triche, sous les yeux d'un joueur) ; **scénario e2e seedé complet** (village → attaque → hutte → destruction + or → rasement c2 → capitale rasée → défaite) rejoué au nouveau cadrage avec des compteurs de village décalés pour préserver le déterminisme.
- Serveur : tests dumps (compteurs, dotations, état migré v7 enrichi) réalignés ; lobby/procedural (comptage d'unités avec dotations) adaptés.
- **e2e bot-solo vert** : le bot chasse les villages, la partie solo se joue et se résout normalement au nouveau rythme.

## Interprétations 🔶 et doutes signalés (périmètre non débordé)

1. **C3 — définition du « camp »** : distance ≤ 1 du village d'origine (le village + ses 6 cases d'engendrement). La garde contraint les **sorties**, pas le **combat défensif** : une unité au camp attaque toujours un ennemi adjacent (sinon le camp se ferait tuer sans riposter). Documentée dans RULES R-97 et dans le code.
2. **C3 — dotation `initialUnits`** : nouvelle clé ajoutée à `barbares.json` (valeur 1) pour rester data-driven ; le handoff la décrivait sans la nommer.
3. **C3 — garde et unités orphelines** : une unité barbare dont le village d'origine a été détruit n'est plus soumise à la garde (elle n'a plus de camp à tenir).
4. **C2 — champ « verrouillé »** : l'OrderAck d'annulation refusée (« aucun ordre à annuler ») laisse la vue inchangée (testé).
5. **C1 — observation** : les parties en cours sur la prod recalcurent leur économie au prochain tour résolu (le rendement est lu des données à chaque résolution, aucune migration) — cohérent avec l'absence de changement de `schemaVersion`.

## Reste à vérifier en ligne par Erik

- Case de capitale : 1 bus / 1 cpu / 1 ram affichés (menu de ville + lueur 3D).
- Annulation d'ordre : flèche/fantôme disparaissent immédiatement (2D et 3D), y compris sur une unité à chemin gelé (flèche pointillée jaune).
- Rythme barbares en partie : 1 barbare par camp au démarrage, sorties limitées au voisinage (2 cases), jamais plus de 2 sortis, camp qui se repeuple lentement.
- Reprise d'une partie existante : aucun incident (aucune migration).

*Session arrêtée — remise de la main. Commit/push sur la demande explicite d'Erik uniquement.*
