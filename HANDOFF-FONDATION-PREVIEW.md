# HANDOFF-FONDATION-PREVIEW — La case de fondation d'un colon se teinte à la couleur de la nation

**Statut : prêt — NON LANCÉ.** Demande d'Erik (05/11) : quand un colon porte un ordre de fondation de ville, la case visée (en dessous de lui / au bout de son chemin) doit **prendre la couleur de la nation comme si elle faisait déjà du territoire culturel** — l'aperçu indique d'un coup d'œil que l'ordre est passé ET où la ville naîtra. Rendu PUR : réutiliser le dégradé culturel existant (ZONE-CULTURELLE-DEGRADE : smoothstep continu + texture radiale en cache) avec une opacité d'aperçu.

## 0. Préalables

1. `REPORT-ZONE-CULTURELLE-DEGRADE.md` (le rendu culturel : smoothstep + texture radiale en cache — C'EST le visuel à réutiliser) ; `REPORT-PREVIEW-VIVANTE.md` (le pipeline des surimpressions au survol — l'endroit où brancher) ; `ANNUL-CHEMIN` (le chemin gelé d'un colon : la case destination est déjà connue du client) ;
2. Client : `apps/web/src/lib/render/` (la couche tuiles : le rendu culturel, le chemin gelé, les sprites), `Game.svelte` (l'état des unités sélectionnées et leurs ordres — le colon sous `FoundCity` est identifiable : ordre soumis OU chemin gelé dont la destination finale = case de fondation) ;
3. ⚠ Le champ exact : un colon peut (a) avoir l'ordre `FoundCity` direct (sur place), ou (b) un chemin programmé vers sa case de fondation (fondation en fin de chemin — canon EMBARQUEMENT/MARCHE) — les DEUX cas affichent l'aperçu : (a) sa case courante, (b) la destination du chemin. Identifier au code où cette case est déjà calculée (l'émission de fondation programmée existe côté production de ville — `fonder` des questions Jev aussi : Jev en profite pareil, c'est du rendu de la case, pas du joueur).
4. Discipline : rendu client pur, zéro logique/serveur/moteur ; captures 1280×720 avant commit ; labo visuel à l'œil Erik (l'opacité est subjective) ; UN SEUL worker 8787 ; redémarrer Vite avant recapture.

## 1. Décisions de tranche (défauts tranchés — veto Erik possible)

- **D1 — L'aperçu de fondation** : la case destination d'un colon sous fondation programmée reçoit le **même rendu que le territoire culturel** (dégradé continu + texture radiale en cache) teinté à la couleur du propriétaire du colon, avec une opacité d'aperçu data-driven (`seuilsRender.fondationPreviewAlpha`, défaut ~0,5 — au labo à l'œil) ; le contour de la case garde le chemin gelé existant (les deux surimpressions cohabitent : chemin → destination teintée) ;
- **D2 — Les deux cas couverts** : fondation sur place (ordre direct) ET fondation en fin de chemin (destination) ; la teinte suit la couleur de la NATION du colon (même palette que son drapeau/territoire) ;
- **D3 — La disparition est propre** : ordre annulé (ANNUL-CHEMIN), colon vendu, mort, ou ville fondée → la teinte disparaît immédiatement (l'aperçu dérive de l'état, jamais d'un cache manuel) ;
- **D4 — Intouchés** : le territoire culturel réel, les autres surimpressions (préview vivante, sélection, chemin), le moteur/serveur, Jev/bots (ils en profitent automatiquement : rendu de la case, pas du joueur), `schemaVersion` 28.

## 2. Mission L0→L2

- **L0** : suites web 774 + svelte-check verts.
- **L1 — Tests FIRST (web)** : colon avec FoundCity direct → case courante teintée ; colon avec chemin → destination teintée ; annulation → teinte disparue ; couleur = nation du propriétaire ; une unité NON-colon ou sans ordre de fondation → jamais teintée ; le rendu culturel réel inchangé (tests existants).
- **L2 — Labo + captures AVANT commit** : captures 1280×720 (colon sur place, colon en chemin, annulé, deux nations côte à côte) — ERIK VALIDE L'OPACITÉ avant commit (arrêt-pour-approbation). Suites web + svelte-check, commit + push, rapport court `REPORT-FONDATION-PREVIEW.md`.

## 3. Critères d'acceptation

1. La destination d'un colon sous fondation se lit d'un coup d'œil (teinte nation style culturel) ;
2. La disparition suit l'état (annulation/mort/fondation) sans état caché ;
3. Zéro changement hors rendu ; asset et territoire culturel réel intacts ; suites web vertes ; opacité validée à l'œil par Erik.

## 4. Périmètre interdit

Le rendu du territoire culturel réel ; le moteur/serveur ; Jev/bots ; la logique de fondation ; jamais de fichier non tracké d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : l'ordre de fondation se VOIT — comme un futur territoire qui attend sa ville.
