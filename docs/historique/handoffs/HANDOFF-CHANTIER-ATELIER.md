# HANDOFF CHANTIER — Atelier d'assets (page `#/atelier`)

Tu reprends le pilotage de l'implémentation pour construire **la page d'atelier d'assets** qu'Erik utilisera ensuite en sessions de retouche (rituel défini dans [ATELIER-ASSETS.md](ATELIER-ASSETS.md) — le lis, c'est le produit final attendu). **Préalables :** `HANDOFF.md` §4, baseline **829 tests** + typecheck verts, le rendu 3D V1+V2 est **accepté par Erik** (il a corrigé lui-même un problème d'affichage des ressources en ligne — vérifier l'état de `visuel3d.json`/`GameCanvas` avant de partir, il y a peut-être des retouches locales non commitées : **inspecter avant d'écraser**). `schemaVersion` : **18 — aucune migration (page client-side pure)**.

**Contexte.** Erik veut un **labo permanent** (`#/atelier`, client-side pur comme `#/progen` et `#/lab3d`) où isoler, examiner et nommer n'importe quel asset par catégorie, pour dicter des retouches à des sessions d'agents successives. La page n'a **pas besoin d'être déployée** (usage local 5174), mais elle est dans le code et vit avec lui.

## Mission — livrables dans l'ordre

- **L0 — Catalogue d'assets** : un index central (généré depuis `visuel3d.json` + `resources.json` + le registre de sprites de `generate.py`/`sync-art`) exposant chaque asset : **catégorie** (terrains 3D / structures 3D / cartes-ressources / sprites 2D / overlays), **identifiant exact**, nom FR courant, source de vérité (entrée JSON / fonction générateur). Test de complétude (toutes les ressources du moteur ont une carte ; tous les terrains du moteur ont une tuile ; les sprites référencés par `textures.ts` existent dans le catalogue) ;
- **L1 — Page `#/atelier`** (route hors garde de session, client-side pur) : **barre de catégories + grille** avec recherche, **vue d'isolement** de l'asset sélectionné en grand — 3D : caméra orbitale (drag pour tourner, molette zoom), interrupteurs **bloom / animation / fond sombre-clair / grille hex** ; sprites 2D : fond damier + variantes d'accent joueur côte à côte ; **fiche d'identité** : id exact (bouton copier), catégorie, source de vérité, et **champ « note de session »** 🔶 (texte local persisté en localStorage pour qu'Erik note ce qu'il veut faire d'un asset — le relit à la session suivante) ;
- **L2 — Avant/après** : l'atelier garde la **version précédente en référence** pendant une session (snapshot à l'ouverture de la page + bouton comparer A/B) — c'est ce qui permet à Erik de valider une retouche d'un coup d'œil ;
- **L3 — Vérification** : la page charge sans session ni API (comme `#/lab3d` — piège : la garde de session bloque les labos, cf. V1), toutes les catégories rendent (test e2e DOM), perf fluide (orbite 60 FPS sur un asset isolé), captures `dev-logs/captures-atelier/`, tests verts, typecheck vert, CI (le push partira en prod — la page est inerte côté gameplay, sans risque) ;
- **L4 — Livraison** : committer, vérifier la prod, et **tester le rituel complet en local** : serveur → page → sélection d'un asset → modification de son entrée JSON → rechargement → avant/après visible. Documenter dans `ATELIER-ASSETS.md` toute divergence entre la page livrée et le rituel décrit.

## Critères d'acceptation
- `#/atelier` charge sans login ni serveur API, filtre par catégorie, recherche fonctionnelle ;
- Chaque asset affiche son id exact et sa source de vérité ; copie de l'id possible ;
- Isolement 3D avec orbite/bloom/animation ; sprites avec variantes d'accent ;
- Avant/après pendant une session ; note de session persistée ;
- Test de complétude du catalogue vert ; baseline ≥ 829 tests verts, typecheck vert, CI vert.

## Périmètre interdit (cette session)
Toute **retouche esthétique** d'asset (c'est l'usage, pas la construction) ; renommage V3 ; espionnage avancé ; tout changement gameplay/moteur/serveur ; déploiement spécial (la CI standard suffit).

## Fin de session
Rapport `REPORT-CHANTIER-ATELIER.md` (décisions, catégorie manquante éventuelle, 🔶), arrêt, remise de la main au pilot.
