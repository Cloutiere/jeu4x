# REPORT-ENGAGEMENT-R159B — Dispute de destination amie revue + dispersion de pile (décisions dictées du 17/09)

**Chantier gameplay (chapitre 2D) — spécification DICTÉE par Erik au labo `#/labo-combat`
en session (17/09), reformulée R-159 rév. B / R-159-b / R-159-c / R-159-d / R-179-b avec
DEUX tours d'arbitrage (Q1-Q4 puis P1-P5 puis H1-H3), implémentation test-first,
validation au labo. Zéro diff 3D. Aucun commit (sur demande explicite d'Erik).**

## 1. Les règles dictées, reformulées (RULES.md §5/§8bis)

| Règle | Contenu |
|---|---|
| **R-159 rév. B** | Dispute de destination amie : co-destination légale si un **ennemi** peut être sur la case à l'entrée (présent, y arrivant, ou l'attaquant) ; sinon première programmée garde la case, les suivantes **avancent au maximum et s'arrêtent avant**. L'ennemi qui part fait perdre le droit d'entrée (au plus une amie entre). FormArmy exempté. |
| **R-159-b** | Entrée conditionnelle (P1) : ≥ 2 attaquants du même camp sur une case défendue → entrées **retenues**, séquencées en Phase B dans l'ordre R-177 (entre PUIS attaque). Mort du défenseur : les amis suivants **n'entrent pas**, sauf si des ennemis demeurent (**entrée sans combattre**). Les **ennemis ne sont jamais retenus**. |
| **R-159-c** | Renfort défensive (P3) : retenue sur case amie stabilisée ; entre **après l'échange** si l'ennemi est **physiquement entré** ; défenseur mort → entre et **cohabite avec l'ennemi vainqueur** ; sans attaque → n'entre pas. |
| **R-159-d** | Tir sur pile (H2) : tir à distance sur case sans défenseur stabilisé → cible la **militaire mieux fondée** (fortifiée > PV > R-81), défense en valeurs d'ATTAQUE (R-174) ; ni entrée, ni report, ni suspension de dispersion. |
| **R-179-b** | **R-179 abrogée.** La pile amie est un **état résiduel légal** qui persiste ; l'excédent est **dispersé** en Phase E d'un tour sans entrée physique ennemie ni attaque de défenseur stabilisé sur la case (H2 : le tir ne suspend pas ; H3 : l'entrée ennemie suspend → mêlée avec étau). Reste la mieux fondée (**H1**), autres en ordre unitId vers la case adjacente libre la plus proche ; sans case admissible, persiste (réessai). Le restant se stabilise. Événement **`UnitDispersed`** (`UnitExpelled` conservé pour les journaux anciens). |

Arbitrages d'Erik : Q1 (ennemi qui part → une seule entre) · Q2 (cohabitation hors
attaque illégale ; résidu de combat légal) · Q3 (l'unité refusée avance tant qu'elle
peut) · Q4 (FormArmy : futur ordre distinct à 3 unités de même type, inchangé ici) ·
P1 (retenue amis seulement) · P2 (résidu légal + restabilisation, moteur déplace si le
joueur ne le fait pas) · P3 (renfort après l'échange, occupe avec l'ennemi) · P4
(ennemi arrivant = légalise) · P5 (la résolution tranche, perception ignorée) · H1/H2/H3
validés (H2 corrigé : le tir d'archer/catapulte ne suspend PAS la dispersion).

## 2. Implémentation (moteur — `packages/rules/src/turn.ts`)

- **Séquenceur d'entrée/attaque entrelacé** : les attaquants co-visant une case défendue
  (même camp, chemins + ordres Attack explicites) sont **retenus** devant la case
  (`board.retenus`, plans `latent`) et activés dans la boucle R-177 — entrée payée à
  l'activation ; refus sans perte de PM au-delà du chemin parcouru.
- **Renforts / jointures d'instabilité** : balayage post-Phase B par **priorité de
  programmation** (la « première programmée » entre), condition = ennemi occupant OU
  entrée physique ennemie ce tour (`board.entrees`, alimentée par `moveUnit`).
- **Dispersion de Phase E** : remplace l'expulsion ; suspension par entrée physique
  étrangère ou `meleeDifferees` (résidu de combat). Événement `UnitDispersed` (events.ts
  + refs fog + durée playback).
- **Tir sur pile** : cible `mieuxFondeeSur` (militaire ennemie, fortifiée > PV > unitId).
- **Un piège corrigé au passage** : une co-attaque explicite d'un camp barbare routait
  par « attack » au lieu de « villageAttack » — la capture du camp (R-183) aurait été
  contournée ; les plans latents de camp sont désormais des `villageAttack` latents.
- `schemaVersion` **inchangé (25)** : aucune forme d'état persistée ne change (marqueurs
  de résolution uniquement) ; événement additif.

