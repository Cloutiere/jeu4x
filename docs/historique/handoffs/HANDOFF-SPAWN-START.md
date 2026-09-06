# HANDOFF — Génération de carte : garantie de voisinage du Colon de départ

Tu reprends le pilotage pour un chantier **génération procédurale**, test-first. **Préalables :** `HANDOFF.md` §4, baseline **868+ tests** verts, `RULES.md` (6b/6c : miroir 1v1 R-102, checksum d'équité, seeds rejouables ; R-80 RNG), labo `#/progen` (calibrage visuel), `progen/` du moteur. `schemaVersion` **18 inchangée** (règle de génération, pas de données).

## Demande d'Erik (05/09 — fait foi)

Le **Colon de départ** doit être placé de sorte que :
1. **Parmi les 6 cases adjacentes** à sa case : **2 forêts, 2 prairies et 1 case d'eau** (la 6e case libre — 🔶 défaut : tout terrain productif non-montagne) ;
2. **AUCUNE ressource** dans les 6 cases adjacentes **ni dans les cases à distance 2** du Colon (rayon 2 — l'anneau intérieur ET l'anneau extérieur au sens hexagone : 6 + 12 cases).

Objectif : un démarrage équitable, lisible et préservé (le joueur développe SON neighbourhood sans qu'une ressource soit brûlée par la fondation D5 ou convoitée trop tôt).

## Décisions d'implémentation (défauts 🔶 — veto Erik)

- **Placement du spawn d'abord, carte ensuite** 🔶 (défaut) : choisir la position du spawn (critères existants : équidistance miroir ≥ 12 cases), puis **forcer le voisinage** (re-paint des 6 cases : 2 forêts, 2 prairies, 1 eau + 1 libre) **puis purger les ressources du rayon 2** — plutôt que filtrer des candidats (une carte procédurale ne garantit pas qu'un tel voisinage existe naturellement) ;
- **Miroir 1v1 (R-102)** : les deux spawns reçoivent le **même traitement** (même composition de voisinage — la 6e case peut différer 🔶 ; purge des ressources appliquée aux deux rayons) ; le **checksum d'équité** intègre ces garanties (composition identique des voisinages) ;
- **Cartes préfabriquées** 🔶 (pangee-40, variee-40, pedagogique-40) : audit — si leurs spawns actuels violent la garantie, **ajuster les cartes** (en gardant leur caractère pédagogique) et le documenter ;
- **Interaction avec la purge 7n/civ** : le rayon sans ressource est appliqué APRÈS le tirage des artefacts ? Non — les artefacts ne sont pas des ressources : la purge ne touque que les ressources R-91 ; les artefacts peuvent rester dans le rayon 🔶 (défaut : artefacts exclus de la purge, ce sont des entités disputées) ;
- **Huttes/barbares** 🔶 : sans contrainte nouvelle (règles 7d inchangées).

## Mission — livrables dans l'ordre

- **L0 — Règle rédigée (RULES.md, test-first)** : garantie de voisinage + purge rayon 2, valeurs data-driven (`progen` : composition du voisinage, rayon de purge — calibrables) ;
- **L1 — Moteur (test-first)** : génération conforme, miroir, checksum étendu ; **tests statistiques** (N seeds : 100 % des spawns conformes — 2F/2P/1E dans le voisinage, 0 ressource au rayon 2) ;
- **L2 — Labo `#/progen`** : affichage de la zone de garantie (anneau de purge, compte du voisinage) pour le calibrage visuel d'Erik ;
- **L3 — Vérification** : e2e génération complète (spawn conforme, fondation, purge D5 inchangée hors rayon), GUI labo, captures, CI, prod saine ;
- **Livraison** : rapport `REPORT-SPAWN-START.md`, commit, prod.

## Critères d'acceptation
- 100 % des seeds testés : voisinage 2 forêts + 2 prairies + 1 eau, **0 ressource au rayon 2** des deux spawns ;
- Miroir : les deux voisinages ont la même composition ; checksum d'équité étendu vert ;
- Cartes préfabriquées auditées/ajustées ; labo `#/progen` montre la garantie ;
- Baseline 868+ verts, typecheck vert, CI deploy vert, schemaVersion 18.

## Périmètre interdit (cette session)
Correctifs d'interaction (handoff parallèle) ; unités 3D ; atelier d'Erik (inspecter le répertoire avant commit) ; tout recalibrage des rendements ; renommage ; espionnage avancé.

## Fin de session
Rapport, arrêt, remise de la main au pilot.
