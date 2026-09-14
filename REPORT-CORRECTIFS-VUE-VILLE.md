# REPORT-CORRECTIFS-VUE-VILLE — Deux correctifs d'affichage 2D (retours d'Erik en conditions réelles)

**Mission exécutée (M1+M2), zéro gameplay, zéro 3D.** Correctifs validés en solo au navigateur AVANT tout commit (règle établie), à plusieurs tailles de viewport. **Pas de commit** (sur demande explicite d'Erik).

## État final

- **Tests : 1 119 verts** (rules 791 — dont 12 nouveaux tests de contrat de cadrage dans `menu-ville.test.ts` ; web 253 — même fichier enrichi ; server 75).
- **Typecheck 4/4.** `schemaVersion` **22** (intouché — aucun changement d'état).
- Zéro diff 3D (aucun fichier `render3d/` touché), `orderShapeError` intouché, aucune règle modifiée (affichage seul).
- Fichiers modifiés : `apps/web/src/lib/render/hexView.ts`, `apps/web/src/lib/render/GameCanvas.svelte`, `apps/web/tests/menu-ville.test.ts`.

## M1 — Le zoom de la vue ville coupait les tuiles du rayon

Deux causes racines trouvées et corrigées (reproduction en conditions réelles à l'appui) :

1. **Marge horizontale sous-estimée** (`hexView.ts` `poseVueVillePour`) : la demi-étendue monde du disque de tuiles était `√3·size·(rayon + 0,35)` alors qu'un hexagone pointy-top entier impose `√3·size·(rayon + 0,5)` (centres `±√3·size·rayon` PLUS demi-hexagone `√3/2·size`). Dès que la LARGEUR bornait le zoom (fenêtres larges et basses), les tuiles extrêmes gauche/droite étaient coupées — **reproduit à 1536×864 : ~8 px coupés de chaque côté** ; la coupe grandit avec le zoom (jusqu'à ~37 px par côté à ZOOM_MAX). L'ancien test de contrat passait car à 1600×900 la hauteur bornait. → Corrigé en `rayon + 0,5` (commentaire explicite dans le code).
2. **Pose calculée sur des dimensions PÉRIMÉES** (`GameCanvas.svelte` `poseVueVilleCible`) : l'échelle utilisait les dernières valeurs `vw/vh` du ResizeObserver. Or l'entrée en vue ville masque la colonne de droite → le canvas grandit, et si l'observateur n'a pas encore délivré (piége viewport connu, PILOT-HANDOFF §5), la pose est calculée sur l'ancien canvas — **reproduit : pose figée à ×0,534 sur un canvas de 698 px alors que l'espace réel était 1069 px** (zoom deux fois trop petit ET tuiles hors canvas). → `poseVueVilleCible` lit maintenant les dimensions RÉELLES du host (`clientWidth/Height`) et resynchronise le renderer si elles ont changé ; le recalage à la fin de l'animation d'entrée (déjà ajouté) rejoue ce calcul sur les dimensions finales.

**Contrat verrouillé par tests** (nouveau bloc `CORRECTIFS-VUE-VILLE` dans `apps/web/tests/menu-ville.test.ts`) : pour les viewports **1280×720, 1536×864, 1832×1078, 2560×1440, 1100×700 (étroit — la largeur borne le zoom), 900×650** × rayon 1 et 2 : chaque tuile du rayon, **6 sommets projetés compris**, tient dans l'espace libre (0 → vw−470) × vh (tolérance demi-pixel), et la ville est exactement centrée dans l'espace libre. Ce contrat **échoue avec l'ancienne marge** (vérifié par construction : cas 1100×700 dépasse de ~4 px par côté).

**Premier affichage sur fenêtre déjà petite** : couvert par la lecture DOM directe (point 2) — plus de dépendance à la livraison de l'observateur.

## M2 — Les unités ne réapparaissaient pas à la sortie de la vue ville

**Cause racine** : à la sortie, le rebuild des entités/surcouche est déclenché immédiatement (`entitiesDirty`) mais s'exécute PENDANT l'animation de retour (450 ms) — or `vueVilleActif()` est encore vrai tant que l'animation tourne, donc `rebuildEntities` remasque les sprites (`c.visible = !vueVilleActif()`). Quand l'animation se termine, plus aucune invalidation : les unités (et toute la surcouche de guerre) restaient masquées jusqu'à une résolution/redimensionnement — obligeant Erik à rafraîchir.

**Correctif** (`GameCanvas.svelte`, fin d'animation dans le tick) : à la fin de l'animation de SORTIE, `entitiesDirty = true` et `overlayDirty = true` — le rebuild rejoué à la pose finale repeuple sprites d'unités, flèches, croix d'attaque, disputées, fantômes, chemins gelés, badges et sélection. Philosophie « repeuplement » demandée (miroir de la purge 2D↔3D d'antan). À la fin de l'animation d'ENTRÉE, la pose est recalée sur les dimensions actuelles (cf. M1 point 2). Les TROIS chemins de sortie (Fermer, Échap, double-clic hors ville) convergent vers le même `$effect` → même correction.

**Hook dev** ajouté (DEV uniquement) : `__game.unites()` → `{ total, visibles }` pour vérifier la restauration en GUI.

## Vérification e2e en conditions réalistes (partie solo Grèce SK8AUY — capitale avec Tribunal, rayon 2)

- **Viewport variable** : mesures et captures à 1280×720, 1536×864 (taille de reproduction du bug M1) et **1100×700 (fenêtre étroite)** — pas seulement l'outil par défaut.
- **Cadrage** : à 1100×700, les 19 tuiles (centre + 18) tiennent ENTIÈRES dans [12, 587]×[99, 564] sur un canvas de 1069×663, échelle 1,037 — la pose avant correctifs était ×0,534 sur un canvas périmé.
- **Cycle entrée → sortie × 3 chemins, répété deux fois de suite** : entrée (unités masquées `visibles 0/1` à chaque fois) puis sortie par ① bouton « ✕ Fermer », ② Échap, ③ double-clic hors ville — à chaque sortie : `vueVille.actif=false` ET `unites.visibles === total` (unité revenues, colonne de droite restaurée). Deux tours complets exécutés.
- **Captures** `dev-logs/captures-correctifs-vue-ville/` :
  - `vue-ville-etroit-1100x700-18-tuiles-entieres.png` — vue ville sur viewport étroit : 18 tuiles cultivables entières, liseré accent complet, rendements confinés au rayon, menu Ville1 (Palais + Tribunal) ;
  - `sortie-fermer-unites-revenues.png` et `sortie1-fermer-unites-revenues-etroit.png` — carte à plat après sortie, colon (unité) revenu, colonne de droite intacte.
  - ⚠️ Les captures des sorties ② Échap et ③ double-clic n'ont pas pu être prises (outil de capture de l'onglet intermittemment bloqué) ; la restauration y est vérifiée PROGRAMMATIQUEMENT (`__game.unites()` : visibles = total) et l'écran résultant est identique à la capture ① (même chemin de rendu).

## Notes pour Erik (revalidation sur son Chrome)

- Le symptôme « ne montre que les 6 cases » correspond à la pose calculée sur le canvas périmé (colonne de droite visible au moment du calcul) — corrige ton cas si ton window manager/Chrome retarde le relayout ; sinon la marge horizontale corrigeait déjà les coupes gauche/droite. Si tu revois une coupe, noter la taille de fenêtre exacte.
- Les animations sont ralenties dans un onglet en arrière-plan (rAF suspendu, roue de secours bridée par Chrome) — comportement préexistant, hors périmètre.
- Parties solo créées pour la validation : SK8AUY (Grèce vs bot Allemagne, Pangée) — abandonnable depuis le lobby.

## Périmètre respecté

Règles intouchées, `orderShapeError` intouché, résolution intouchée, 3D intact (`render3d/` zéro diff), design de la vue ville inchangé (pas d'inclinaison, le zoom ne fait que cadrer le rayon), COLON-FONDATION non touché (`git status` vérifié avant édition — les fichiers non suivis d'Erik sont intacts).
