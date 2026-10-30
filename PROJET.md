# PROJET — État du jeu Eternal Empires (clone fidèle de Civ Revolution)

**Tenue par le pilot, mise à jour à chaque acceptation de phase — dernier point complet : 30/10.** Erik ouvre ce document pour savoir où on en est ; tout agent neuf le lit pour le contexte en 2 minutes. Vision et architecture : [DESIGN.md](DESIGN.md). Spécification normative : [RULES.md](RULES.md). File d'attente détaillée et mémoire de pilotage : [PILOT-HANDOFF.md](PILOT-HANDOFF.md). Index de tous les documents : [docs/index.md](docs/index.md).

**Production** : [game-4x-server-prod.erik-ai-studio.workers.dev](https://game-4x-server-prod.erik-ai-studio.workers.dev) · **~2 170 tests verts** (rules 1101 / server 369 / web 706 / sableuse 80) · `schemaVersion` **28** · budget Cloudflare tenu (~5 $/mois). Coquille Electron de distribution Windows en place.

---

## ✅ Réalisé — le socle (le jeu est complet sur les règles canon CivRev)

| Domaine | Contenu |
|---|---|
| Règles CivRev | 46 techs, 22 ressources, 16 civilisations + uniques teintées, 6 gouvernements, merveilles (obsolescence/exclusivité/récupération), artefacts, espionnage, nucléaire/SDI, caravane (80/50 or ×ère, capture paie le capteur), 4 victoires (domination/culture/science/économique) |
| Moteur | Déterministe seedé, tours simultanés, **monde cylindrique** Est↔Ouest (rendu sans couture), fog filtré serveur, embarquement programmé (rendez-vous virtuel, dépose en cours de chemin), bonus premier découvrir placés au meilleur bénéfice (navales jamais sur terre, Milice de bord) |
| Jouabilité 2D | UI Civ VI (Chroniques unifiées 7 catégories, bannière de ville + tooltips « pourquoi tant de tours », techtree plein écran d'Erik, préview vivante au survol, ordres d'unités Vendre/Soigner/Vigilance/Passer + raccourcis F/H/S/Z/B, orientation des unités, icônes 4K partout, décodeur de combat dans le rapport, god mode Ctrl+J→W) |
| Visuel | Toutes unités/villes/ressources en art 4K d'Erik, zones culturelles en dégradé continu, 8 tuiles terrain + tuiles-ressources révélées, atelier `#/atelier` + labos (progen, combat, culture) |
| Diplomatie | T1 : état Paix/Guerre public par paire, `DeclareWar`, gate d'attaque (espionnage et caravane exemptés) · T2 : négociation privée (paix compensée, échanges de techs, bot seedé par rapport de forces + agressivité) |
| IA | Bot standard à objectifs (patrouille en boucle, armées offensives R-31, économie arbitrée, guerre par agressivité de civ, paix au juste prix), **difficultés Facile/Normal/Difficile**, banc de calibrage 40×3 déterministe |
| Distribution | Coquille Electron Windows (tranche 1), Steam tranche 2 au backlog après approbation fiscale |

## 🤖 Le chapitre IA (octobre) — Jev et Zii en production

- **Jev** (modèle décisionnel `jev-latest`, SDK typesafe) : branché en prod via la fumée lobby — partie solo « contre Jev ». Bancs : v2 (37 guerres, 2 victoires par conquête), v3 (expansion : 2-6 villes/partie — 3 vérités moteur MultiStep découvertes), v4 (contact réel avant guerre : 0 déclaration avant rencontre). **Coût : ~0,02 $/partie** — non limitant.
- **Zii v1** (`b3d03d3`) : la « bouche de Jev » — second pipeline LLM sur les canaux du chat (CHAT-SOCLE) : salutations liées à la `sociabilite` de la civ, réponses par répliques structurées (le compte n'expose pas encore de modèle conversationnel), relais `resumePourJev` au condensé de Jev (prouvé), liste blanche + double barrière anti-injection, budget 0,05 $/partie.
- **Chat socle** (`17c467b`) : onglet 💬, canaux Général + individuels privés, popup de première rencontre, persistance serveur GameDO (hors état moteur) — format déjà pensé comme contexte futur du LLM.
- **Économie d'IA** : les bancs JEV/bot coûtent des fractions de dollar (0,02-0,6 $/mission LLM) ; garde-fou campagne 10 $.

## 🚧 En cours — LA mission active

- **HANDOFF-ZII-GLM-VOIX** (session d'agent EN COURS) : Zii passe aux réponses **générées** en langage naturel via GLM-5.3-Flash (API Z.ai compatible OpenAI, clé Erik posée en `.dev.vars` local + secret prod `ZII_GLM_API_KEY` — posée, l'agent la consomme). Répliques v1 = repli ; liste blanche/anti-injection/budget inchangés. ⚠ Fichiers en cours chez l'agent : `apps/server/src/zii/` (orchestre, zii.ts, glm.ts), `apps/server/tests/zii-glm-voix.test.ts` — ne pas toucher.
- **Entrelacement de sessions — leçon du 29/10** : deux missions parallèles sur un point de jonction (tests croisés `jev-port`) ont fait tomber les 2 Deploys ; fixé par SYNC-JEV-PORT (`c9a3710`, Deploy vert). Règle : les sessions qui partagent un point de jonction rejouent la suite complète avant tout push.

## 📋 File d'attente (dans l'ordre convenu avec Erik)

1. **Accepter ZII-GLM-VOIX** (rapport attendu) → validation par Erik : discuter avec Zii en prod ;
2. **Fenêtre d'officialisation** — les accords nés du dialogue Zii (paix contre or, échanges) branchés sur la modale T2, en cours de tour ;
3. **Itération 4 Jev — la fin de partie** (au banc, ~0,2-0,4 $) : transformer la domination en victoires ;
4. **Calibrage de la production offensive** post-T2 au banc (percée ≥ 40 %, captures ≥ 10 % — cibles du cycle guerre) ;
5. **T3** — ONU = victoire immédiate (5e victoire à cadrer), Grande Muraille impose la paix ;
6. Atelier voix de Zii (Erik écrit la personnalité dans `zii.json`), vieux 🔶 ci-dessous.

## 🔶 À trancher par Erik (ouverts)

- `prixPaixBase` 15 (calibré e2e — l'économie d'ouverture produit ~0 or) ; les techs adverses visibles dans la modale de négociation (fuite par design, miroir CivRev ?) ; négociation humain↔humain auto-acceptée (= cadeaux ; vraies offres pendantes au backlog Jev) ;
- Personnalité/ton de Zii et valeurs `sociabilite` par civ (à l'œil en jouant) ; mots-clés d'intention (ex. « rase » non classé menace) ;
- Capacité de cargaison navale (infinie actuelle ⚠ canon 1), encens gated par Rites funéraires, trait espagnol `caravanesPlus50` (inactif), vue ville zoomée DORMANTE (rebrancher un jour + re-vérifier TUILE-OCCUPEE D3), Mosaïque défaut ×0,3 à l'œil, R-90 écrase la gradation techs entre difficultés, banc botSolo non convergé (T-C le recadrera), logo barbare 1,8 Mo.

## 📚 Où est quoi (règles d'emplacement)

- **Racine** : documents vivants uniquement (cette page, DESIGN, RULES, BACKLOG, HANDOFF, PILOT-HANDOFF, ATELIER-ASSETS) ;
- `docs/recherche/` : **les specs d'Erik** — elles font foi sur toute valeur ; `docs/historique/handoffs|rapports/` : archives ;
- `sableuse/` : harnais Jev (bancs, journaux JSONL — hors git les journaux) ; `devtmp/` : bancs d'observation du bot et scripts e2e ;
- Conventions agent : [HANDOFF.md](HANDOFF.md) §4 — les documents de recherche sont des spécifications de référence, la mission est dans le handoff.
