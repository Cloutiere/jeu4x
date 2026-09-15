# HANDOFF-FUSION-MENU-VILLE — Supprimer l'ancien panneau de ville, fusionner ses barres dans la vue ville

**Chantier UI du chapitre « menus » (chapitre 2D).** Décisions d'Erik du 14/09 : l'ancien panneau de ville (`CityPanel`, clic simple) a un **meilleur visuel pour les barres** — il est supprimé et ses bons éléments migrent dans la vue ville (`CityView`). Dans le nouveau menu, **seul le choix de production est validé tel quel**.

## 1. Préalables

1. Lire `RULES.md` (R-60 worked tiles, R-63 croissance, R-90 conversion commerce, R-113 culture paliers T-27, R-162), `docs/historique/rapports/REPORT-MENU-VILLE.md` (CityView, vue modale, sorties), `PILOT-HANDOFF.md` §3-§4.
2. Baseline : suite verte (**1141 tests**), typecheck 4/4, `schemaVersion` **23**, `git status` propre (atelier assets en parallèle — ne pas toucher `assets-src`).
3. **Zéro gameplay** : la conversion R-90 garde sa sémantique moteur exacte (portage de contrôle, pas de règle nouvelle) ; `orderShapeError` inchangé.

## 2. Décisions tranchées (validées par Erik le 14/09)

1. **`CityPanel` est supprimé** ; **clic simple sur une ville = sélection muette** (pas de panneau) ; **seul le double-clic ouvre la vue ville**. La sélection muette conserve sa sémantique utile (état sélectionné pour les worked tiles à la carte si ce flux existe, alternances existantes) — vérifier qu'aucun flux ne dépendait du panneau (sinon le porter, pas le perdre).
2. **Barres de progression dans la vue ville** (style de l'ancien panneau, Erik tranche à l'œil) :
   - **Nourriture** : X / seuil (10 × pop actuelle) + tours restants — barre verte ;
   - **Culture** : progression **empire** vers le prochain palier T-27 (X / seuil) + culture/tour — barre ;
   - **Construction (NOUVELLE)** : marteaux investis / coût de l'item en file + tours restants — barre dans la carte Production ; à zéro marteaux (aucune file), état vide honnête.
3. **Le contrôle de conversion commerce → or/science (R-90) devient INTERACTIF dans la vue ville** (bouton ⇄ par ville, même ordre/sémantique moteur qu'aujourd'hui) — c'est un portage obligatoire : c'était le seul endroit où le joueur pouvait le changer.
4. **Le choix de production à onglets reste tel quel** (Erik l'aime) — aucune retouche.
5. Les chips « (1,8) (2,6) » de citoyens ne se portent PAS (la carte et la vue ville font le travail).

## 3. Mission

1. Portage des barres et du contrôle de conversion dans `CityView.svelte` (sources de vérité existantes : `toursAvantCroissance`, paliers T-27, `conversionGains`, file de production — aucun nouveau calcul moteur) ;
2. Suppression de `CityPanel` : clic simple = sélection muette ; vérifier tous les flux qui l'utilisaient (worked tiles à la carte, tooltips ALIGNEMENT — les porter s'ils étaient utiles), tests supprimés/réécrits ;
3. Les 3 sorties de vue ville, la vue modale, le cadrage du rayon : intacts ;
4. Tests : barres (valeurs, plafond, palier), conversion interactive (ordre émis, miroir), clic simple sans panneau, double-clic inchangé, aucun flux mort ;
5. e2e + captures `dev-logs/captures-fusion-menu-ville/` : vue ville complète avec 3 barres, conversion basculée or⇄science reflétée dans les chiffres, carte sans panneau au clic simple ;
6. Suite verte forcée, typecheck 4/4, `schemaVersion` 23, zéro diff 3D.

## 4. Périmètre interdit

- La sémantique R-90 (le joueur choisit or OU science par ville — inchangé), le moteur, `orderShapeError` ;
- Le choix de production à onglets (validé tel quel) ; le 3D ; `assets-src` (atelier parallèle).

## 5. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-FUSION-MENU-VILLE.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
