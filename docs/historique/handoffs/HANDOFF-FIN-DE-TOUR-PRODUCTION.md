# HANDOFF-FIN-DE-TOUR-PRODUCTION — Impossible de terminer le tour sans production ni recherche sélectionnée (points résiduels compris)

**Chantier gameplay du chapitre 2D.** Spécification d'Erik du 18/09 : le joueur **ne peut pas finaliser son tour** s'il laisse des capacités sans emploi :

1. **Production** : une ville qui **génère des marteaux** (production/tour > 0) **ou** qui porte un **résiduel de marteaux** (réserve C7 — ex. une construction vient d'être complétée) doit avoir **une production sélectionnée** pour terminer le tour — même si elle ne cultivera aucun terrain productif au prochain tour ;
2. **Recherche** : si le joueur **produit de la science** (science/tour > 0) **ou** a des **points de recherche non utilisés** (résiduel d'une recherche complétée, bonus de hutte…) il doit avoir **une recherche sélectionnée** pour terminer le tour — l'exemple d'Erik : une hutte donne +20 recherche sans recherche sélectionnée → sélection obligatoire avant la fin du tour.

## 1. Préalables

1. Lire `RULES.md` (R-62 files, R-66, C7 réserve permanente de marteaux — §8.7, R-134 surplus de recherche → or, R-63), `packages/rules/src/research.ts` (le `treasury += overflow` actuel) ;
2. Baseline : suite verte (**1237 tests**), typecheck 4/4, `schemaVersion` **25 → 26** attendue (voir M1.2), `git status` propre.
3. **Test-first** ; serveur autoritaire : le blocage se valide **des deux côtés**.

## 2. Mission

### M1 — Moteur (test-first)
1. **Prédicat pur `blocagesFinDeTour(player, state)`** : retourne la liste des blocages (ville id + raison, recherche + raison) — consommé par l'UI ET par la validation serveur (source unique) :
   - Ville avec `production/tour > 0` OU réserve C7 > 0 ET file de production vide → blocage ;
   - Joueur avec `science/tour > 0` OU résiduel de recherche > 0 ET aucune recherche sélectionnée → blocage ;
   - **Exceptions** : ville à 0 marteaux sans réserve (jamais bloquée) ; **arbre de recherche épuisé** (plus rien de disponible) → le blocage recherche est levé ;
2. **Nouveau champ d'état `rechercheResiduelle`** (par joueur) : les points de recherche non consommés (complétion de recherche, bonus de hutte sans sélection) **y persistent** et s'appliquent à la **prochaine recherche sélectionnée**. 🔶 **Révision R-134 à valider par Erik** : la conversion automatique du surplus en or disparaît AU PROFIT du résiduel (le surplus ne devient de l'or QUE si Erik le maintient pour un cas précis — à consigner) ;
3. **Validation serveur** : l'ordre/le flux `EndTurn` est rejeté avec la liste des blocages si le prédicat n'est pas vide (l'ordre reste de la même forme — `orderShapeError` inchangé, la validation est sémantique) ; bot et barbares inclus (le bot doit sélectionner ses productions/recherches — vérifier `botPolicy` et le corriger si nécessaire) ;
4. **Migration `schemaVersion` 25 → 26** : champ `rechercheResiduelle: 0` additif, idempotent ; le surplus existant des parties en cours bascule dans le résiduel.

### M2 — UI (transparence pédagogique, ton habituel)
1. Le bouton **« Terminer le tour »** est désactivé avec la **liste des blocages** (libellés : « Ville1 : sélectionnez une production », « Recherche : sélectionnez une technologie (+12 points en attente) ») ;
2. Les panneaux concernés (CityPanel/CityView si ouvertes, ResearchPanel) signalent l'état bloquant ;
3. Les tooltips/hints reflètent le résiduel de recherche (X points en attente).

### M3 — Vérification
1. Tests : chaque règle (production/tour, réserve résiduelle, science/tour, résiduel recherche, hutte +20 sans sélection, arbre épuisé, ville à 0), serveur rejette l'EndTurn bloqué, bot conforme, migration 26 ;
2. e2e + partie solo (captures `dev-logs/captures-fin-de-tour/`) : compléter une construction avec résiduel → bouton bloqué → sélectionner → débloqué ; hutte recherche sans sélection → bloqué ; fin de tour normale inchangée ;
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 26, zéro diff 3D.

## 3. Périmètre interdit

- Le calibrage (C7, T-xx), les files elles-mêmes, la résolution Phase C (le blocage est PRÉ-résolution) ; le 3D ; `assets-src` (atelier parallèle éventuel).

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-FIN-DE-TOUR-PRODUCTION.md` (y compris : le sort final de R-134 conversion-surplus, le comportement du bot, le cas arbre épuisé), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
