# HANDOFF-JEV-IT4-FIN-PARTIE — Itération 4 de Jev : voir les victoires, puis les transformer

**Statut : prêt — NON LANCÉ.** Agent : lis ce handoff en entier puis les préalables, et exécute dans l'ordre. État de départ : OFFICIALISATION livrée (`9c73bc3`), suites server 388 / web 712 / rules 1101 / jev-port 20, `schemaVersion` 28.

## 0. Préalables (à lire AVANT tout code)

1. `RULES.md` : R-124 (victoire science), R-116 (culture/ONU + 20 jalons), R-137 (Banque mondiale 20 000 or), R-188 (diplomatie bot), R-190/R-191 (Zii, pièges) — les 4 victoires du MOTEUR sont complètes, tu n'y touches JAMAIS ;
2. `PROJET.md` + `REPORT-JEV-CONTACT-GUERRE.md` (le banc v4 : 10 seeds, 0 guerre avant rencontre, fondations 3,0 villes/partie, victoires 1/10 — LE chiffre à faire bouger) ;
3. Code : `apps/server/src/jev/condense.ts` (le condensé : `empire` + `monde.rivaux` limités à `{civ, era, techsConnues}`), `apps/server/src/jev/joueur.ts` (`condenseJoueur`, `construireQuestionsJoueur`), `apps/server/src/jev/questions-joueur.json` (harnais v4), `packages/rules/src/turn.ts` (références victoires : jalons `CULTURE.milestonesTarget`, `SHIP_COMPONENTS`, merveilles `cultureVictory`/`economicVictory`) ;
4. ⚠ **Banc réel = argent** : le banc Jev coûte ~0,2-0,4 $ — le budget du banc cette mission est plafonné à **0,50 $** (garde-fou campagne 10 $). Un seul banc final ; tous les essais intermédiaires en FAUX LLM.
5. ⚠ Entrelacement : personne d'autre ne touche à `apps/server/src/jev/` ni à `questions-joueur.json`. Le fichier questions est COPIÉ au harnais (`jev-port`) : toute modification impose de rejouer la suite `jev-port` ET de réaligner la copie harnais (leçon SYNC-JEV-PORT `c9a3710` — bit-à-bit ou version explicitly bumpée).

## 1. Contexte — pourquoi maintenant

Au banc v4, Jev domine mécaniquement (percée ×4, 10 captures en moyenne d'arc, 3 villes fondées) mais gagne 1/10 par hasard : **il ne voit pas la fin de partie**. Le condensé ne lui expose ni jalons culturels, ni composants du vaisseau, ni merveilles de victoire, ni trésoreries, ni seuils — et ses questions ne portent que production/recherche/guerre/paix. Le moteur, lui, est complet (domination structurelle, ONU+20 jalons, vaisseau 4 composants, Banque mondiale+20 000 or). T-A ci-dessous rend Jev capable de VOIR puis VISER la victoire. T-B (bots classiques défendent leurs seuils, courses à l'ONU) est au backlog — hors périmètre ici.

## 2. Décisions de tranche (défauts tranchés — veto Erik possible, sinon telles quelles)

