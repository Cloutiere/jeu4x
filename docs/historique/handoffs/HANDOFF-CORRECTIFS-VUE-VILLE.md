# HANDOFF-CORRECTIFS-VUE-VILLE — Deux signalements d'Erik en conditions réelles (Chrome, 100 %)

**Chantier correctif du chapitre 2D.** Deux bugs trouvés par Erik sur SA machine (Chrome, zoom navigateur 100 %) que l'automatisation n'a pas vus — piège viewport connu du projet (PILOT-HANDOFF §5).

## 1. Préalables

1. Lire `docs/historique/rapports/REPORT-MENU-VILLE.md` (pose `poseVueVillePour`, masquage des unités, sorties de vue), `PILOT-HANDOFF.md` §5 (piège viewport 1280×720).
2. Baseline : suite verte (**1091 tests**), typecheck 4/4, `schemaVersion` **22**, `git status` propre. Rendu 2D = seul chemin actif.
3. **Zéro gameplay** — affichage seul.

## 2. Signalement 1 — Le zoom de la vue ville est trop fort (18e tuiles coupées)

**Constat Erik** : à 100 % dans Chrome, la vue ville ne montre que les **6 cases** autour de la ville — le rayon 2 (18 tuiles avec Tribunal) est hors cadre ; et le rendu diffère entre son Chrome et l'outil d'automatisation (viewport différent).

**Mission M1** :
1. Diagnostiquer `poseVueVillePour` : l'échelle doit être calculée sur l'espace **réellement disponible** (dimensions CSS de la fenêtre moins le panneau de ville), pas sur une taille supposée — vérifier DPR/zoom navigateur (les CSS px absorbent le zoom, mais toute constante codée en dur ou valeur de l'outil de dev casse le calcul).
2. **Contrat verrouillé par tests à plusieurs tailles de viewport** (ex. 1280×720, 1536×864, 1832×1078, 2560×1440 — et fenêtre étroite) : **TOUTES** les tuiles du rayon (6 OU 18), sommets compris, tiennent dans l'espace libre, quelle que soit la taille — au pire le zoom est plus petit, jamais de tuile coupée.
3. Le recalcul au redimensionnement (ResizeObserver existant) doit marcher aussi au premier affichage sur une fenêtre déjà petite.

## 3. Signalement 2 — Les unités ne réapparaissent pas à la sortie de la vue ville

**Constat Erik** : en sortant de la vue ville (fermer), les unités ne reviennent pas — il faut rafraîchir le navigateur.

**Mission M2** :
1. Diagnostiquer le masquage des unités (v2 de MENU-VILLE) : la restauration au retour en vue carte est incomplète ou dépend du chemin de sortie. **Les TROIS sorties** (bouton Fermer, Échap, double-clic hors ville) doivent restaurer exactement l'état d'avant l'entrée : sprites d'unités, surcouche de guerre (flèches, croix d'attaque, disputées, fantômes, chemins gelés, badges, sélection), colonne de droite.
2. Verrouiller par tests le cycle complet **entrée → sortie × 3 chemins** (rendu reconstruit avec unités visibles) ; cause racine corrigée, pas de correctif cosmétique (si le masquage avale un calque ou vide un conteneur, la sortie doit le repeupler — même philosophie que la purge des caches de la bascule 2D↔3D d'antan).
3. e2e en conditions réalistes : **viewport variable** (pas seulement l'outil par défaut), cycle entrée/sortie répété deux fois de suite.

## 4. Vérification

- Captures `dev-logs/captures-correctifs-vue-ville/` : vue ville sur viewport étroit (18 tuiles visibles entières), sortie par les 3 chemins avec unités revenues.
- Suite verte forcée, typecheck 4/4, `schemaVersion` 22, zéro diff 3D, zéro gameplay.

## 5. Périmètre interdit

- Les règles, `orderShapeError`, la résolution ; le 3D (contrainte dure) ;
- Le design de la vue ville (l'inclinaison reste retirée — décision Erik ; le zoom se limite à cadrer le rayon) ; COLON-FONDATION (chantier parallèle éventuel — vérifier `git status` avant d'éditer).

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** — et cette fois **à plusieurs tailles de viewport** dans l'outil, Erik revalidera sur son Chrome. Rapport `REPORT-CORRECTIFS-VUE-VILLE.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
