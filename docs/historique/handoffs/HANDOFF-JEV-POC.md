# HANDOFF-JEV-POC — Preuve de concept : une partie Jev contre le bot (sableuse headless, journal JSONL)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `PROJET.md` (état), `docs/recherche/Intégration IA JEV Jeu 4X.md` (le doc d'Erik sur Jev — LA référence du fournisseur : SDK `typesafe-sdk`, primitives Choice/Score/Noul, endpoint, directives « fetch precisely / pas d'arithmétique / distributions plates »). **Outil HORS LIGNE** : rien ne touche `apps/server`, la prod, le protocole ou le jeu distribué. Zéro changement moteur (`packages/rules` en consommation seule). **AUCUN secret au dépôt** — la clé vit dans un fichier gitigné local.

## 1. Objectif (décision d'Erik du 28/09)

Valider le chemin complet « Jev pilote une nation » AVANT tout chantier sérieux : **une partie complète (30-50 tours) où une nation est pilotée par Jev contre le bot existant**, en headless, avec un **journal JSONL de chaque coup et de chaque décision** (avec probabilités). Budget dur : **5 $** (Erik) — viser ≤ 2 $ consommés. Purement local, jamais en prod.

## 2. Sécurité de la clé (L0 — AVANT TOUT)

- La clé est dans `jev.txt` (racine, **gitigné par commit 84ac6fe**). Transférer la clé dans `sableuse/.env.local` (format `TYPESAFE_API_KEY=...`, gitigné — vérifier que `.env.local` est bien couvert par `.gitignore`), puis **supprimer `jev.txt`** après vérification du transfert. Ne JAMAIS afficher la clé dans un log, un rapport, un commit ou une capture.
- Vérifier par `git status` que rien de secret n'est tracké avant chaque commit.

## 3. Décisions tranchées par défaut (vetoables)

