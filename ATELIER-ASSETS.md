# ATELIER-ASSETS — Rituel permanent des sessions de retouche visuelle avec Erik

**Tu (agent) es dans une session d'atelier visuel avec Erik.** Ce document définit le rituel : il se lit EN PREMIER, à chaque session, et se suffit à lui-même. **Principe : Erik regarde, sélectionne, nomme un asset et décrit ce qu'il veut ; tu modifies, tu montres, tu recommences.**

## Démarrage de session (ce qu'Erik te demande d'abord)

1. Lance le serveur de dev : `pnpm dev:web` (tâche de fond — **sans pipe** `| head`, piège SIGPIPE ; port **5174**) ;
2. Ouvre **http://localhost:5174/#/atelier** dans ton navigateur (compétence browser-use ; la page est **client-side pur, sans session/serveur API**) ;
3. Signale à Erik que l'atelier est prêt, puis attends sa sélection.

## La page Atelier (route `#/atelier`)

Erik y trouve, par **catégories** :
- **Terrains 3D** (prairie, plaine, forêt, colline, montagne, désert, mer, océan, ville/Nœud Serveur, cratère) — rendus depuis `apps/web/src/lib/render3d/visuel3d.json` ;
- **Structures 3D** (Mainframe et ses paliers, modules de bâtiments, cartes-ressources ×22 et leur état neutre, slot, hutte, village barbare, artefacts 3D le cas échéant) ;
- **Sprites 2D** (unités, artefacts, jetons — PNG de `assets-src` produits par `generate.py`, y compris leurs variantes d'accent joueur) ;
- **Overlays** (flèches, anneaux, worked tiles, pings) si représentés.

Chaque fiche affiche l'**identifiant exact de l'asset** (bouton « Copier l'id ») et sa **source de vérité** (entrée JSON / fonction du générateur). La vue d'isolement : asset en grand, **caméra orbitale** (glisser = tourner, molette = zoomer), interrupteurs **Bloom / Animation / Fond clair / Grille hex** (affiche les tuiles voisines), compteur FPS. Le **Mainframe** a des variantes : champ `pop` (palier) + bascule **Capitale**.

**Ce que la page garde en local (localStorage, machine d'Erik) :**
- **Note de session** — clé `atelier:note:<id>` : sauvegardée à chaque frappe, rechargée à la sélection ; c'est là qu'Erik (ou l'agent) note ce qu'il veut faire d'un asset, la note survit aux rechargements ;
- **Référence « avant »** — clé `atelier:ref:<id>` (JPEG du rendu 3D) : posée automatiquement au **premier isolement** d'un asset ; bouton **« Refaire la référence (après) »** pour l'écraser avec le rendu courant ; bouton **« Comparer A/B »** affiche l'AVANT (volet gauche) à côté du rendu courant. Pour **effacer** une référence : vider le localStorage (`atelier:ref:*`) ou reposer la référence.

## Divergences page livrée / rituel (chantier ATELIER, 05/09)

- **Sprites 2D** : pas de snapshot rendu — le bouton « Utiliser la base comme référence A/B » enregistre le PNG de base comme référence ; les **variantes d'accent** (Joueur 1 / Joueur 2 / Barbare) sont teintées à la volée depuis le calque `_accent` blanc ;
- **Overlays** (flèches, anneaux, pings, brouillard…) : effets **programmatiques** (aucun fichier) — la fiche donne la source dans le code, pas de rendu isolé ;
- **PNG absents** signalés « PNG absent » (art jamais générée : unités uniques sans `UNIQUE_UNIT_ALIASES`, pièces de vaisseau, `tile_cratere`) — dès que `generate.py` produit le PNG, l'atelier l'affiche sans changement de code ;
- **GAP connu 🔶** : `textures.ts` référence `tile_cratere` (TILE_ASSETS) mais le PNG n'existe pas (fallback silencieux, sans effet depuis le rendu 3D par défaut) — art 2D du cratère à créer en session d'atelier si besoin ;
- Le test de complétude du catalogue (`apps/web/tests/atelier-catalogue.test.ts`) échouera volontairement si un asset moteur perd sa carte/tuile/sprite ou si un PNG référencé manque : c'est le filet de sécurité du rituel.

## Workflow de retouche (répété autant de fois que nécessaire)

1. **Erik sélectionne un asset et décrit la modification** (« la carte Épices : plus grande, doré plus chaud ») ;
2. **Tu identifies la source de vérité** :
   - 3D / structures / terrains → **`apps/web/src/lib/render3d/visuel3d.json`** (calibrage sans code ; le chargeur valide) ;
   - Sprites 2D → **`assets-src/tools/generate.py`** (puis `sync-art` pour propager les PNG) ;
3. **Tu modifies et tu fais recharger la page** (HMR ou rechargement complet — piège Vite connu : si le vieux visuel persiste, rechargement complet) ;
4. **Tu compares** : l'atelier doit offrir un avant/après (garde l'ancien en référence pendant la session) ;
5. **Tu confirmes à Erik** ce qui a changé et tu attends sa validation (ou sa prochaine retouche).

## Règles non négociables

- **Ne commite PAS sans la demande explicite d'Erik** (une session d'atelier produit souvent plusieurs essais ; Erik dit « commite » quand il est satisfait — commite alors l'atome validé avec un message citant l'asset) ;
- **Zéro changement de gameplay** : `packages/rules`, serveur, tests — intouchés ; seul le visuel (JSON de spec, générateur d'assets, composants de rendu) bouge ;
- **Noms de base conservés dans le code** (décision Erik du 07/09) : le renommage thématique des libellés est le chantier V3, pas l'atelier ;
- Si Erik demande une retouche **hors périmètre visuel** (gameplay, équilibrage), signale-le et oriente vers une session standard (handoff) ;
- `pnpm test` + `pnpm typecheck` verts avant tout commit demandé ;
- Pièges connus : ports occupés par des serveurs périmés (tuer avant de relancer) ; HMR servant du vieux code ; `rAF` absent du navigateur d'automatisation (les vérifications rendu via captures/juge ou sur la machine d'Erik).

## État du répertoire (pour ta session)

Le catalogue vivant est `visuel3d.json` (structures/terrains 3D) et `assets-src/tools/generate.py` (sprites). Toute nouvelle catégorie d'assets doit d'abord exister dans ces sources — l'atelier les expose, il ne les définit pas.
