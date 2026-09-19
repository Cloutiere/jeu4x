# HANDOFF-RESOLUTION-DEPLACEMENTS — Le colon doit fonder là où le guerrier est parti + messages nommés + historique d'événements

**Chantier gameplay + UI du chapitre 2D.** Constats d'Erik du 18/09 (trois points).

## 1. Préalables

1. Lire `RULES.md` (R-41 déplacements et cases amies, R-158 MultiStep, ENGAGEMENT R-173..R-183 — **la cohabitation amie est légale partout**, R-176a, R-159 rév. B), `docs/historique/rapports/REPORT-ENGAGEMENT.md` ;
2. Baseline : suite verte (**1247 tests**), typecheck 4/4, `schemaVersion` **25**, `git status` propre ;
3. **Test-first** pour le bug 1 (reproduction exacte d'Erik d'abord) ; la trace de résolution (`REPORT-TRACE-RESOLUTION.md`) est l'outil de diagnostic.

## 2. Bug 1 — Le colon ne peut pas fonder sur la case que le guerrier quitte

**Reproduction d'Erik** : colon et guerrier côte à côte ; guerrier programmé vers une autre case ; colon programmé sur la case du guerrier **avec fondation finale** ; fin de tour → l'ordre du colon est **annulé**, pas de ville, colon revenu à sa case. Attendu : comme le guerrier quitte la case, le colon **entre et fonde**.

**Diagnostic attendu** : un reste du contrat R-41 pré-ENGAGEMENT (case amie occupée = mouvement refusé) appliqué au moment de la résolution — alors que la cohabitation amie est désormais légale (R-30 amendée / ENGAGEMENT) et que le guerrier a quitté la case en Phase A. La séquence des mouvements (qui entre d'abord) peut créer la fenêtre de refus.

**Mission** :
1. Reproduire au **labo** + via la **trace** (positions par phase, raison d'annulation exacte) ; identifier la vérification fautive (entrer sur case amie non encore évacuée ? validation de fondation sur l'état pré-mouvement ?) ;
2. Contrat visé (à confirmer par le comportement) : le mouvement ami entre sur la case (cohabitation légale) ; si le guerrier la quitte, le colon y fonde ; si le guerrier y RESTE, le colon cohabite (case instable) et la fondation se fait **sur la case occupée par le cohabitant** ? — **point à arbitrer avec Erik EN SESSION** (option A : la fondation déplace le cohabitant d'une case ; option B : la fondation est annulée si la case reste cohabitée à l'arrivée) ; par défaut : le mouvement ne s'annule JAMAIS pour cause de case amie (cohérence ENGAGEMENT), seule la fondation obéit à l'option retenue ;
3. Tests : la reproduction exacte d'Erik (guerrier part → ville fondée), guerrier reste (option tranchée), échange de cases (voir bug 2), ordre conservé/annulé.

## 3. Bug 2 — L'échange de cases : refusé (correct), mais le message doit nommer la cause

Deux unités amies programmées pour intervertir leurs positions → refus actuel : « Déplacement impossible (chemin bloqué ou invalide) » (`feedback.ts` ligne 44). **Le refus est correct** ; le message doit devenir explicite : **« Deux unités ne peuvent pas interchanger de position »** (détection : chemin de 1 case vers une case amie qui se programme elle-même vers la case de l'unité — déterministe, ou détecté à la résolution). À traiter avec le bug 1 : la règle d'interdiction d'échange doit rester cohérente avec l'option retenue en §2 (si le cohabitant-restant débloque la fondation, l'échange simple reste refusé — c'est la règle voulue).

## 4. Fonction — Historique d'événements dans le menu de droite + retrait du menu Course à l'espace

1. Les messages transitoires actuels (refus d'ordre, avertissements, **bonus de découverte de hutte**, éléments de type feedback) alimentent un **historique d'événements persistant** dans le menu de droite (chronologique, lisible — style du journal existant, x tours affichés avec horodatage de tour) ;
2. Le **menu « Course à l'espace » est retiré** du menu de droite ; il réapparaîtra **uniquement lorsqu'un premier bâtiment du vaisseau spatial est construit** (condition data-driven : apparition à la première complétion d'un item de vaisseau) ;
3. Zéro gameplay : c'est de la présentation et de l'accumulation d'affichage (les événements existent déjà — les capter pour l'historique).

## 5. Vérification

- Tests : bug 1 (reproduction + option arbitrée), détection d'échange + message, historique (accumulation, retrait menu, apparition conditionnelle course à l'espace) ;
- e2e + partie solo (captures `dev-logs/captures-resolution-deplacements/`) : le scénario exact d'Erik (guerrier part, colon fonde), l'échange avec le nouveau message, l'historique qui garde hutte/avertissements, course à l'espace absente puis présente après premier bâtiment de vaisseau ;
- Suite verte forcée, typecheck 4/4, `schemaVersion` 25 (sauf besoin signalé), zéro diff 3D.

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-RESOLUTION-DEPLACEMENTS.md` (y compris : l'option de fondation avec cohabitant arbitré par Erik, le mécanisme de détection d'échange), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
