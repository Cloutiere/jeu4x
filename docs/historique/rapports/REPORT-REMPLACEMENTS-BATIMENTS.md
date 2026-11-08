# REPORT-REMPLACEMENTS-BATIMENTS — livré 06/10, commit cfbd131, CI + Deploy verts

## Le signalement et la cause

Erik : Bibliothèque construite + tech Université connue → l'Université n'apparaissait pas dans le menu. Cause exacte : `apps/web/src/lib/productionMenu.ts` filtrait avec le sens INVERSÉ de `replaces` — `if (b.replaces && ctx.buildings.includes(b.replaces)) continue` retirait le REMPLAÇANT du menu précisément quand le REMPLACÉ (son prérequis) était construit.

## Découvertes (le diagnostic du handoff était à moitié faux)

- **Le moteur était DÉJÀ conforme R-111** : à la complétion, le remplacé est retiré (`grantBuildingToCity` + la voie Bâtisseur, turn.ts) — pas d'empilement ×4+×1,5 ; `canSetProduction` accepte le remplaçant dès que le prérequis est présent ; l'Arche d'Alliance (`templesVersCathedrales`) est correcte et testée. D2/D3/D4 = zéro modification moteur.
- Le seul bug était le filtre client. Fix : le filtre dans le BON sens — le remplacé sort du menu quand le remplaçant est bâti ; le remplaçant est proposé (grisé « Requiert X » tant que le remplacé manque).

## Livré

- `productionMenu.ts` : filtre corrigé (une ligne + commentaire).
- Tests (test-first, rouge 3/4 côté menu avant fix, moteur déjà vert) :
  - `packages/rules/tests/remplacements-batiments.test.ts` (4) : complétion Université retire la Bibliothèque (science ×4 seule — 12 science → 48), Cathédrale retire le Temple, Banque régression verrouillée, `canSetProduction` 4 cas.
  - `apps/web/tests/remplacements-batiments.test.ts` (4) : le scénario d'Erik (Université proposée + unlocked avec Bibliothèque), grisée « Requiert Bibliothèque » sans, Banque/Cathédrale miroir, remplacé absent du menu.
- RULES.md R-111 clarifiée (une phrase : sens unique et non inversé).
- schemaVersion 27 inchangée (D5).

## Vérification GUI réelle (L3) — PASS

`devtmp/remplacements-batiments-gui.mjs` : solo légal, capitale côtière (science R-107), chaîne complète alphabet → ecriture → litteratie → Bibliothèque construite t59 → maconnerie → mathematiques → code_des_lois → democratie → **tech Université t98** → panneau ville : « **Université (160) Science ×4 — remplace la Bibliothèque** — requiert Bibliothèque · 9 tours », non grisée, Bibliothèque absente du menu → clic (file 3/4) → déblocage de file (ville cernée) → **complétion t108 vérifiée au dump : `['comptoir_commercial','palais','remparts','universite']`** — Bibliothèque partie. Menu relu : ni l'une ni l'autre. Captures `dev-logs/captures-remplacements-batiments/` (A menu constructible, B en file, C chronique « Université achevée à Ville1 ») relues PASS.

## Suites

rules 1032 (+4) / web 586 (+4) / server 123 vertes, tsc 0 erreur ×3, svelte-check 0 erreur (17 warnings connus). CI + Deploy prod verts sur cfbd131.

## Pièges consignés (GUI longue, ~100 tours)

1. **wrangler multi-écouteurs zombies** : kill simple laisse des workerd qui gardent le port ; plusieurs écouteurs sur 8787 = connexions qui tombent sur un zombie figé → tour qui « n'avance pas » de façon erratique. Remède scripté : `taskkill /F /T` de TOUS les écouteurs du port avant spawn + adoption d'un serveur sain si présent.
2. **Ordres perdus pendant le verrou de résolution** : un SubmitOrder envoyé pendant la résolution est rejeté silencieusement — reposer recherche/production/fins de tour à CHAQUE itération, jamais « insister entre deux tours » (un ordre ne s'observe qu'à la résolution suivante).
3. **R-184** : EndTurn refusé sans recherche sélectionnée — repli générique : plus petite tech inconnue à prérequis satisfaits (techs.json lu directement).
4. **Ville cernée = file stalle** : le guerrier en tête se complète mais ne peut pas être POSÉ (aucune case libre), la file ne se consume plus — `RemoveFromQueue` par tour tant que l'item visé n'est pas en tête.
5. **Clic ville sous pile** : règle d'alternance (interaction.ts) — cliquer jusqu'à 10× pour traverser les occupants avant que la ville ne se sélectionne.
6. **Proxy Vite câblé 8787** (vite.config.ts en dur) : la page passe TOUJOURS par 8787 — un worker sur port dédié casse le ws du jeu (403). Utiliser 8787 et nettoyer les zombies plutôt qu'un port dédié.

## 🔶 Résidus

- Libellé d'effet double dans l'info-bulle : « Science ×4 — remplace la Bibliothèque — remplace Bibliothèque — requiert Bibliothèque » (données + libellé généré) — cosmétique, à l'œil Erik.
- Le zombie wrangler orphelin après sortie du script : `taskkill` de l'arbre à la fin de session conseillé.
