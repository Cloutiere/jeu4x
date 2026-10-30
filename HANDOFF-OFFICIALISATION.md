# HANDOFF-OFFICIALISATION — Du dialogue Zii aux accords formels (branchement modale T2)

**Statut : prêt — NON LANCÉ.** Agent : lis ce handoff en entier puis les préalables, et exécute dans l'ordre. État de départ : ZII-FLASH-LITE livrée et validée (`b0f8481`, Zii = glm-4.5-flash, voix validée par Erik en prod).

## 0. Préalables (à lire AVANT tout code)

1. `RULES.md` §7.7 : **R-187** (Paix/Guerre public, gate d'attaque), **R-188** (diplomatie bot data-driven), **R-189** (« Le joueur négocie avec les bots ; les offres se résolvent À LA RÉCEPTION (zéro état persisté) et sont PRIVÉES » — c'est LA contrainte de cette mission), **R-190/R-191** (Zii jamais décisionnelle) ;
2. `PROJET.md` (état) + `REPORT-ZII-FLASH-LITE.md` / `REPORT-ZII-V1.md` (le chat Zii et ses structures) ;
3. Code d'arrivée : `packages/rules/src/diplomatie.ts` (`applyProposePeace`, `applyTradeTechs`), `apps/server/src/game.ts` (`handleProposePeace` ~l.1820, `handleTradeTechs` ~l.1903), `apps/web/src/components/NegociationModale.svelte`, `apps/server/src/zii/` (tons, intentions, `resumePourJev`).
4. ⚠ Entrelacement : personne d'autre ne travaille sur `apps/server/src/zii/` ni sur la diplomatie pendant ta mission. Rejoue la suite COMPLÈTE avant tout push.

## 1. Contexte — pourquoi maintenant

Zii parle en prod (1,7 s/échange) et qualifie chaque échange d'une `intentionPercue` (`salutation`, `menace`, `demandePaix`, `offre`, `question`, `autre`), relayée à Jev. Mais ces accords **nés du dialogue** restent de la littérature : pour conclure une paix ou un échange, le joueur doit lui-même ouvrir la modale T2 depuis la pastille de nation. On branche le dialogue sur la modale — **sans toucher au moteur** : la négociation garde sa résolution à la réception, sa grille seedée, sa privacité (R-189 inchangée).

## 2. Décisions de tranche (défauts tranchés — veto Erik possible, sinon telles quelles)

- **D1 — Bouton « Officieliser » sur les bulles de Zii.** Quand une bulle de Zii porte `intentionPercue` ∈ {`demandePaix`, `offre`}, le client affiche sous la bulle un bouton « ✍ Officieliser… » qui ouvre la `NegociationModale` pré-ciblée sur l'interlocuteur (et, pour `demandePaix` hors guerre, la section « Échanger des technologies » ; pour `demandePaix` en guerre, la section « Proposer la paix »). Zéro état serveur nouveau : le bouton ne fait qu'ouvrir l'UI existante.
- **D2 — Zii ne propose JAMAIS d'accord elle-même (R-190 renforcé).** Aucune génération de prix, d'offre d'or ou de tech par le LLM. Si le joueur veut que Zii « parle » d'une paix, elle parle ; l'accord se conclut EXCLUSIVEMENT via la modale (moteur + grille seedée). La `intentionPercue` sert à AFFICHER le bouton, rien d'autre.
- **D3 — Le bouton est conversationnel, pas bloquant.** Il apparaît sur les bulles récentes du canal individuel avec la nation ; clic = ouverture modale ; la partie reste en phase d'ordres (les gates `phase !== 'orders'` existantes rejettent proprement si résolution en cours).
- **D4 — Tracé côté serveur pour calibrage : rien.** Zéro nouveau champ moteur, `schemaVersion` 28 inchangée. Le clic « Officieliser » est un pur événement client (pas de storage). Si un jour on veut des stats d'officialisation, ce sera une tranche à part.
- **D5 — Icône/défaut UI** : bouton discret (libellé « ✍ Officieliser… », tooltip « Conclure un accord formel avec [dirigeant] ») ; style cohérent avec les bulles accent 4 tons. Erik tranche le libellé à l'œil.

## 3. Mission L0→L4 (dans l'ordre, test-first partout)

- **L0 — Cadrage** : lis les préalables ; `git status` propre ; suites zii 43/43 et web 706 vertes en local.
- **L1 — Client (le cœur)** : le paquet chat livré au client (Historique/Bulles) doit porter l'`intentionPercue` des bulles de Zii — vérifie ce que le client reçoit déjà (CHAT-SOCLE/ZII-V1 : si l'intention n'est PAS dans le paquet chat, ajoute-la au message serveur existant — donnée légère, pas de storage). Puis `NegociationModale.svelte` gagne un mode « pré-ciblée » ouvrable avec `{cible, sectionSuggeree}` ; bouton « ✍ Officieliser… » sur les bulles Zii éligibles (D1). Tests web (vitest) : bouton présent ⇔ intention éligible ; clic ouvre la modale avec la bonne cible/section ; absent sur `salutation`/`question`/`autre`.
- **L2 — Fil serveur minimal** : exposer `intentionPercue` (et `ton`) dans la livraison chat de Zii si absent (source : `ZiiJournalEntree`). AUCUN changement au décodeur, aux replis, à la liste blanche, au budget. Test server : le paquet chat contient l'intention ; test négatif : jamais de donnée au-delà (toujours la liste blanche).
- **L3 — Bouton d'ouverture depuis le chat** : raccord dans `Game.svelte` (la modale est déjà instanciée là, état `negociationCible` ~l.938) — le clic chat réutilise le MÊME état. Pas de duplication de modale.
- **L4 — Vérification GUI** : partie solo vs Jev, wrangler dédié 8787 + Vite 5174 (pièges R-191 et purge zombie `devtmp/purge-8798.ps1`) : envoyer une demande de paix au chat → bulle Zii `demandePaix` → bouton → modale pré-ciblée → conclure la paix réellement (PeaceAccepted en Chronique). Captures dans `dev-logs/captures-officialisation/` AVANT tout commit (règle d'Erik). Puis suites COMPLÈTES (server, jev-port, rules, web, svelte-check, typechecks), commit + push, rapport `REPORT-OFFICIALISATION.md`.

## 4. Critères d'acceptation (mesurables)

1. Une demande de paix dialoguée se conclut en ≤ 2 clics depuis la bulle (bouton → proposer dans la modale) ;
2. Aucun accord ne peut naître hors modale : test négatif prouve que Zii ne produit ni or, ni tech, ni acceptation (R-190) ;
3. Suites toutes vertes ; `schemaVersion` 28 ; zéro nouveau storage serveur ;
4. Captures GUI locales montrées dans le rapport ; Erik valide le geste à l'œil en local, PUIS en prod après Deploy vert.

## 5. Périmètre interdit

- Moteur `diplomatie.ts` et grille bot (`botPolicy.ts`, `bot.json`) : INTERDITS de modification (R-189 tel quel) ;
- Zii jamais décisionnelle : pas de prix/offres/techs générés (D2), pas de changement au décodeur, aux replis, à la liste blanche, au budget ;
- Humain↔humain : rien de nouveau (le bouton n'apparaît que face à une nation bot) ;
- Pas d'offre pendante, pas de storage nouveau, pas de `schemaVersion` ;
- Ne commets AUCUN fichier non tracké d'Erik ni de secret.

## 6. Fin de session

Rapport + arrêt + remise de la main. Erik valide le geste à l'œil, le pilot accepte et met PROJET.md à jour. Suite de la file : itération 4 Jev (fin de partie).