## 3. Vérification

- **Suites vertes : rules 844 + web 296 + server 75 = 1215** (baseline session 1201 ;
  +13 tests `engagement-dispute.test.ts`, 2 tests réécrits avec justification — ancien
  contrat « entrée + expulsion R-179 » → « refus d'entrée » et `UnitDispersed`).
- **Typecheck 4/4** (svelte-check 0 erreur).
- **Labo GUI (vite `:5199`, captures `dev-logs/captures-labo-engagement/`)** :
  - `03-r159b-co-destination-sequencée.png` — deux guerriers J1 co-destinés sur le
    défenseur J2 : « u1 entre → ATTAQUE u1 → échange ; u2 entre → ATTAQUE u2 → échange »
    (séquence entrelacée, défenseur 3→1 PV, mêlée reportée) ;
  - `04-r159b-melee-trois-proprio-tour2.png` — Poursuivre : **MÊLÉE à 3** (J1 gagnant,
    J1 perdant −2, J2 intermédiaire −1 → morte) ;
  - `05-r159b-dispersion-pile-amie.png` — deux guerriers co-posés :
    **« DISPERSION (pile amie, R-159 rév. B) u2 : (7,5) → (6,5) »**, u1 stabilisée.

## 4. Angles découverts en implémentation (signalés, tranchés faute d'arbitrage)

1. **Garnison de ville** : la cohabitation hors attaque étant illégale, **renforcer une
   ville amie sans menace ennemie imminente est désormais refusé** (l'unité s'arrête
   devant). Conséquence directe de ta règle — à valider en jeu : si tu veux permettre
   l'entrée en ville amie sans condition, il faudra une exception R-159 pour les cases
   de ville (je ne l'ai PAS ajoutée).
2. **Renfort vs tir à distance** : ta dictée P3 dit « si l'attaque de l'ennemi a lieu »
   ; H2 dit que le tir n'est pas une présence physique. J'ai tranché par symétrie : **un
   tir seul ne fait pas entrer la renfort** (seule une entrée physique ennemie). À
   confirmer en jeu.
3. **Satellites barbares** : un attaquant RETENU devant un camp peut être aggro'd sur sa
   case d'attente par les satellites (entrée agressive légitime — visible dans la
   capture 04 de la session précédente). Le test labo « gardes immobiles » a été réécrit
   : tout Move barbare doit être suivi d'une Attack du même unitId.
4. **Graines de calibrage** : le séquenceur consomme les ties R-177 dans le même ordre
   qu'avant, mais les entrées latentes décalent les échanges — les graines des nouveaux
   tests sont calées par sonde (2 et 14) et documentées dans le fichier de tests.

## 5. Fin de session

Validation locale avec captures AVANT tout commit (règle établie) — faite. Rapport remis.
**Aucun commit/push** (sur demande explicite d'Erik). Vite toujours sur `:5199`, labo
ouvert (dernier état : scénario de dispersion affiché). Arrêt, remise de la main.
