# PROJET — État du jeu 4X (clone Cyber Revolution)

**Tenue par le pilot, mise à jour à chaque acceptation de phase.** Erik ouvre ce document pour savoir où on en est ; tout agent neuf le lit pour le contexte en 2 minutes. Vision et architecture : [DESIGN.md](DESIGN.md). Spécification normative : [RULES.md](RULES.md). File d'attente détaillée et mémoire de pilotage : [PILOT-HANDOFF.md](PILOT-HANDOFF.md). Index de tous les documents : [docs/index.md](docs/index.md).

**Production** : [game-4x-server-prod.erik-ai-studio.workers.dev](https://game-4x-server-prod.erik-ai-studio.workers.dev) · **868+ tests verts** · `schemaVersion` **18** · budget Cloudflare tenu (~5 $/mois).

---

## ✅ Réalisé (dans l'ordre)

| Phase / chantier | Contenu |
|---|---|
| 0→6c | Moteur déterministe, réseau DO/WS/OAuth, rendu PixiJS, **1re partie 1v1 en ligne**, durcissement + CI/CD, économie des terrains, génération procédurale miroir + labo `#/progen` |
| 7a→7e | Technologies (46 techs, arbre complet), refonte du menu de ville, 22 ressources, barbares & huttes, unités terrestres + R-59 + Colon 2 pop |
| 7f→7i | **Culture** (GP, jalons, victoire culturelle), **naval & espionnage**, **gouvernements** (+ victoire scientifique), **alignement du moteur de ville** sur CivRev (consommation, seuils, fondation par ère) |
| 7j | **Personnages Illustres** : 6 classes canoniques, choix Consume/Settle, Grand Humanitaire, ciblage technologique |
| 7k | **Merveilles** : obsolescence globale, exclusivité, récupération de marteaux, effets restants + audit des actives |
| 7l | **Or & trésorerie** : rush-buy, paliers économiques, **victoire économique** (4 victoires jouables), Explorateur consume |
| 7m | **Nucléaire & espionnage de base** : Manhattan→ICBM unique, SDI, espion (6 actions, duels), garnison |
| 7n | **16 civilisations** (bonus de départ + d'ère cumulatifs, unités uniques), ères par comptage 5/14/24 |
| 7o | **Artefacts** (6 reliques, tirage seedé, placement insulaire, Atlantide) |
| Chantier V1 | **Rendu du jeu en vraie 3D** (Three.js, Option B hybride — terrain 3D + surcouche sprites) — ✅ accepté par Erik |
| Chantier V2 | **Structures 3D** : cartes-ressources en slots (état neutre avant tech), ville = Nœud Serveur, cratère, huttes/camps — ✅ accepté |
| Bot solo | **Partie solo contre le bot** (bot interne du GameDO, case au lobby) — ✅ accepté, 1re partie solo jouée en ligne |
| Atelier | **Page `#/atelier`** + rituel [ATELIER-ASSETS.md](ATELIER-ASSETS.md) — Erik y retouche ses assets en sessions libres |

## 🚧 En cours / prêts à lancer

1. **INTERACTION-3D** — déplacements refusés à tort (ville, case amie libérable) + re-clic des worked tiles (`HANDOFF-INTERACTION-3D.md`) ;
2. **SPAWN-START** — voisinage du Colon garanti (2 forêts, 2 prairies, 1 eau) + 0 ressource au rayon 2 (`HANDOFF-SPAWN-START.md`) ;
3. **CENTREVILLE** — socle garanti 1N/1P/1C (`HANDOFF-CENTREVILLE.md`) ;
4. **UNITES-3D** — brancher les créatures 3D d'Erik (Script de Base, Sentinelle Réseau) au monde de jeu (`HANDOFF-CHANTIER-V2-UNITES3D.md`) ;
5. **ATELIER** — sessions de retouche en cours (Erik + agent, rituel `ATELIER-ASSETS.md`) ;

## 📋 File d'attente

- **V3 — Renommage thématique** : libellés FR nanotech (ids code inchangés) ;
- **Espionnage avancé** (BACKLOG idée 5) : infiltration, XP, points d'espionnage, menu de renseignement, fenêtre d'annulation — rapport de recherche 4X commandé par Erik ;
- En suspens : territoire/frontières (flip culturel, Hollywood), sauts technologiques ; docs de recherche attendus : XP & promotions, territoire ;
- Arbitrages 🔶 en attente d'Erik : liste consolidée dans [PILOT-HANDOFF.md](PILOT-HANDOFF.md) §dernier item.

## 📚 Où est quoi (règles d'emplacement)

- **Racine** : documents vivants uniquement (cette page, DESIGN, RULES, BACKLOG, HANDOFF, PILOT-HANDOFF, ATELIER-ASSETS, handoffs actifs) ;
- `docs/recherche/` : **les specs d'Erik** — recherches CivRev, elles font foi sur toute valeur ;
- `docs/historique/handoffs|rapports/` : archives des phases terminées ;
- **Conventions agent** : [HANDOFF.md](HANDOFF.md) §4 — notamment : *les documents de recherche sont des spécifications de référence, ils ne contiennent aucune mission ; ta mission est dans ton handoff.*
