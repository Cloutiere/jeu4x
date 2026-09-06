# REPORT — Correctifs du mode solo : 3 signalements d'Erik (05/09/2026)

Mission `HANDOFF-CORRECTIFS-SOLO.md` exécutée dans l'ordre 1 → 2 → 3, test-first. **Aucune migration `schemaVersion`** (reste 18) : aucun bug moteur d'état, seulement UI (S1) et données (S2).

## Signalement 1 — ICBM proposée en production dès le tour 1 (GRAVE) — CORRIGÉ

**Verdict d'enquête : trou UI, pas moteur.** Le serveur protège bien (déjà testé, `phase7m`) :
- `packages/rules/src/techs.ts` — `isProducible` refuse `strategic: true` (R-138) et `canSetProduction` passe par `productionDataOf` qui propage `strategic` ; `applySetProduction`/`applyRushBuys` (`turn.ts`) appellent `canSetProduction` ; le bot aussi (`botPolicy.ts`).
- **Le défaut était dans `apps/web/src/components/CityPanel.svelte`** : (a) `optionFor` appelait `isProducible` avec un objet amputé (`{tech, requiresBuilding}` seul — sans `strategic`, le garde R-138 ne se déclenchait jamais) ; (b) le filtre d'entrée `implemented === false` croyait exclure l'ICBM alors que `units.json` porte `implemented: true` ; (c) l'ICBM n'ayant pas de `tech`, aucun verrou de tech ne la bloquait non plus. L'ICBM était donc listée **débloquée** dès le tour 1 — mais un clic réel aurait été refusé par le serveur (l'UI mentait, elle n'ouvrait pas de trou jouable).

**Correctif (source unique partagée)** : nouvelle lib `apps/web/src/lib/productionMenu.ts` — `optionsUnites`/`optionsBatiments` construisent le menu via **`canSetProduction`** (exactement la fonction du serveur et du bot, R-87/R-110/R-114/R-117/R-138/R-148). Les armes `strategic` ne sont **jamais listées** (R-138 : « absente des menus ») ; les items verrouillés restent grisés avec leur tech requise (R-87). `CityPanel.svelte` consomme la lib (les merveilles gardent leur chemin `wonderProductionIssue`, inchangé).

**Tests** : `apps/web/tests/productionMenu.test.ts` (6) — ICBM absente sans tech ET avec toutes les techs ; aucune option `strategic` (balayage données) ; seuls Guerrier/Colon débloqués sans tech ; items verrouillés grisés avec libellé ; toute option débloquée passe `canSetProduction` (source unique vérifiée). Le refus serveur d'un `SetProduction` ICBM était déjà couvert (`packages/rules/tests/phase7m.test.ts`).

## Signalement 2 — Ressources visibles sans la technologie (R-92) — CORRIGÉ (données)

**Verdict d'enquête : bug de DONNÉES, pas de rendu.** Le calque 3D (`structures3d.ts` : `estCarteNeutre` → pool `carteInconnue`, picto « ? ») et le 2D consomment correctement l'état filtré du socket. Mais `filteredResource` diffuse l'id réel quand `hiddenUntilRevealed: false` — et **13 ressources sur 22** portaient `false` (aluminium, blé, caoutchouc, charbon, chêne, encens, gibier, or, marbre, pétrole, soufre, teinture, uranium) en contradiction directe avec R-92 : « *aucune ressource v1 n'utilise ce cas* ». Les tests R-92 existants ne détectaient pas la fuite : ils utilisaient le Fer (`hiddenUntilRevealed: true`). Épices et Gemmes (sans `revealedByTech`) gardent l'icône réelle d'office — conforme CivRev-fidèle et à l'invariant inverse.

Si Erik jouait **Inde**, le comportement observé aurait été canon (`toutesRessources`, R-146) — mais la fuite data était réelle pour toutes les autres civs ; corriger était juste dans les deux cas.

**Correctif** : `hiddenUntilRevealed: true` sur les 13 ressources (data seule — zéro ligne moteur changée).

