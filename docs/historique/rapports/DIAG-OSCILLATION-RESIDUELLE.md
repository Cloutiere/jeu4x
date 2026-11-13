# DIAG-OSCILLATION-RESIDUELLE — La cause fine du guerrier planté (NP8JEE)

**Diagnostic zéro code — mission HANDOFF-DIAG-OSCILLATION-RESIDUELLE (12/11).**
Partie prod **NP8JEE** (seed 3169496237, tour 14) : u4 guerrier p2 (Jev) gelé en (24,5), mp 1, t11-14, ordre `null`.

## 1. Verdict en une phrase

Le scout u4 reçoit chaque tour un objectif **`patrouiller` dont le waypoint (24,10) est une case d'EAU** — l'anneau de patrouille autour de la capitale côtière c2 (27,10) compte **3 coins sur 6 dans la mer** — et les deux marcheurs (BFS routier + glouton anti-recul) refusent correctement une cible impraticable → `Hold`, mp intact, **et le tir du waypoint étant déterministe et fondé sur (capitale, position de u4) — deux choses qui ne changent plus jamais — le même waypoint d'eau est recalculé à l'identique chaque tour.** Gel éternel, canon « jamais inactif » violé.

## 2. La preuve — re-simulation locale du tour 14 (dump prod)

Re-simulation `tsx` avec le vrai code (`devtmp`/`apps/server/devtmp/diag-osc-resid-sonde.ts`, dump `devtmp/etat-NP8JEE/dump.json`) :

```
u4: (24,5) mp 1 hp 3 fortified=false stabilized=true
objectif u4: {"kind":"patrouiller","cible":{"q":24,"r":10}}     ← EAU
pasVersRoutier(u4 → cible): null
pasVers(u4 → cible): null
cible (24,10): terrain=eau, passable=false
```

Les 6 coins de l'anneau (rayon 3, DIRS canonique ×3 autour de (27,10)) :

| Coin | Terrain | Glouton depuis u4 | Routier (BFS) |
|---|---|---|---|
| (30,10) | prairie | (25,5) | (25,4) |
| (30,7) | prairie | (25,5) | (25,4) |
| (27,7) | colline | (25,5) | (25,4) |
| **(24,10)** | **eau** | **null** | **null** |
| (24,13) | océan | null | null |
| (27,13) | eau | (25,5) | null |

**La boucle de gel, pas à pas :**

1. `assignerObjectifs` (`botPolicy.ts:1572-1579`) : p2 n'a qu'une unité → `quotaCapitale` = 0 → u4 est LE scout → objectif `patrouiller`, waypoint = `prochainWaypointPatrouille`.
2. `prochainWaypointPatrouille` (`botPolicy.ts:267-284`) : les 6 coins sont **purement géométriques** — aucun test de praticabilité de la case. Depuis (24,5), le coin le plus proche est (27,7) (index 2, d=5, tie résolu par index) → le waypoint retourné est le coin **suivant** du cycle : (24,10) — l'eau.
3. Émission (`botPolicy.ts:2279-2286`) : `pasVersRoutier` → `null` (le BFS n'admet une cible occupée mais JAMAIS une cible impraticable, `botPolicy.ts:391`) ; repli `pasVers` → `null` (aucun des 5 voisins terrestres — tous libres — ne réduit la distance wrappée à l'eau ; l'anti-recul fait exactement son travail).
4. → `Hold` journalisé, mp intacts.
5. Tour suivant : la capitale n'a pas bougé, u4 non plus (il n'a pas pu bouger), le tir redonne **le même waypoint d'eau**. Boucle fermée. Aucune variable d'état ne peut la rouvrir.

**Cohérence avec la prod (traces 9-13)** : u4 (25,4) t9 → (24,4) t9 → (24,5) t10 puis plus rien. Au t10, depuis (24,4), le pas vers (24,5) réduisait la distance au coin d'eau (6→5) → il a bougé. Arrivé à distance minimale du contour, plus aucun pas améliorant → gel t11-14. Le « ordre null » des dumps est bien la **lecture piège** annoncée au handoff : l'intention existe chaque tour (`patrouiller` → eau), elle est simplement inexécutable.

## 3. Les autres pistes — infirmées

1. **Anti-recul jugeant les pas non-améliorants** : mécanisme réel mais conséquence, pas cause. Le glouton se comporte canon (aucun pas latéral non-améliorant) ; le problème est en amont (cible elle-même interdite). Le gardien u16 (21,5) n'est pas l'objectif — u16 est à distance 11 de la capitale, hors rayon d'urgence D3 (`menaceAutourCapitale` faux) → pas de rappel, pas de gate d'attaque impliqué (aucune `Attack` tentée).
2. **Coudes de route résiduel** : le BFS n'est jamais entré en jeu — la cible est refusée à l'entrée (impraticable), pas bloquée en cours de route. Infirmé.
3. **Rappel D3 non déclenché** : exact mais non causal — l'urgence D3 est correctement fausse (aucune menace ≤ rayon de la capitale) ; si elle s'était déclenchée, le quota plein aurait garnisonné u4 et le gel aurait cessé. La doctrine « rappeler » n'est pas conçue pour ce cas de paix totale.
4. **Boucle de patrouille non consommée** : **variante confirmée, c'est la cause** — le sélecteur ne vérifie jamais l'ARRIVÉE sur un coin (il vise toujours « le coin après le plus proche ») et ne vérifie jamais la praticabilité. Sur une capitale côtière, la moitié de l'anneau peut être en mer et le « coin suivant » peut être définitivement inatteignable.

