# REPORT-CIVS-NEUTRES-LOBBY — la neutre (« Sans civilisation ») sélectionnable au lobby

**Livrée 08/11.** Handoff exécuté intégralement (L0→L2), zéroffet sur les défauts : les parties normales restent exactement comme avant.

## Ce qui a été fait

1. **`@game/rules`** — nouveau helper PUR `estCivSelectionnable(civId)` : vrai pour la neutre (R-147) et les 16 canon, faux sinon. Source unique de validation, partagée par le shared et le serveur (pas de duplication — D1).
2. **`packages/shared/config.ts`** — le validateur `configPartieErreur` accepte `civId: 'neutre'` et **plusieurs sièges peuvent la PORTER** (le duel miroir neutre vs neutre est précisément le partage d'une absence de choix) ; les autres civs restent uniques entre sièges.
3. **`apps/server/lobby.ts`** — les 3 validations (civ de l'hôte, civ du bot/Jev, civ de jointure) passent par le helper ; à la jointure, la neutre n'est pas marquée « prise » (plusieurs humains sans civ).
4. **`apps/server/game.ts`** — 🔧 **dépassement de cadrage justifié** : le GameDO évinçait silencieusement `civId: 'neutre'` (3 filtres `CIVILIZATIONS.civs[...]`) — le choix explicite n'aurait jamais atteint la meta (les captures et le test e2e l'ont prouvé : `civId` rendu `undefined`). Les 3 filtres utilisent le helper ; la neutre explicite persiste et s'affiche (« Sans civilisation » à l'attente et en jeu). Le moteur reçoit `civSetup { civId: 'neutre' }` — chemin déjà canon du banc vanilla (R-147), zéro code de gameplay nouveau (D3 respecté).
5. **Web (D1)** — « Sans civilisation » ajouté : éditeur 5 sièges (chaque siège, jamais marqué « prise »), **deux nouveaux sélecteurs au DUEL miroir** (votre civ + civ de l'adversaire, défaut neutre/neutre ; « Aléatoire » pour l'adversaire = tirage historique), picker de jointure, CivPicker (carte grise en tête).
6. **D2 verrouillé par test** : la neutre n'est PAS dans `CIVILIZATIONS.civs` (16 keys) — le pool de TOUS les tirages aléatoires (solo 1v1, 5 sièges, StartGame) la ignore structurellement ; test verrou + e2e « défaut sans choix → bot tiré parmi les 16, jamais neutre ».

## Preuves

- Tests : `apps/server/tests/civs-neutres-lobby.test.ts` **6/6 verts** (verrou tirage, helper, validateur 2-neutres, e2e duel neutre vs neutre actif avec aucun trait canon `caravanesPlus50/sciencePlus`, e2e défaut intact, e2e 5 sièges deux neutres) ; suites ciblées lobby/config/bot-td **46/46** ; web **785/785** ; svelte-check **0 erreur** ; `tsc` serveur propre.
- Captures GUI 1280×720 (script `devtmp/civs-neutres-lobby-gui.mjs`, worker 8787 neuf + Vite relancé à neuf) dans `dev-logs/captures-civs-neutres-lobby/` : éditeur sièges 2-3 « Sans civilisation » (banderoles neutres), duel défauts neutre/neutre, rencontre en jeu badge « Sans civilisation ».

## Pièges consignés

- Le vrai verrou n'était PAS `lobby.ts` (l.271/285/495, prévu par le handoff) mais **game.ts** l.719/754/829 : éviction silencieuse de la neutre côté GameDO — trouvée par l'e2e, pas par la lecture.
- Vite STALE : le serveur 5174 répondait avec l'ancien bundle → kill du processus avant captures.
- Le duel 1v1 passe par le flux solo historique (`civId` + `botCivId`), pas par la config 5 sièges — les deux portes sont maintenant ouvertes.

## Intouchés (vérifié)

Moteur, traits/uniques, défauts de création (`configPartieDefaut` inchangé), Jev/bots, `schemaVersion` 28, tirages aléatoires (16 canon only).

## Reste

À l'œil Erik en prod : un duel neutre vs Jev depuis le lobby (3 clics : Duel → Adversaire Jev → Créer). Le duel à défauts neutres change UNE chose vs l'historique : l'adversaire bot n'est plus tiré au hasard mais sans civ — veto Erik possible (revenir = mettre « Aléatoire » par défaut dans le sélecteur de l'adversaire, un chiffre).
