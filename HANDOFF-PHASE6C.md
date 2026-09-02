# HANDOFF PHASE 6c — Session d'affinage génération & terrains (dirigée par Erik en direct)

Tu reprends le pilotage pour une **session interactive** : Erik va te donner des demandes **en direct**, au fil de l'eau, sur la génération de cartes et les terrains. Ton rôle n'est pas d'exécuter un grand plan, mais d'enchaîner **de petits cycles rapides** : écouter la demande → implémenter (test-first si moteur) → **démontrer dans le labo `#/progen`** → committer → passer à la suivante.

**Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~390 tests).

## À lire pour te préparer

1. **`packages/rules/src/progen/`** — le générateur procédural (Phase 6b) : `noise.ts`, `geo.ts`, `fertility.ts`, `content.ts`, `mirror.ts`, `settings.ts` + son README. Tout est pur, déterministe (seed), et **l'équilibrage prime sur la géophysique**.
2. **`packages/rules/src/data/terrain.json`** et **`resources.json`** — les données éditables (R-91..R-94 pour les ressources) : tout changement se calibre ici, jamais en dur.
3. **`assets-src/tools/generate.py`** — le pipeline d'art (nouveaux terrains = nouveaux sprites à y ajouter, puis `sync-art`).
4. **La page labo `#/progen`** (`apps/web/src/pages/Progen.svelte`) — **c'est la surface de travail d'Erik** : il y voit les cartes entières sans fog, avec les calques (heatmap de fertilité, rendements, entités) et les curseurs de réglages. Chaque modification de génération doit être **démontrée visuellement dedans**.
5. `RULES.md` §2 (terrains), §7.9 (barbares/huttes), R-91..R-94 (ressources).

## Rappels d'environnement

- Le labo tourne en local : worker `:8787` + Vite `:5174` (le 5173 est occupé par une autre app). 
- **Attention au viewport du navigateur intégré** : le remettre à une taille normale (ex. 1280×720) avant tout travail GUI — un viewport de capture (2200×1500) rend la page miniaturisée et a déjà causé une fausse alerte.
- CI/CD actif : chaque commit poussé se déploie en prod. Petits commits cohérents.

## Premier chantier concret (demande d'Erik) — eau côtière vs océan

Actuellement il n'existe **qu'un seul type d'eau** (`eau`). Dans Civilization Revolution, il y a des cases de **mer (côte)** accessibles par certains bateaux et des cases **d'océan profond** accessibles seulement par d'autres. À faire :

1. **Données** : nouveau terrain `ocean` (dans `terrain.json`, avec l'eau côtière qui garde son id `eau` et ses rendements 0/0/2 ; l'océan : rendements 🔶 — proposer, ex. 0/0/1 ou identiques — et `passable: false` comme l'eau). Prévoir le hook naval futur : un champ type `navalAccess` (🔶 libellé à définir) qui, quand le naval existera (Phase 7), permettra aux unités `canOcean`/`coastal` de s'en servir. **Discuter le libellé avec Erik avant d'implémenter** — c'est sa mécanique à venir.
2. **Génération** : le générateur distingue désormais **côte** (cases d'eau adjacentes à de la terre) et **océan** (le reste, plus profond) — c'est le pattern officiel du PDF de référence (océan profond / eaux côtières au seuillage de l'altitude). Les cartes préfabriquées : mettre à jour leurs bordures d'eau si pertinent (côtes le long des terres) — re-validation complète.
3. **Labo** : la distinction visible (teinte/label des deux eaux), curseur de réglage si pertinent (proportion d'océan).
4. **Intégrité** : les tests référentiels (ressources `revealedByTech` sur `eau`, barbares/huttes, cartes) restent verts — vérifier qu'aucune ressource ni validation ne dépend d'un id d'eau obsolète.
5. Sprites via `generate.py` (teinte océan plus profonde), `sync-art`, LICENSES.

Ensuite : **attendre les demandes d'Erik** (ajout de terrains, contraintes de génération, réglages, ajustements de ressources…). Ne pas anticiper au-delà.

## Posture — à tenir toute la session

- **Erik inspectera personnellement la présence de chaque ressource** sur les cartes : sois prêt à **modifier code et données vite et proprement** à sa demande, et **propose-lui un outil de comptage dans le labo** (panneau « ressources par type et par terrain sur la carte générée ») — c'est exactement l'aide dont son inspection aura besoin. Propose-le tôt, implémente-le s'il approuve (c'est un outil de labo : petit et testable).
- Chaque demande = un petit cycle : tests si moteur → implémentation data/UX → démonstration dans le labo → commit → demo à Erik.
- **Rien de codé en dur** : contraintes de génération, terrains, ressources → tout en données (`terrain.json`, `resources.json`, `settings.ts` du générateur) avec les tests d'intégrité qui vont bien.
- Changement de **règles** (au-delà de données/UX) : proposer d'abord, implémenter après accord d'Erik.
- Ambiguïté : demander à Erik dans la foulée — il est présent et pilote en direct.

## Fin de session

Quand Erik indique que c'est suffisant : rapport court (liste des cycles réalisés, calibrages notés dans RULES.md §11 si nouvelles constantes, captures), commit/push final, remise de la main.