- **D1 — Node 20+, script autonome dans `sableuse/`** (nouveau dossier racine, hors workspace turbo si possible — ou package séparé sans effet sur les builds existants). Pas d'impact CI : si le SDK ne s'installe pas proprement, isolation dans `sableuse/` uniquement.
- **D2 — Sonde AVANT d'écrire le bot** : un appel minimal (une `Choice` triviale) pour valider clé, endpoint, latence et coût réel. Si l'API est injoignable, l'endpoint/nom de modèle du doc est erroné, ou le schéma diffère : **STOP, rapport de blocage à Erik** (avec ce qui a été tenté, hors secret) — ne pas improviser un autre fournisseur sans son feu vert.
- **D3 — Petit terrain d'essai** : carte réduite (ex. 20×20), 2 nations (Jev vs bot interne — portage/usage du `botPolicy` existant), seed tracée, plafond 50 tours + conditions de victoire normales. Rapide et peu coûteux ; la vraie échelle (5 nations, 40-50 de large) sera le chantier suivant si le POC convainc.
- **D4 — Jev décide, le code exécute** (directive du doc) : le harnais calcule TOUT ce qui est arithmétique/légal (candidats de production, coups légaux, distances, viabilité des sites) et Jev tranche entre candidats. Toute décision Jev est traduite en ordres via les fonctions moteur ; un ordre illégal = repli sur le bot pour CE tour + inscription au journal (compteur d'ordres rejetés — métrique clé du POC).
- **D5 — Questions minimales (premier jet, empirique)** (speculative fan-out, 1 appel/tour) : posture `Choice` (économique/militaire/tech/fortifier), menace `Score` (0-3), fondation `Noul`, attaque `Noul`. Seuils de repli type doc (< 0,65 confiance → bot). Les questions vivront dans un fichier de config éditable (`sableuse/questions.json`) — Erik les affinera au calibrage. **L'esprit (demande d'Erik du 28/09) : ces 4 questions sont un premier jet VOLONTAIREMENT minimal — le POC sert à découvrir empiriquement si l'état transmis suffit (directive n°3 du doc : distribution plate = information manquante), pas à démontrer la qualité de jeu. Le jeu de questions sérieux sera conçu APRÈS le POC, sur les faits du journal.**
- **D6 — État transmis = état filtré fog** de la nation (`getFilteredState` existant) puis condensé sérialisé (économie, unités, villes proches, cibles pré-filtrées ≤ ~2000 jetons). Journaliser aussi le condensé (pour l'analyse d'Erik).
- **D7 — Journal JSONL** : une ligne par événement (GameEvent existants) + lignes `decision` (question, réponse brute, probabilités, tour, seed, latence, coût estimé) + lignes `meta` (seed, civs, fin de partie). Écrit dans `sableuse/journaux/` (gitigné — analyse locale d'Erik ; un petit échantillon anonymisé peut être committé en exemple si utile).
- **D8 — Garde-fou budget** : compteur de requêtes + estimation de coût en continu ; au-delà de 2 $ estimés, la partie en cours s'achève proprement et le rapport consigne le coût. Aucune boucle d'essais-erreurs à grande échelle pendant le développement (les mises au point du sérialiseur se font avec un FAUX client Jev local, déterministe — zéro appel).

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts (sans toucher aux packages existants). Lit `botPolicy` (GameDO) et le portage bot, `progen` (génération), `resolveTurn`/`GameEvent`, `trace.ts`.
- Sécurité §2. Sonde §3-D2 (latence + coût d'un appel, consignés).

### L1 — Sableuse
- `sableuse/` : harnais de partie headless (seed → génération petite carte → boucle ordres/résolution → victoire/plafond), adapter Jev (D4/D5), faux client déterministe pour le dev (D8), journal JSONL (D7).
- Tests : harnais avec faux client (partie complète déterministe, rejouable même seed), traduction ordres (rejet compté), journal bien formé.

### L2 — La partie POC
- 1 partie Jev vs bot, 30-50 tours, journal complet. Si la partie plante (ordre illégal en boucle, blocage), recommencer avec seed différente — **dans la limite du budget** ; consigner chaque tentative.
- Mesurer : coût total, latence moyenne/max par tour, ordres rejetés, décisions en repli, distributions plates (directive n°3 du doc — signal d'état mal préparé).

### L3 — Vérification
- Suite complète + typecheck verts (aucune régression — le dépôt existant ne doit quasi pas bouger : au plus des imports réutilisés).
- Sanity du journal : rejouer la partie depuis le journal (les coups listés) reproduit la même fin (déterminisme du moteur + décisions consignées).

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter : le journal (lisible, avec 3-4 décisions commentées : l'état transmis, la question, la réponse de Jev, l'ordre exécuté), coût et latence réels, verdict honnête sur la QUALITÉ des décisions, et la **fiche de suffisance d'information** : question par question — distributions plates ? variables manquantes dans le condensé ? candidats mal générés ? (ce sera le cahier des charges factuel du jeu de questions de la sableuse). NE COMMITTER QU'APRÈS FEU VERT (et jamais `jev.txt` ni `journaux/` complets).

### L5 — Rapport
- `REPORT-JEV-POC.md` : sonde (latence/coût), architecture de la sableuse, métriques de la partie, décisions commentées, recommandation (continuer vers la sableuse de calibrage 5 nations ? ajuster quoi ?), 🔶 (questions à affiner, seuils, condensé d'état).

## 5. Critères d'acceptation
1. Une partie complète Jev vs bot, terminée (victoire ou plafond), journal JSONL exploitable par Erik.
2. Coût ≤ 2 $ mesuré ; latence par tour compatible avec des centaines de parties (objectif futur du banc de calibrage).
3. Taux d'ordres illégaux rapporté et faible (le remplacement par repli bot est acceptable mais documenté).
4. Zéro secret au dépôt ; zéro changement moteur/serveur/protocole/jeu ; suites vertes ; `jev.txt` supprimé après transfert.

## 6. Périmètre interdit
- `apps/server`, prod, jeu distribué, bot solo en jeu (D-doc : hors ligne uniquement) ; `packages/rules` en modification ; tout autre fournisseur IA ; le banc de calibrage 5 nations (chantier suivant, pas celui-ci) ; tout commit de secret ou de journal complet.
