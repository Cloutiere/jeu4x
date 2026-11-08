# HANDOFF-DIPLOMATIE-T2 — La négociation : paix avec compensation, échanges de technologies

**Décisions Erik 28/10** (« oui » — horizon 2 ; le calibrage de la production offensive attendra le banc post-T2). Le joueur négocie avec les bots : paix avec compensation, technologies contre technologies ou contre or — le bot répond de façon seedée selon son rapport de forces et sa civ. Jev héritera de ces interfaces.

## 1. Préalables

- Lire DIPLOMATIE-T1 (`wars`, `DeclareWar`, état PUBLIC des guerres), BOT-TC (paix minimale : `ProposePeace`, acceptation perdante/`duréeMin`), HORLOGE-DISTANCE (`dureeMinGuerre`, paix du gagnant), R-135 (valeurs des techs pour l'évaluation), R-146 (traits), `pastilles.ts` (point d'entrée UI), Chroniques, R-73 (fog).
- Baseline : suites vertes à jour (rules 1101 / server 314 / web ~700), `schemaVersion` 28. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Négociation PRIVÉE** : les offres et réponses ne sont connues que des DEUX parties (miroir des guerres publiques) ; Chroniques privées (« Rome accepte ta paix contre 50 or »). Le fait d'avoir signé une paix reste public (l'état `wars` l'est déjà).
- **D2 — Paix avec compensation** : `ProposePeace` ÉTENDU d'un champ optionnel `goldOffer` (or versé au bot si acceptation — additif, `orderShapeError` EN PREMIER) ; à l'acceptation, l'or passe, la guerre purgée (mécanique HORLOGE-DISTANCE inchangée pour le reste : duréeMin, gagnant 2×).
- **D3 — Échange de technologies** : nouvel ordre `TradeTechs { target, techOfferte, techDemandee? }` — un échange 1:1 (ma tech contre la tienne) OU ma tech contre de l'or (`techDemandee` absent → l'or demandé est un champ `goldDemande` 🔶 forme exacte au choix de l'agent, une seule forme canon). Validations : les DEUX techs connues de leurs donneurs, pas déjà connue du receveur, pas en anarchie. À l'acceptation à la résolution : échange atomique, événement `TechTraded` (privé).
- **D4 — Le bot décide seedé** : fonction d'évaluation data-driven — valeur de l'offre (coûts R-135 des techs, or offert) pondérée par son rapport de forces et son `agressivite` (une civ fière exige plus) ; réponses possibles : accepter / refuser / **contre-proposer** (demander plus d'or — une seule itération, simple) ; tirage seedé dédié (miroir R-154) ; jamais d'échange de techs avec une nation en GUERRE (canon : on ne livre pas l'ennemi).
- **D5 — UI** : depuis la pastille de nation (détail existant), un bouton « Négocier » ouvre une modale AAA compacte : proposer la paix (+ curseur d'or), proposer un échange (sélecteurs techs or/or), avec la réponse du bot en retour (toast + Chronique privée). Bots entre eux : PAS de négociation (le joueur est le seul initiateur — Jev apportera l'initiative plus tard).
- **D6 — Zéro état persisté** : les offres se résolvent À LA RÉSOLUTION (pas d'offres en attente entre tours) — aucune migration attendue ; `schemaVersion` 28.
- **D7 — Intouchés** : les guerres/attaques (T1), l'horloge de paix (HORLOGE-DISTANCE), le cycle bot offensif (calibrage post-T2 au banc), T3 (ONU/Grande Muraille), le fog du bot.

## 3. Mission

- **L1 — test-first (moteur + serveur)** : `orderShapeError` des nouvelles formes (EN PREMIER) ; paix compensée (acceptation → or transféré, refus → rien) ; TradeTechs (échange 1:1, tech contre or, refus si déjà connue/en guerre, atomique) ; décisions du bot (accepte offre généreuse, refuse insulte, contre-propose dans la zone grise — déterministe par seed) ; négociation privée (fog : l'autre joueur ne voit RIEN) ; reprise de partie.
- **L2 — moteur + serveur** (D2-D4), protocole.
- **L3 — client** : modale de négociation (D5), réponses et Chroniques privées ; aucune fuite d'information.
- **L4 — captures GUI avant commit** (`dev-logs/captures-diplomatie-t2/`) : paix refusée puis acceptée avec compensation ; échange de techs réussi et refusé ; privacité (l'écran d'un troisième joueur ne montre rien).
- **L5 — banc post-T2** : relancer le banc 40×3 — tableau de l'évolution des dynamiques de paix (durées, acceptations compensées) SANS cible de conquête cette fois (le calibrage offensif vient après, sur ce nouveau système) ; RULES.md (§diplomatie — T2), commit, push, rapport `REPORT-DIPLOMATIE-T2.md`.

## 4. Critères d'acceptation

1. Tu négocies avec un bot et il répond (accepte/refuse/contre-propose) de façon lisible et déterministe ;
2. Paix compensée et échanges de techs fonctionnent, atomiques et privés ;
3. Aucun échange avec l'ennemi en guerre ; reprise de partie propre ;
4. Suites et typecheck verts, `schemaVersion` 28.

## 5. Périmètre interdit

Calibrage de la production offensive (post-T2 au banc), bots initiateurs de négociation (Jev plus tard), T3 (ONU victoire, Grande Muraille paix), alliances, tout le 3D, `schemaVersion` sauf nécessité démontrée.

## 6. Fin de session

Rapport (grille de décision du bot, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
