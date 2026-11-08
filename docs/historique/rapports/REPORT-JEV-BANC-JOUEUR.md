# REPORT-JEV-BANC-JOUEUR — Jev joue des parties entières : compétence et coût mesurés

**Mission** (HANDOFF-JEV-BANC-JOUEUR, décisions Erik 28/10) : 10 parties 1v1 **Jev JOUEUR** vs bot standard, budget plafond 10 $, même modèle/SDK que les bancs JEV (jev-latest / @typesafe-ai/sdk, température par défaut du harnais). Hors ligne, zéro prod, zéro joueur réel.

**Exécuté le 27/10** — banc canon : `sableuse/bancs/joueur-2026-10-27/` (RAPPORT.md, plan, journaux JSONL complets rejouables décision par décision).

## TL;DR — verdict

**Jev joue MIEUX que le bot au scoreboard (8/10 parties au score supérieur, 10/10 en forces militaires, 8/10 en trésorerie) mais NE FERME AUCUNE PARTIE (0 victoire, 2 défaites/50 % des parties non décidées au plafond)** — parce qu'il est stratégiquement PASSIF : il n'a déclaré aucune guerre (décision de guerre toujours sous-confiante, plafond observé 0,44), il n'a converti une ville en science qu'1 fois en 1 368 occasions, et sa diplomatie est un spam de paix sèche refusée (220 propositions, 0 acceptée, jamais d'or offert même avec 4 000+ en trésorerie). **Le coût n'est PAS le verrou : 0,021 $/partie, soit 15-50× SOUS l'estimation 0,3-1 $.** Le verrou est la calibration de confiance du modèle sur les questions guerre/conversion.

## 1. Ce qui a été construit (L1)

- **`sableuse/src/joueur.mjs`** — le mode « Jev JOUEUR » : condensé enrichi d'un bloc **diplomatie** (rivaux avec civ, ère, techs — canon T2, forces VISIBLES fog, distance capitales ; trésorerie ennemie JAMAIS, R-134), questions dynamiques à critères non vides (directive n°3), traduction en formes canon (SetProduction capitale, SetResearch tenue, SetConversion, intentions guerre/paix/échange), comptage budget par appel, repli bot pur sur erreur/indécision.
- **`questions-joueur.json`** — 8 questions : produire, rechercher (tenue), convertir, guerre, paix, compensation (score 0-4 → paliers 0/10 %/25 %/50 %/100 % de la trésorerie), techOfferte, techDemandee. La règle automatique `regle:conversion` est DÉSACTIVÉE — Jev décide la conversion ville par ville.
- **`partie.mjs` étendu** (harnais seul, zéro moteur) : application des actions diplomatiques (applyDeclareWar/applyProposePeace/applyTradeTechs du moteur) avec **réponse seedée du bot** (deciderPaixNegociee/deciderEchangeTechs, tirages dédiés `negoc-paix-*`/`negoc-tech-*`, une seule itération — canon T2) ; Jev accepte les propositions de paix du bot SEULEMENT s'il choisit paix ce tour ; action SetConversion appliquée ; métriques de fin par joueur (D3 : villes, pop, techs, trésorerie, forces).
- **`banc-joueur.mjs`** — 10 parties du **corpus banc fixes** (corpusBanc(40)[:10]), **civs réelles P7** tirées du seed (tiragePaireCivs — canon BOT-P7), 150 tours max, garde-fou budget GLOBAL 10 $ (coupe nette, rapport partiel), reprise sur interruption.
- **L1 test-first** : `tests/joueur.test.mjs` 15 verts (fausse LLM, zéro appel réel) — questions à critères non vides, traduction, suppression des déclarations du bot, guerre/paix/échange bout-en-bout, privacité (pas de trésorerie ennemie dans le condensé), repli erreur, contrôle sansJev zéro appel, déterminisme des tirages negoc-*. Suite sableuse complète 51 verts.

### Deux pièges corrigés en cours de route (consignés)

1. **Fuite de déclaration** (run 1, invalidé) : le plan bot de BASE de Jev (calculé chaque tour comme pour tout le monde) émettait des DeclareWar À LA PLACE de Jev — les guerres du run 1 ne venaient pas de Jev. Correctif : en mode joueur, la déclaration émanant du plan de Jev est TOUJOURS supprimée (test de régression « aucun → zéro guerre »).
2. **Porte de confiance par domaine** (runs 1-2) : à 0,65 partout, Jev ne convertissait JAMAIS (1 105 choix science:c1 refusés) et ne déclarait jamais (321 choix guerre:p2 refusés) — canons v2 des seuils PAR DOMAINE appliqués : guerre/paix/convertir/échange à **0,5** (précédent fonderMin 0,5 du banc v3), produire/rechercher gardés à 0,65. Une réponse indécise = initiative du bot (canon D2).

Coût des trois runs (1 invalidé + 2 valides) : **0,60 $ au total**, très loin sous le garde-fou 10 $.

## 2. Chiffres du banc canon (run 3, D3)

| Métrique | Valeur |
|---|---|
| Parties | 10 (9 au plafond 151 tours, 1 décisive) |
| Victoires Jev | **0/10** (bot capture la capitale Jev en 19 tours dans la seule partie courte) |
| Score supérieur pour Jev | **8/10** (546-487-430 en tête ; défaites au score : #1 252/284, #4 247/256) |
| Forces militaires supérieures | **10/10** (moyenne ~54 vs ~11) |
| Trésorerie supérieure | **8/10** (jusqu'à 4 151 vs 64) |
| Villes fondées | 1-3 (Jev) vs 0-1 (bot) — le bot ne fonde quasiment pas en 1v1 |
| Décisions traduites | produire 1 366 · rechercher 729 · convertir **2** · paix 220 · guerre **0** · échange **0** |
| Replis bot pur | 12/1 378 tours (0,9 %) — erreurs API 0, distributions plates 0 |
| Coût | **0,0207 $/partie** (0,207 $ total), 3 426 jetons/décision, latence médiane 112 ms |

Wars observées : 7 déclarées par le BOT (initiative canon quand la guerre de Jev est indécise), 0 par Jev. Captures : 1 ville bot prise par Jev, 0 ville Jev perdue (hors la partie courte #5).

## 3. Jugement qualitatif (D4) — « Jev joue-t-il mieux que le bot ? »

**Économie — OUI, nettement.** Jev produit du militaire en continu dans sa capitale (guerrier 150 tours de suite, choix d'orientation constant et confiant) : 10/10 en forces, 8/10 en trésorerie, des scores de 2-10× le bot. Sa discipline de recherche est tenue (jamais de changement en cours de route).

**Recherche — le geste qui change tout, fait UNE fois.** Partie 8 (mongolie) : la SEULE conversion science qui passe la porte (tour 47, confiance 0,59) déverrouille l'arbre entier — **16 techs vs 1**, score 546 vs 75, la seule partie où Jev prend une ville bot. La même conversion, jamais répétée dans les 9 autres parties (1 366 occasions, confiance plafonnée ~0,4) : la science reste à ~0/tour (canon R-90 défaut or) et les empires Jev finissent à 1-3 techs en 151 tours. Une seule décision confidente sépare le Jev écrasant du Jev stérile.

**Guerre — NON : un commandant qui ne donne jamais l'ordre.** Jev CHOOSE `guerre:p2` 301 fois (il VEUT la guerre) mais sa confiance ne dépasse jamais 0,44 — la porte 0,5 bloque tout, le bot garde l'initiative et déclare 7 fois. Ses armées (3-5× les forces du bot) restent alors défensives. À l'inverse, partie 5 (zoulous) : guerre bot précoce, capitale Jev prise au tour 19 — Jev produisait des impis sans garnison décisive.

**Diplomatie — active mais aveugle.** En guerre subie, Jev propose la paix sèche CHAQUE tour (220 fois), jamais d'or malgré des trésoreries de 1 000-4 000 (la question compensation répond toujours 0), jamais de contre-offre, jamais d'échange de techs (confiance 0,88 sur « aucun »). 0/220 acceptées. Le bot perdant (partie 4, forces 62 vs 23) refuse sèchement et la guerre stagne au plafond.

**Verdict par domaine :** économie ✓ (meilleur que le bot) · recherche ◶ (excellent QUAND il convertit — une fois en 10 parties) · guerre ✗ (passif, jamais l'initiative) · diplomatie ✗ (spam sans levée de prix).

## 4. Coût réel vs estimation (L3-b)

Estimation du cadrage : 0,3-1 $/partie. **Réel : 0,021 $/partie** (3 426 jetons/décision × ~140 tours × 0,042 $/M). 15-50× sous l'estimation. Une partie complète 1v1 150 tours coûte ~2 centimes — le frein économique au lobby « Partie contre Jev » N'EXISTE PAS.

## 5. Recommandation (L3-c)

**NE PAS brancher « Partie contre Jev » au lobby dans l'état actuel** — non pour le coût (réglé), mais parce que l'adversaire obtenu est une tortue économique invincible qui ne gagne jamais : intéressant 2 parties, frustrant ensuite. Leviers AVANT branchement (tranche suivante) :

1. **Conversion par défaut à re-décider** (le plus gros gain, 1 ligne de config) : réactiver la règle `regle:conversion` du harnais pour TOUT le monde OU reformuler la question convertir (2 critères plats, sans « aucun ») — la partie 8 prouve le potentiel (16 techs).
2. **Reformuler la guerre** : la confiance du modèle plafonne à 0,44 — passer d'une porte de confiance à un choix ARGUMENTÉ (critères pré-triés avec rapport de forces favorable UNIQUEMENT, ou score « faut-il attaquer » comme la question attaquer du banc v2 qui passait à 0,85).
3. **Compensation de paix avec prix suggéré** : exposer une fourchette (miroir du prix indicatif) au lieu d'un score de paliers jamais utilisé.

Coût d'un re-banc après ces ajustements : ~0,2 $. Verdict d'Erik attendu sur l'ordre des leviers.

## 6. Artefacts et périmètre

- **Code commité** : `sableuse/src/joueur.mjs`, `sableuse/src/banc-joueur.mjs`, `sableuse/questions-joueur.json`, extension `sableuse/src/partie.mjs` (mode joueur + diplomatie), `sableuse/tests/joueur.test.mjs` (15 verts). Zéro changement moteur/serveur/web, schemaVersion 28 intouchée, aucune clé dans le dépôt (`.env.local` gitigné).
- **Artefacts locaux** (gitignorés, conservés pour analyse) : `sableuse/bancs/joueur-2026-10-27/` (plan, etat, RAPPORT.md) + `journaux/` complets — le journal de chaque partie contient condensé envoyé + réponses brutes + décisions + événements, réutilisable pour le futur Jev-négociateur (motif D3).
- Runs invalidés conservés pour l'audit : `bancs/joueur-fumee` (fausse LLM), journaux des runs 1-2 supprimés avec leur banc (régénérés à chaque run, chiffres consignés dans ce rapport).
- Budget réel consommé : **0,60 $** (3 runs) — garde-fou 10 $ non approché.