- **D1 — Bloc `victoire` au condensé** (nouveau, pur calcul depuis l'état, zéro storage) :
  - `mien` : jalons culturels (n/20), composants vaisseau posés (n/4), merveilles de victoire en chantier chez moi (nom + tours restants estimés), trésorerie (déjà exposée), merveilles de victoire déjà bâties par qui ;
  - `rivaux` : pour chaque rival vivant — jalons (n/20), composants (n/4), merveilles de victoire en chantier chez lui, trésorerie approximée à la centaine (l'or exact adverse reste hors condensé — même économie de liste blanche qu'aujourd'hui).
  ⚠ Choix de design assumé : la progression de victoire des rivaux est EXPOSÉE (Jev doit pouvoir contrer une course) — c'est plus d'information que CivRev ne montre au joueur ; Erik peut la restreindre à « jalons + merveilles » au veto.
- **D2 — Trois nouvelles questions** (mêmes règles que les existantes : forme STRUCTURÉE, repli, seed) :
  1. `finPartie` : quand les jalons/composants d'un camp approchent du seuil (≥ 60 % ?) — Jev choisit : `pousserCapitale` (concentrer l'effort offensif sur la capitale du leader de domination), `contrerCourse` (attaquer/décaler la production vers la course adverse), `viserMaVictoire` (type choisi parmi culture/science/economique/domination, motivé par sa position), ou `continuer` (rien de spécial) ;
  2. `productionVictoire` : si `viserMaVictoire` culture/science — poser/bâtir le prochain jalon ou composant (mappe sur les ORDRES EXISTANTS : SetProduction wonder/bâtiment, conversion science) — JAMAIS de nouvel ordre moteur ;
  3. `protegerCapital` : si un rival est en domination contre moi (ses villes capturées récentes + ma capitale menacée) — prioriser défense (mappe sur les ordres de fortification/déplacement existants).
- **D3 — Gate de bruit** : les questions 2-3 ne sont POSEES que si le bloc `victoire` montre un signal (jalons ≥ 10 chez quelqu'un, ≥ 2 composants, merveille de victoire en chantier, ou guerre contre moi). En partie calme pré-ère classique, le prompt reste identique à aujourd'hui (non-régression du comportement v4 — le banc doit montrer que le mid-game est inchangé).
- **D4 — La domination reste la voie principale** : Jev est joueur de conquête (verdict Erik : cycle guerre validé) ; `viserMaVictoire` non-domination n'est offert que si la domination est bloquée ou trop coûteuse (signal : ratio de forces < 1, ou capitaux adverses introuvables/inaccessibles). Pas de virage culturel volontaire par défaut.
- **D5 — Zéro changement moteur** : ni seuil, ni merveille, ni `schemaVersion` (28), ni Zii. Le client est inchangé.

## 3. Mission L0→L5 (dans l'ordre, test-first partout)

- **L0 — Cadrage** : lis les préalables ; suites vertes en local (server 388, jev-port 20) ; `git status` propre.
- **L1 — Bloc `victoire` du condensé, test-first** : calculs purs depuis l'état (jalons — les mêmes compteurs que le moteur utilise pour la gate ONU ; composants — le suivi dérivé R-66 ; merveilles en chantier — files des villes) ; tests : parties calmes → bloc neutre/vide (D3), partie avec jalons → chiffres exacts, rivaux éliminés exclus, jamais de donnée hors liste (test négatif style R-190 : positions d'unités et plans absents).
- **L2 — Questions + décisions, test-first** : les 3 nouvelles questions en FAUX LLM (formes valides → ordres existants corrects ; formes invalides → repli compté, jamais de panne) ; gate de bruit D3 testée ; la copie harnais `jev-port` réalignée (questions-joueur.json versionnée v5) et tests croisés verts.
- **L3 — Banc final réelle (UN SEUL, ≤ 0,50 $)** : le banc v4 (10 seeds corpus) rejoué tel quel — comparaison v4 vs it4 sur : **victoires (le critère)**, guerres totales (non-régression ~26), guerres avant rencontre (non-régression 0), fondations (non-régression ~3,0), coût réel. Sortie : `devtmp/banc-jev-it4.json` + tableau dans le rapport. Si le banc explose le budget ou part en boucle (n'importe quel seed), ARRÊT, diagnostic, ajustement D3 (gate plus tardive), re-banc UNIQUE après veto Erik.
- **L4 — Suites COMPLÈTES avant push** (règle d'entrelacement) : server, jev-port, rules, web, svelte-check, typechecks. Commit + push (CI déploie). Rapport `REPORT-JEV-IT4-FIN-PARTIE.md` : tableau banc v4 vs it4, 2-3 transcripts de fins de partie (comment Jev a décidé), affirmations vérifiables.
- **L5 — Remise de la main** : rapport + arrêt. Erik lit le rapport et les transcripts ; le pilot vérifie, rejoue les suites, accepte (ou demande un ajustement + re-banc).

## 4. Critères d'acceptation (mesurables)

1. **Victoires au banc : ≥ 3/10** (vs 1/10 v4) — et toute victoire doit être ATTRIBUABLE (le transcript montre la décision `finPartie` qui l'a enclenchée) ;
2. Non-régression : guerres avant rencontre = 0 ; fondations ≥ 2,5 villes/partie ; guerres totales dans la fourchette v4 (20-35) ;
3. Parties calmes : prompt inchangé (test prouve le bloc neutre + aucune question victoire avant signal — D3) ;
4. Suites toutes vertes, `schemaVersion` 28, budget banc ≤ 0,50 $, copie harnais réalignée (jev-port vert).

## 5. Périmètre interdit

- Moteur (seuils de victoire, merveilles, élimination) : INTERDIT ;
- Bots classiques (`botPolicy.ts`, `bot.json`) : INTERDIT (c'est T-B) ;
- Zii : INTERDIT ;
- Aucun nouvel ordre moteur ; aucune modification du client ;
- Le banc réel est UNIQUE (D/L3) — pas d'itération à l'argent sans veto Erik ;
- Ne commets AUCUN fichier non tracké d'Erik, aucun secret, aucune clé API dans les logs.

## 6. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation du pilot, la file reprend : T-B (bots défendent leurs seuils) puis calibrage offensif post-T2, puis T3.
