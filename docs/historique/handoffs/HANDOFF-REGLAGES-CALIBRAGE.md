# HANDOFF-REGLAGES-CALIBRAGE — Trois réglages d'Erik : GP américain tiré au sort, vision +1 sur colline, navigation des unités sans ordre

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (R-114 canaux GP, R-150 civSetup, vision/fog — règles de vision actuelles), `HANDOFF.md` §4, `PROJET.md`. Baseline : suites vertes, prod 200. **2D uniquement.** Ce sont des réglages de calibrage demandés par Erik (29/09) — chacun petit, test-first, data-driven.

## 1. Réglage 1 — GP gratuit de départ d'Amérique : tirage seedé parmi les 6 classes

**Constat d'Erik** : le GP gratuit d'Amérique (bonus de départ, civSetup) est SYSTÉMATIQUEMENT l'artiste. **Décision (réponse Erik 29/09) : tirage seedé uniforme parmi les 6 classes** — chaque partie peut offrir un GP différent, déterministe par seed (même seed → même classe), fidèle à l'esprit « un GP gratuit » du bonus.

- Implémentation attendue : dans le civSetup (R-150) ou la création de l'état — RNG **dédié dérivé du seed** (jamais le RNG de résolution, précédent R-154/artefacts), uniforme sur les 6 classes (`artiste_penseur`, `batisseur`, `humanitaire`, `explorateur`, `leader`, `savant`), jalon/compte `greatPersonsObtained` mis à jour comme pour tout GP d'octroi (rotation des octrois hors canal culture inchangée — R-127 abrogée).
- Tests : distribution sur N seeds (les 6 classes sortent), déterminisme (même seed → même classe), les autres civs non affectées, parties existantes : migration non requise (état de départ — nouvelles parties seulement), `schemaVersion` inchangée si le champ d'état est identique.
- RULES.md : la ligne Amérique du civSetup doit être mise à jour (classe déterministe → tirage seedé uniform) — l'agent propose le texte, le pilot committera le réalignement avec la livraison.

## 2. Réglage 2 — Vision +1 pour une unité terrestre positionnée sur une colline

**Demande d'Erik** : le champ de vision augmente d'une case quand une unité terrestre est positionnée sur une colline.

- Implémentation data-driven : bonus de vision du terrain **colline** (`terrain.json` ou config de vision — ex. `bonusVision: 1`) appliqué aux unités **terrestres** dont la case courante est une colline. Vérifier TOUS les consommateurs de la vision : filtrage fog serveur (autoriaute), calcul de visibilité client, affichage des contours de zone visible, espionnage éventuel. La vision de base des unités reste inchangée.
- Précisions tranchées (défauts) : s'applique **positionnée ou fortifiée** (peu importe l'ordre), **pas** aux unités embarquées (transport naval = vision du navire), **pas** aux barbares (leurs spawns ne changent pas), et ni aux villes ni aux aériens (hors sujet). Barbares vus par le joueur : oui, via la vision normale du joueur.
- Tests : +1 au rayon effectif sur colline (unité terrestre), pas de bonus sur les autres terrains, pas de bonus embarquée, fog serveur et client cohérents (l'unité voit le même rayon des deux côtés), parties existantes reprises sans erreur.

## 3. Réglage 3 — Menu « unités sans ordre » : boutons Voir / Suivant

**Demande d'Erik** : quand le menu signale les unités n'ayant pas encore reçu d'ordre, ajouter des boutons pour **« Voir »** l'unité et **« Suivant »** s'il y en a plusieurs : l'unité se sélectionne et **l'écran se déplace sur elle SANS modifier le zoom** (le zoom courant de l'utilisateur est préservé — exactement le comportement `centerOnHex` du journal cliquable, REPLAY-RESOLUTION).

- Implémentation : la liste des unités sans ordre existe déjà (menu de fin de programmation — fichier:ligne à trouver). Ajouter : bouton **Voir** (sélectionne l'unité — même pipeline que le clic sur la carte, panneau unité ouvert — et centre la caméra sur sa case, zoom inchangé) et bouton **Suivant** (passe à l'unité suivante de la liste, cyclique, avec indicateur « n / total »). Fermer/masquer le menu à la sélection si l'UX l'exige (à l'œil d'Erik, 🔶).
- Unités sans ordre **hors vision** : elles ne peuvent pas exister (ce sont les tiennes — tout ton empire est visible ; le cas ne se pose pas). Unité morte entre-temps (résolution) : la liste est recalculée au moment de l'ouverture, jamais stale.
- Tests : Voir centre et sélectionne (delta caméra = centrage seul, zoom inchangé — test analogue à celui du journal), Suivant cycle dans l'ordre déterministe (R-81), 1 seule unité = Voir seul (pas de Suivant), menu recalculé après ordre donné.

## 4. Vérification

- Suites vertes + typecheck ; e2e solo : GP américain variable selon seeds (2 seeds → 2 classes), vision colline (une tuile de plus révélée au déplacement sur colline), navigation sans ordre (2 unités → Voir/Suivant cycliques, zoom préservé).
- **Captures `dev-logs/captures-reglages-calibrage/`** avant tout commit : les 3 réglages en action.
- **ARRÊT POUR APPROBATION D'ERIK** avant commit (règle d'Erik — il teste ces réglages en conditions réelles, le contexte est sa session de calibrage personnel).

## 5. Critères d'acceptation

1. GP d'Amérique : les 6 classes sortent sur N seeds, déterministe par seed, R-127 non réactivé (octroi, pas ciblage).
2. Colline : +1 case de vision pour les unités terrestres, serveur et client cohérents, data-driven.
3. Voir/Suivant fonctionnent, zoom préservé, sélection ouvre le panneau unité, cycle déterministe.
4. Zéro migration nécessaire ; suites vertes ; zéro impact JEV/sableuse ; fichiers d'Erik intacts.

## 6. Périmètre interdit

- Toute autre valeur de règle (le contexte est la passe de calibrage personnelle d'Erik — on ne touche qu'aux 3 réglages) ; les traits des autres civs ; le canal culture R-114 ; la conversion R-90 ; 3D ; la sableuse.
