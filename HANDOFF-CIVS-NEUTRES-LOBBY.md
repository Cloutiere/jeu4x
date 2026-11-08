# HANDOFF-CIVS-NEUTRES-LOBBY — Choisir sa civ (et celle de Jev) au lobby, y compris « Sans civilisation » pour les tests

**Statut : prêt — NON LANCÉ.** Demande d'Erik (08/11) : dans ses duels miroirs de test contre Jev, pouvoir **choisir les civilisations** (les deux camps) et avoir par défaut les **civs neutres sans traits** — « enlever les traits permet de mieux calibrer l'IA ». État des lieux vérifié : l'éditeur de configuration (`ConfigPartieEditor.svelte`) permet DÉJÀ de choisir la civ de chaque siège (joueur et bot/Jev) et le serveur valide (`lobby.ts`) — mais la civ **`neutre`** (R-147, celle du banc vanilla : zéro unique, zéro trait, agressivité au défaut canon) **n'est pas dans le registre sélectionnable** (`CIVILIZATIONS.civs` = les 16 canon ; la validation `lobby.ts` l.285 la refuserait). Mission : ouvrir la porte, sans toucher aux défauts des parties normales.

## 0. Préalables

1. `RULES.md` R-147 (civ neutre du banc) + `packages/rules/src/data/civilizations.json` (le champ `civNeutre: "neutre"` existe — le registre la connaît, elle n'est juste pas sélectionnable) ; `sableuse` BANC-VANILLA (l'usage canon de la neutre : `civId 'neutre'` sans trait) ;
2. Code : `apps/web/src/components/ConfigPartieEditor.svelte` (les dropdowns de civ par siège — `CIV_IDS = Object.keys(CIVILIZATIONS.civs)`), `apps/web/src/components/CivPicker.svelte`, `apps/web/src/pages/Lobby.svelte` (le picker du joueur B), `apps/server/src/lobby.ts` (la validation l.285 : `rawBotCiv !== 'random' && !CIVILIZATIONS.civs[rawBotCiv]` → refus) ;
3. ⚠ Le client lit `CIVILIZATIONS.civs` importé du moteur — si le registre du client est une vue des données, la neutre doit être exposée SANS apparaître dans les tirages aléatoires (`civsAleatoires` ne doit JAMAIS tirer neutre pour une partie normale) — c'est LE point de garde de la mission ;
4. Discipline : tests FIRST, captures 1280×720 avant commit, UN SEUL worker 8787, suites web + svelte-check.

## 1. Décisions de tranche (défauts tranchés — veto Erik possible)

- **D1 — « Sans civilisation » devient sélectionnable** dans : l'éditeur de configuration (chaque siège — joueur ET bot/Jev), le CivPicker, le picker du joueur B au join. Libellé canon existant : **« Sans civilisation »** (déjà utilisé par `RencontreModale`/`CityView` pour la neutre). L'option passe la validation serveur (la neutre est admise comme les autres, code l.285 à étendre proprement — helper partagé, pas de duplication) ;
- **D2 — JAMAIS tirée au hasard** : `civsAleatoires` (parties normales) tire exclusivement parmi les 16 canon — la neutre n'entre dans aucun tirage (test verrou). Les défauts existants ne changent PAS : une partie créée sans choisir de civs reste exactement comme aujourd'hui ; la neutre est un CHOIX explicite du créateur ;
- **D3 — Comportement en jeu déjà canon** : la neutre affiche « Sans civilisation » (RencontreModale/CityView le font déjà), zéro trait, zéro unique, agressivité au défaut — AUCUN code de gameplay nouveau, la R-147 fait tout ;
- **D4 — Intouchés** : le moteur (la neutre existe), les traits/uniques, les tirages aléatoires normaux, Jev/bots, `schemaVersion` 28. La civ B au join (R-145) gagne aussi la neutre si validation partagée.

## 2. Mission L0→L2

- **L0** : suites web + svelte-check verts.
- **L1 — Tests FIRST** : la neutre listée dans les dropdowns (et libellée « Sans civilisation ») ; validation serveur accepte `civId: 'neutre'` pour hôte ET bot/Jev ; `civsAleatoires` ne tire JAMAIS neutre (test verrou) ; une partie créée avec les deux camps neutres démarre et joue (e2e court : zéro trait — vérifier qu'un trait canon n'apparaît pas, ex. caravanesPlus50 absent).
- **L2 — Captures GUI AVANT commit** : l'éditeur avec les deux siège en « Sans civilisation », création de la partie, rencontre « Sans civilisation » vs « Sans civilisation ». Suites web + svelte-check, commit + push, rapport court `REPORT-CIVS-NEUTRES-LOBBY.md`.

## 3. Critères d'acceptation

1. Erik crée un duel miroir **neutre vs neutre** depuis le lobby en quelques clics et joue contre Jev sans traits ;
2. Les parties normales sont INTACTES (tirages, défauts, 16 civs) — test verrou ;
3. Suites web + svelte-check vertes ; captures avant commit ; `schemaVersion` 28.

## 4. Périmètre interdit

Le moteur (la neutre existe — R-147) ; les traits/uniques ; les défauts de création de partie ; Jev/bots ; Zii ; jamais de secret ni de fichier non tracké d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : tes duels de test sont propres (neutre vs neutre) et la calibration IA n'est plus polluée par les traits.
