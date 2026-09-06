# HANDOFF — Correctifs du mode solo : 3 signalements d'Erik (05/09)

Tu reprends le pilotage pour une mission **d'enquête + correctif**, test-first. **Préalables :** `HANDOFF.md` §4, baseline **868+ tests** + typecheck verts, `RULES.md` (R-92/93 ressources et révélation, R-87 filtrage de production, R-95/98 barbares et huttes, R-138 ICBM `strategic: true`, R-148 uniques). `schemaVersion` **18 inchangée** sauf si un vrai bug moteur l'exige. Contexte : Erik joue sa **première partie solo en prod** (contre le bot interne) et signale trois anomalies — l'une est sûrement un bug sérieux de filtrage, l'autre une confusion possible de vocabulaire à instruire.

## Signalement 1 — ICBM disponible en production dès le début de partie (GRAVE, corriger d'abord)

**Constat** : au début de partie, **sans aucune technologie**, le menu de production d'Erik propose « Missile ICBM ».

**Canon attendu (R-138, 7m)** : l'ICBM porte `strategic: true` — elle est **ni produite par les files ni achetable** (`isProducible`/`canSetProduction` refusent) ; elle est **instanciée dans la ville** qui complète le **Projet Manhattan** (750 marteaux, tech Théorie atomique). Réponse à la question d'Erik : **oui, il faut construire le Projet Manhattan** — le missile n'est jamais dans une file.

**Enquête** : le fix `1393fe4` (bot-solo) a aligné **le tirage du bot** sur `canSetProduction` — soupçon fort : le **menu de production UI** (CityPanel ou le listing des items) n'applique pas le même filtrage (ni `strategic`, ni R-87 tech débloquée ?). Vérifier AUSSI si `SetProduction` côté serveur refuse réellement (le validateur protège-t-il ?) — si l'UI ment mais le serveur protège, le bug est UI ; si le serveur accepte, c'est un trou moteur (GRAVE — une ICBM produisible dès le tour 1).

**Correctif + test** : le menu ne liste QUE les items passant `isProducible`/`canSetProduction` (source unique partagée — pas de liste dupliquée) ; test « début de partie, aucune tech → l'ICBM est absente du menu ET refusée par SetProduction » ; e2e où l'ICBM n'apparaît qu'après Manhattan.

## Signalement 2 — Ressources visibles sans la technologie associée

**Constat** : Erik voit les ressources (identité) alors que la technologie associée (`revealedByTech`, R-92) n'est pas découverte.

**Canon attendu (R-92)** : la **présence** est visible, l'**identité masquée** — marqueur « ? » / carte **neutre grise** dans le langage 3D (V2), jusqu'à la découverte. Exception canon : civ **Inde** (`toutesRessources`, R-146) — vérifier quelle civ Erik jouait (si Inde, le comportement est CORRECT — le confirmer et clore).

**Enquête** : le labo applique la carte neutre (états testés), mais **le vrai jeu** passe-t-il le marqueur filtré au calque cartes-ressources, ou l'id réel ? Vérifier `GameCanvas`/`structures3d` : si la carte 3D lit la ressource brute de l'état non filtré → cartes identifiées avant la tech (bug). Comparer au rendu 2D (qui respectait R-92).

**Correctif + test** : le calque cartes consomme le marqueur R-92 de l'état filtré (source unique) ; test « avant la tech : carte neutre sans identité ; après : carte pleine » en conditions de jeu réelles.

## Signalement 3 — « Guerriers ennemis sortis d'une hutte alliée »

**Constat** : Erik a vu des guerriers **ennemis** apparaître autour de ce qu'il croit être une **hutte** amie.

**Instruction d'enquête (ne pas préjuger)** : distinguer les **huttes bonus** (R-98, inoffensives, disparaissent à l'ouverture) des **villages/camps barbares** (7d : les barbares **rôdent et sortent des camps** — comportement canon et voulu). L'entité vue était-elle une hutte (icône bonus) ou un village barbare ? Est-elle « amie » au sens propriétaire, ou simplement proche/connue ? Le journal de la partie d'Erik et le dump admin de sa partie en prod permettront de trancher (quels spawns, quelles cases). **Trois issues possibles** :
- (a) confusion visuelle hutte ↔ village barbare → **correctif de lisibilité** : les deux structures 3D doivent être immédiatement distinguables (formes/couleurs distinctes — d'autant plus nettes que le langage cyber les réinvente : hutte = borne bienveillante, camp = structure hostile) ;
- (b) les barbares spawnaient réellement depuis une entité hutte → **bug moteur grave** (audit `barbares.ts`/`map.ts`, test de non-spawn sur hutte) ;
- (c) les barbares venaient d'un camp légitime que Erik prenait pour une hutte → documentation/tooltip.
Trancher avec les faits, corriger selon l'issue, et **expliquer le résultat dans le rapport** (Erik pose la question : « est-ce moi qui ai mal vu ou c'est possible ? » — il attend une réponse claire).

## Mission — livrables
Correctifs test-first dans l'ordre 1 → 2 → 3 (e2e + tests moteur/UI citant R-138/R-87, R-92/93, R-95/98), vérification en **partie solo réelle** (le banc parfait : ICBM absente du menu au tour 1, cartes neutres avant tech, spawns barbares identifiables), captures `dev-logs/captures-correctifs-solo/`, CI, prod saine, rapport `REPORT-CORRECTIFS-SOLO.md` avec **la réponse d'enquête au signalement 3**. Baseline 868+ tests verts, schemaVersion 18 sauf nécessité démontrée.

## Périmètre interdit
V2 unités 3D (chantier parallèle — ne pas toucher) ; atelier d'Erik (inspecter le répertoire avant de commit — ses retouches ne partent pas) ; renommage ; espionnage avancé.

## Fin de session
Rapport, arrêt, remise de la main au pilot.