**Tests** : `fog.test.ts` — balayage exhaustif « TOUTE ressource à `revealedByTech` non débloquée est diffusée `inconnue` » (aurait échoué avant le fix sur 13 ids) ; `resources.test.ts` — invariant data « `revealedByTech` ⇒ `hiddenUntilRevealed: true` » ; `apps/web/tests/structures3d.test.ts` — pipeline réel `makeState` → `getFilteredState` → `planifierStructures` : avant Monnaie la carte d'Or est **neutre** (« ? »), après elle est **pleine identifiée** (conditions de jeu réelles, demandé par le handoff).

## Signalement 3 — « Guerriers ennemis sortis d'une hutte alliée » — RÉPONSE : c'est possible, et c'est canon

**Réponse directe à Erik : tu n'as pas mal vu, mais ce n'était pas un bug.** Deux explications canon, la première étant presque certainement la tienne :

1. **L'embuscade (R-98)** — quand on ouvre une hutte, la table de récompenses (`huttes.json`) tire « embuscade » avec un poids de 10/105 (~10 %) : **2 guerriers barbares surgissent immédiatement sur les cases adjacentes de la hutte elle-même**. Une hutte « bienveillante » peut donc bel et bien cracher des barbares à l'ouverture — voulu (divergence CivRev assumée du canon « bonne/mauvaise hutte »). Le journal affiche un toast « EMBUSCADE — 2 barbare(s) ! » qui a pu passer inaperçu.
2. **La confusion hutte ↔ village barbare (R-96/R-98)** — les **villages barbares** engendrent des guerriers qui rôdent autour d'eux (comportement canon 7d). Un camp est visuellement distinct (dôme rouge ~2× plus gros, mur, visage hostile) mais à faible zoom/fog la confusion reste possible. Une hutte n'est jamais « amie » : c'est un lieu neutre sans propriétaire.

**Bug moteur écarté par le code et les tests** : les spawns R-96 viennent exclusivement des `villages` (`turn.ts` `processVillages`, événement `BarbarianSpawned` nommant le village) ; les barbares **n'ouvrent jamais les huttes** (R-95, `turn.ts` `openHutAt` + test existant) ; la récompense « unité gratuite » d'une hutte va toujours à l'ouvreur (joueur). Nouveau test d'invariant (`barbares.test.ts`) : pour toutes les récompenses hors embuscade, tout `BarbarianSpawned` référence un village existant — jamais une hutte.

**Correctif de lisibilité (issue a, appoint)** : les visages bienveillants/malveillants et la différenciation des structures datent de la retouche d'atelier d'Erik hier (périmètre interdit — non touchés). Aucun autre changement : l'issue tranchée est (c) avec documentation (le présent rapport).

## Vérification en partie solo réelle

Partie solo **HTHZH5** (Égypte vs bot Japon, génération aléatoire), fondation de la capitale au tour 1, vérifié en GUI :
- **Tour 1, zéro tech utile : l'ICBM est absente du menu** (menu complet extrait du DOM — aucune option « Missile ICBM » ; le Projet Manhattan apparaît grisé « Requiert : Théorie atomique », chemin canon R-138).
- **Tooltip d'une case à ressource : « Prairie — Ressource inconnue »** — identité masquée avant la tech, en conditions de jeu réelles (2D tooltip et calque 3D alimentés par le même état filtré corrigé).
- Captures : `dev-logs/captures-correctifs-solo/GUI-tour1-menu-sans-ICBM.png`, `GUI-tour1-ressource-inconnue-R92.png`.

## État

- **Tests : 895 verts** (698 rules / 132 web / 65 server — baseline 884 + 11 nouveaux). Typecheck 0 erreur. Build de prod sain.
- `schemaVersion` 18 inchangée. Chantier V2 unités 3D et atelier d'Erik non touchés (arbre de travail propre, seuls les fichiers du correctif sont modifiés).
- Périmètre interdit respecté ; pas de renommage ; pas d'espionnage avancé.

## Notes / errata

- `units.json` : l'ICBM porte `implemented: true` et pas de `tech` — cohérent avec R-138 (« données auditées : conformes ») puisque seule l'instanciation Manhattan la crée ; le filtre UI repose désormais sur `strategic`, plus robuste qu'un commentaire.
- Le toast d'embuscade existe mais reste discret ; si Erik le souhaite, un marquage plus visible du déclencheur (picto « ! » sur la hutte avant ouverture ?) pourrait aller au backlog — non fait ici (décision de pilotage).
