# PROJET — État du jeu Eternal Empires (clone fidèle de Civ Revolution)

**Tenue par le pilot, mise à jour à chaque acceptation de phase — dernier point complet : 30/10.** Erik ouvre ce document pour savoir où on en est ; tout agent neuf le lit pour le contexte en 2 minutes. Vision et architecture : [DESIGN.md](DESIGN.md). Spécification normative : [RULES.md](RULES.md). File d'attente détaillée et mémoire de pilotage : [PILOT-HANDOFF.md](PILOT-HANDOFF.md). Index de tous les documents : [docs/index.md](docs/index.md).

**Production** : [game-4x-server-prod.erik-ai-studio.workers.dev](https://game-4x-server-prod.erik-ai-studio.workers.dev) · **~2 170 tests verts** (rules 1101 / server 369 / web 706 / sableuse 80) · `schemaVersion` **28** · budget Cloudflare tenu (~5 $/mois). Coquille Electron de distribution Windows en place.

---

## ✅ Réalisé — le socle (le jeu est complet sur les règles canon CivRev)

| Domaine | Contenu |
|---|---|
| Règles CivRev | 46 techs, 22 ressources, 16 civilisations + uniques teintées, 6 gouvernements, merveilles (obsolescence/exclusivité/récupération), artefacts, espionnage, nucléaire/SDI, caravane (80/50 or ×ère, capture paie le capteur), 4 victoires (domination/culture/science/économique) |
| Moteur | Déterministe seedé, tours simultanés, **monde cylindrique** Est↔Ouest (rendu sans couture), fog filtré serveur, embarquement programmé (rendez-vous virtuel, dépose en cours de chemin), bonus premier découvrir placés au meilleur bénéfice (navales jamais sur terre, Milice de bord) |
| Jouabilité 2D | UI Civ VI (Chroniques unifiées 7 catégories, bannière de ville + tooltips « pourquoi tant de tours », techtree plein écran d'Erik, préview vivante au survol, ordres d'unités Vendre/Soigner/Vigilance/Passer + raccourcis F/H/S/Z/B, orientation des unités, icônes 4K partout, décodeur de combat dans le rapport, god mode Ctrl+J→G + bouton DEV) |
| Visuel | Toutes unités/villes/ressources en art 4K d'Erik, zones culturelles en dégradé continu, 8 tuiles terrain + tuiles-ressources révélées, atelier `#/atelier` + labos (progen, combat, culture) |
| Diplomatie | T1 : état Paix/Guerre public par paire, `DeclareWar`, gate d'attaque (espionnage et caravane exemptés) · T2 : négociation privée (paix compensée, échanges de techs, bot seedé par rapport de forces + agressivité) · **officialisation depuis le chat** (`9c73bc3`) : bouton « ✍ Officieliser… » sur les bulles de Zii éligibles (`demandePaix`/`offre`) → modale T2 pré-ciblée, zéro accord né hors moteur (R-190) |
| IA | Bot standard à objectifs (patrouille en boucle, armées offensives R-31, économie arbitrée, guerre par agressivité de civ, paix au juste prix), **difficultés Facile/Normal/Difficile**, banc de calibrage 40×3 déterministe |
| Distribution | Coquille Electron Windows (tranche 1), Steam tranche 2 au backlog après approbation fiscale |

## 🤖 Le chapitre IA (octobre) — Jev et Zii en production

- **Jev** (modèle décisionnel `jev-latest`, SDK typesafe) : branché en prod via la fumée lobby — partie solo « contre Jev ». Bancs : v2 (37 guerres, 2 victoires par conquête), v3 (expansion : 2-6 villes/partie), v4 (contact réel avant guerre : 0 déclaration avant rencontre), **it.4 fin de partie** (`d06fa56` : bloc `victoire` au condensé + 3 questions gateées — **4/10 victoires, 4/4 attribuables**, compromis 4 guerres/4 gagnantes validé par Erik) puis **IT4B déclaration** (`829dc05` : choix `guerreTotale` dans `finPartie`, cible aveugle au lobby votée Erik) puis **calibrage offensif** (`7d77426` : théâtre direction+distance, marche MultiStep re-planifiée, paix interdite en domination — **percée 67 %**) puis **TB-SIEGE-DEFENSE** (`9964a7b` : tactique bot rassemble avant assaut, bots défendent leurs seuils — captures 50 % des guerres). **Canon du siège et du combat, votés par Erik le 31/10** : **CANON-SIEGE** (`b43f298` : bonus ville 0,25 — révision T-02 enfin branchée, le soin lève la fortification, soin 1 PV/tour partout) et **BATAILLE-COMPLETE** (`11b285b` : « une attaque égale la mort de l'une ou l'autre », sans retraite — T-03 abandonné ; siège cède à 99,4 %, première capture de capitale de l'histoire des bancs Jev) puis **JEV-DECISIONNEL** (`35ea986` : déclaration mécanique prouvée — t42 aveugle) puis **T3-ONU** (`1e63239` : la Grande Muraille impose la paix — refus de `DeclareWar` + paix rétroactive à l'achèvement, fin à Ingénierie ; ONU jalons 20 + victoire immédiate confirmés, Banque mondiale 20 000 confirmée). **Variance tranchée : victoires Jev 3/20 = 15 %** (cible 40 % du cycle guerre non atteinte — verdict ressenti Erik attendu, voir BANC-VANILLA). **Coût : ~0,02 $/partie** — non limitant.
- **Zii v1** (`b3d03d3`) puis **voix générée** (`a9097f7` GLM, `b0f8481` glm-4.5-flash thinking désactivé — médiane **1,7 s**, 0 $/M, **voix validée par Erik en prod**) : la « bouche de Jev » sur le chat — salutations liées à la `sociabilite` de la civ, réponses **générées** en langage naturel (JSON `{reponse, ton, intentionPercue}`, décodeur v1 arbitre), repli répliques v1 sur panne/clé absente, relais `resumePourJev` au condensé de Jev (prouvé), liste blanche + double barrière anti-injection, budget 0,05 $/partie.
- **Chat socle** (`17c467b`) : onglet 💬, canaux Général + individuels privés, popup de première rencontre, persistance serveur GameDO (hors état moteur) — format déjà pensé comme contexte futur du LLM.
- **Économie d'IA** : les bancs JEV/bot coûtent des fractions de dollar (0,02-0,6 $/mission LLM) ; garde-fou campagne 10 $. Zii = 0 $ (glm-4.5-flash gratuit).

## 🚧 En cours — LA mission active

- **HANDOFF-ARMEE-STRENGTH** (prêt, non lancé — **PRIORITÉ**, bogue R-31 capturé en prod BJ5VC5 t26, canon confirmé Erik : **A et D ×3**) : les armées formées frappent/encaissent à base ×1 (`combatStrengthsOf` ignore `isArmy`) — former une armée AFFAIBLIT. Fix : base × ARMY_SIZE les deux côtés, mod « Armée ×3 (R-31) » au détail, vétéran ×1,5 après ; re-verrouillage des tests de combat + re-baseline bancs.
- **ORACLE-VERDICT livré + accepté** (`c2a8c34`, Deploy SUCCESS vérifié, rapport à la racine) : jets de combat mêlée dérivés par **hash** (indépendants du flux — preuve L1 bit à bit sur 30 seeds) ; l'Oracle affiche **VICTOIRE/DÉFAITE certain** au panneau et dans la préview vivante (fog filtré, `PredictBattle`) ; bancs re-baselinés sans collapse. 🔶 Erik valide en jouant (Oracle + attaque risquée).
- **CIVS-NEUTRES-LOBBY livrée** (38b7c32) : « Sans civilisation » sélectionnable au lobby pour chaque siège (joueur ET bot/Jev), jamais tirée au hasard — les duels de test d'Erik sont propres.
- **COHABITATION-HOSTILE livrée** (`138dece`, acceptée) : les entrants hostiles convergents se battent en bataille complète (gate `residentPresent` — l'ancienne mêlée pondérée vit pour les résiduels) ; le trou 5633Y3 est fermé, les convergences barbares/joueur tuent désormais.
- **FONDATION-PREVIEW livré + accepté** (08/11, « c'est parfait ») : la case de fondation du colon se teinte à la couleur de la nation (liseré hexagonal + dégradé culturel en miroir, alpha 0,5 validé à l'œil) ; web 785 verts.
- **FLUIDITE-SELECTION livré** (rapport à la racine, labo caméra en attente) : FSM d'interaction explicite (774 tests verts, zéro changement de comportement) + **cyclage automatique avec caméra qui glisse** (lerp 400 ms, prouvé par sonde) + `N` + toggle DEV. 🔶 Reste : Erik tranche la vitesse de caméra en jouant (`cameraLerpMs`, un seul chiffre).
- **VISUEL-ARMEE livré + rév.2** (`7192f49` puis `6cd899a`) : 3× l'icône de l'unité sur la bannière, barre segmentée proportionnelle puis ALIGNÉE sous les icônes ; asset unité intouché ; web 759 verts.
- **GESTE-ARMEE livré + rev.2** (`b3fca04` puis `fa5a32f`) : geste manuel en 3 temps + **proposition automatique** (≥ 3 unités même type convergeant → le jeu demande la conversion, refusable, chips au-delà de 3) ; armée définitive jouable (« Guerrier (armée) », PV 9/3) ; zéro changement moteur. 🔶 Fusion navale au backlog.
- 🗂 **Dépôt rangé** (`1f0f920`, 05/11) : 106 handoffs + ~110 rapports archivés à `docs/historique/`, outils de diagnostic et dumps prod committés.
- **GODMODE-BOUTON livré** (`2006dd7`) : bouton `God mode` dans la barre DEV + chord `Ctrl+J→G` (le W n'est plus écouté — réservation navigateur `Ctrl+W`) ; garde solo/bots intacte ; web 724 verts.
- **HUTTE-EXPLORATION livré** (`ae63a12`) : hutte connue = cible d'exploration prioritaire (détour ≤ data), exception testée à la règle anti-recul ; **13 huttes ouvertes par Jev / 5 parties** (vs 1,75 baseline), ZWV7T5 corrigé bit-à-bit, victoires et anti-piétinement en non-régression. Le bot classique en profite aussi (botPolicy partagé).
- **CONFIANCE-EXPLORATION livré** (`3f71087`) : seuils de confiance PAR QUESTION calibrés sur le journal prod réel (fonder 0,2, convertir 0,25, produire 0,3, rechercher 0,25) + doctrine « jamais inactif » + la poche u4 réparée. Banc : **9,0 fondations/partie** (critère ≥ 4), science plus rapide (t306-312).
- 🔧 **Triage prod opérationnel** : routes admin (`/admin/game/<CODE>`, `/trace?turn=N`, `/jev`) avec le token d'Erik — un code de partie suffit au diagnostic. 🔶 La trace prend `?turn=`, pas `?tour=`.
- **Entrelacement de sessions — leçon du 29/10** : deux missions parallèles sur un point de jonction (tests croisés `jev-port`) ont fait tomber les 2 Deploys ; fixé par SYNC-JEV-PORT (`c9a3710`, Deploy vert). Règle : les sessions qui partagent un point de jonction rejouent la suite complète avant tout push.

## 📋 File d'attente (dans l'ordre convenu avec Erik)

1. **GESTE-ARMEE** (handoff prêt — la mission active) ;
2. **Miroir Jev vs Jev** (backlog) : équilibre attaque/défense du canon + exam de la chaîne conquête des deux côtés ;
3. Atelier voix de Zii (Erik écrit la personnalité dans `zii.json`), vieux 🔶 ci-dessous.

## 🔶 À trancher par Erik (ouverts)

- `prixPaixBase` 15 (calibré e2e — l'économie d'ouverture produit ~0 or) ; les techs adverses visibles dans la modale de négociation (fuite par design, miroir CivRev ?) ; négociation humain↔humain auto-acceptée (= cadeaux ; vraies offres pendantes au backlog Jev) ;
- Personnalité/ton de Zii et valeurs `sociabilite` par civ (à l'œil en jouant) ; mots-clés d'intention (ex. « rase » non classé menace) ;
- Capacité de cargaison navale (infinie actuelle ⚠ canon 1), encens gated par Rites funéraires, trait espagnol `caravanesPlus50` (inactif), vue ville zoomée DORMANTE (rebrancher un jour + re-vérifier TUILE-OCCUPEE D3), Mosaïque défaut ×0,3 à l'œil, R-90 écrase la gradation techs entre difficultés, banc botSolo non convergé (T-C le recadrera), logo barbare 1,8 Mo.

## 📚 Où est quoi (règles d'emplacement)

- **Racine** : documents vivants uniquement (cette page, DESIGN, RULES, BACKLOG, HANDOFF, PILOT-HANDOFF, ATELIER-ASSETS) ;
- `docs/recherche/` : **les specs d'Erik** — elles font foi sur toute valeur ; `docs/historique/handoffs|rapports/` : archives ;
- `sableuse/` : harnais Jev (bancs, journaux JSONL — hors git les journaux) ; `devtmp/` : bancs d'observation du bot et scripts e2e ;
- Conventions agent : [HANDOFF.md](HANDOFF.md) §4 — les documents de recherche sont des spécifications de référence, la mission est dans le handoff.
