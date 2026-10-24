# REPORT-ANNUL-CHEMIN — Bouton « Annuler l'ordre » pour les ordres persistants

**Mission** (HANDOFF-ANNUL-CHEMIN.md, décision Erik 24/10) : une unité avec un ordre persistant d'un tour précédent (chemin gelé R-158, soin, vigilance) n'avait AUCUN moyen de l'annuler depuis le panneau unité. **Livré** : bouton d'annulation contextuel, scénario d'Erik vérifié en GUI réel.

## Changements

1. **Client — bouton contextuel (D1)** : `apps/web/src/lib/annul-ordre.ts` (nouveau) — `libelleAnnulationOrdre(unit.order)` : Move/MultiStep → « Annuler le chemin », Heal → « Annuler le soin », Sleep → « Annuler la vigilance », sinon `null`. `UnitPanel.svelte` : le bouton (même rangée, mécanisme `onCancelOrder` existant) apparaît SI ET SEULEMENT SI l'unité porte un ordre persistant (`unit.order`) ou un ordre du jour (repli générique « Annuler l'ordre »).
2. **Client — le CancelOrder PARTAIT JAMAIS pour un chemin gelé seul** : `annulationOrdre` (interaction.ts) ne considérait que `view.orders` (ordres du jour) — un chemin gelé sans ordre du jour faisait `ordreExistant=false` et `handleCancelOrder` (Game.svelte) n'envoyait rien. Étendu : `unit.order` non nul compte aussi. (Deuxième moitié du bug d'Erik, trouvée en lisant le câblage.)
3. **Serveur — Heal/Sleep (D2)** : `handleCancel` (game.ts) n'effaçait `unit.order` que pour Move/MultiStep (POLISSAGE-1 C2). Étendu aux ordres Heal/Sleep persistants : l'unité annulée redevient libre, `OrderAck` + Snapshot de rafraîchissement (la flèche/préview disparaissent immédiatement côté client). PM conservés (aucun touché).

D3 respecté (mécanisme `CancelOrder` existant, zéro nouveau message, zéro proto) ; D4 inchangé ; `schemaVersion` intouchée ; bot intouché.

## Tests (test-first)

- `apps/web/tests/annul-chemin.test.ts` (nouveau, 7 tests) : libellés (3 formes + repli), `annulationOrdre` avec chemin gelé sans ordre du jour (rouge → vert), câblage UnitPanel (grep source).
- `apps/server/tests/game.test.ts` (+1) : vigilance posée au tour précédent → `CancelOrder` → accepted + `Snapshot` avec `order` null (rouge → vert).

Suites : **serveur 166 ✓, web 700 ✓, tsc 0, svelte-check 0**. Note : `sableuse/tests/v3|v4` (bancs Jev, en pause) échouent HORS commit — vérifié par `git stash`, préexistant, hors périmètre.

## Banc GUI (L3) — `devtmp/annul-chemin-gui.mjs` PASS

Solo vs bot : clic droit 2 cases → fin de tour par l'UI → chemin gelé confirmé au dump (1 case restante) → sélection → panneau « Chemin gelé : Move » + « Annuler le chemin » (capture `avant-*`) → clic → ordre effacé côté serveur, panneau net (capture `apres-*`). Captures `dev-logs/captures-annul-chemin/`.

Pièges rencontrés (consignés) :
- **proxy Vite figé 8787** : le worker DOIT tourner sur 8787 (banc lancé avec port 8797 → la page ne voit jamais la partie).
- **case de sélection = case DESSINÉE** : une unité programmée est dessinée/sélectionnable sur sa case d'arrêt affichée, pas sa case moteur (PILE-AFFICHÉE, retour Erik 17/09) — le banc clique la position donnée par `window.__game.sondePile().positions`.
- réutilisation d'une partie d'un autre process : la page ne monte pas le canvas (participant requis) — tout le banc est en un seul process.

## 🔶 Ouverts

- Réutilisation du banc pour Heal : exigerait une unité blessée (combat) — la branche Heal/Sleep du serveur est couverte par le test Sleep (même code) et le libellé Heal par les tests client ; Heal en GUI réel non capturé.
- Le bouton n'est pas vérifié pour une unité ENNEMIE (lecture seule : le bloc est dans la branche `mine`, non atteignable) — par construction.
