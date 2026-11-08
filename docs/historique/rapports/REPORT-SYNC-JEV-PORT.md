# REPORT-SYNC-JEV-PORT — Resynchronisation de la copie serveur du harnais v4

**29/10/2026 — mission exécutée.** Résolution de l'entrelacement JEV-CONTACT-GUERRE (`42246c5`, harnais v4) × CHAT-SOCLE (`17c467b`, copie serveur v3).

## Ce qui était cassé

Les 4 tests croisés de `apps/server/tests-jev/jev-port.test.ts` échouaient parce que la copie serveur (`apps/server/src/jev/`) était restée au niveau v3 :

1. `questions-joueur.json` (copie) sans `delaiGuerreApresRencontre: 10` ni le commentaire de seuils v4.
2. `condenseJoueur` : bloc diplomatie sans `rencontreTour`, `toursDepuisRencontre`, `provocations` par rival.
3. `construireQuestionsJoueur` : question guerre émise sans la porte de délai de coexistence ni l'arc relationnel dans les critères.
4. `tourJevJoueur` : pas de mise à jour de l'état de rencontre avant le condensé.

## Corrections (port mécanique, zéro retouche de sémantique — D1 respecté)

`apps/server/src/jev/joueur.ts` aligné EXACT sur `sableuse/src/joueur.mjs` v4 :

- `majRencontres(etatFiltre, moi, memo)` portée (rencontres par vision fog, barbares exclus, première vue tient).
- `provocationsDe` (unités hostiles du rival à rayon ≤ 5 de nos villes, miroir RAYON_MENACE).
- `blocDiplomatie(etatFiltre, moi, memo)` et `condenseJoueur(..., memo)` : arc de la relation par rival.
- Question guerre : filtrée sur `rencontreTour != null && (tour - rencontreTour) >= delaiGuerreApresRencontre`, critères enrichis (relation + provocations).
- `tourJevJoueur` : `majRencontres` AVANT le condensé.
- Copie `sableuse/questions-joueur.json` → `apps/server/src/jev/questions-joueur.json` (copie bit à bit).

Le memo du port reste plain (arrays ⇔ Set du harnais via memoHas/memoAdd) — inchangé.

## Vérifications (L2)

- `tests-jev/jev-port.test.ts` : **20/20 verts** (les 4 croisés inclus).
- Suite server complète : **344/344** (vitest + jev).
- Suite sableuse : **80/80**.
- Typecheck 4/4 : rules, shared, server (`tsc --noEmit`), web (`svelte-check` 0 erreur).

## Leçon d'entrelacement (à retenir)

> Deux sessions parallèles sur des territoires joints par des tests croisés (ici harnais sableuse ⇄ port serveur `jev-port`) doivent **REJOUER la suite serveur COMPLÈTE — tests croisés compris — avant tout push**, même si leur propre suite est verte. La suite croisée est la seule qui détecte qu'un des deux côtés de la jonction a bougé sous vos pieds.

## Périmètre respecté

Aucune sémantique v4 ou chat touchée, aucun calibrage, `schemaVersion` intact.