## 4. Portée du bug (pourquoi il est resté rare)

Il faut la conjonction : (a) capitale au littoral (c2 : 3/6 coins dans l'eau), (b) UNE seule unité p2 (le scout patrouille — dès la 2e unité, quota garnison = 1 et le gel cède), (c) géométrie telle que le « coin suivant le plus proche » tombe sur l'eau ET qu'aucun contournement glouton n'améliore la distance. C'est un spécimen de la « poche jamais élucidée » de CONFIANCE-EXPLORATION — mais la cause n'est PAS dans le BFS routier ni l'anti-recul (les deux réformes OSCILLATION-MARCHE fonctionnent), elle est dans le **sélecteur de waypoint géométrique de BOT-EXPLORATION**, postérieur et jamais audité sur terrains.

## 5. Leviers candidats pour le cadrage

**L1 · Filtrer les coins non praticables dans `prochainWaypointPatrouille`** (levier à la cause, recommandé).
*Ce que ça change* : le sélecteur parcourt le cycle de coins en sautant les cases absentes/impraticables (il faut lui passer un prédicat ou l'accès `state.map` — signature actuelle : `(capitale, unit, rayon, mapWidth)`). Si TOUS les coins sont dans l'eau (capitale mono-tile insulaire), repli explicite : objectif `explorer` ⑤ (la doctrine jamais inactif prend le relais) au lieu d'un coin impossible.
*Risque de rouvrir l'oscillation* : nul à faible — on ne touche ni au glouton ni au BFS ni à l'anti-recul ; la boucle de patrouille reste déterministe (cycle de coins praticables).
*Test qui verrouille* : unitaire capitale côtière type NP8JEE (coins mixtes terre/eau) → waypoint toujours praticable ; re-simulation de la sonde sur le dump → u4 reçoit (27,7) ou (30,7) et émet un `Move` t15 ; garde unitaire : anneau 100 % eau → bascule `explorer`.

**L2 · Filet d'exécution : `Hold` → re-tir d'une cible `explorer`** (filet, complémentaire).
*Ce que ça change* : dans `case 'patrouiller'` (`botPolicy.ts:2280`), si routier ET glouton sont `null`, émettre l'objectif ⑤ explorer (cible la plus lointaine hors vision, ancrée capitale) au lieu du `Hold` — doctrine « jamais inactif » appliquée au pied levé, quelle que soit la cause du blocage.
*Risque* : le scout quitte la boucle de patrouille dès qu'il est géométriquement coincé (comportement d'avant BOT-EXPLORATION) ; un mauvais tir d'exploration réintroduirait le piétinement d'explorateur — mais ce verrou est déjà réglé (ancre capitale + réservation par tour, `botPolicy.ts:1653-1681`).
*Test qui verrouille* : unitaire « scout patrouilleur sur waypoint inexécutable → ordre Move émis, jamais Hold avec mp > 0 » ; re-simulation NP8JEE → u4 part explorer.

**L3 · Consommer les coins visités (mémo de cycle)** — plus structurel, non recommandé en premier.
*Ce que ça change* : viser le PREMIER coin praticable NON encore visité du cycle (nécessite un mémo persistant côté bot — la couche bot est aujourd'hui sans mémoire d'objectifs entre tours).
*Risque* : introduire un état persistant dans une couche volontairement sans mémoire = surface d'oscillation nouvelle ; à réserver si L1+L2 s'avèrent insuffisants au banc.
*Test* : boucle de patrouille complète parcourue N fois sans gel ni répétition de coin.

**Canon supposé** : L1/L2 s'inscrivent dans le canon « jamais inactif » (CONFIANCE-EXPLORATION `3f71087`) et ne touchent PAS aux mécanismes OSCILLATION-MARCHE (`ffa73c8`) — anti-recul et BFS restent bit à bit.

## 6. Périmètre & artefacts

Zéro modification de `packages/rules`, `apps/server/src`, `sableuse/src`. Scripts d'analyse : `devtmp/diag-osc-resid-sonde.ts` (déplacé : `apps/server/devtmp/diag-osc-resid-sonde.ts` — l'alias `@game/rules` n'est résolu que sous `apps/server`), dumps prod inchangés dans `devtmp/etat-NP8JEE/`. Aucune partie nouvelle, aucun banc, périmètre DIAG-DEFENSE-VILLE respecté (disjoint).
