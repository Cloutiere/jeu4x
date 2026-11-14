# HANDOFF-DIAG-BATIMENT-CULTURE-PRECOCE — Un bâtiment de culture disponible dès le début, sans technologie (diagnostic + proposition, zéro code)

**Mission d'ANALYSE — pas une livraison de fonctionnalité. Zéro modification de code, zéro banc.** Objectif : Erik veut ouvrir la voie de victoire **culture** plus tôt dans la partie (aujourd'hui, la culture n'est atteignable qu'en fin de partie — les seuils de victoire culturelle sont hors de portée au banc), via **un nouveau bâtiment de culture disponible dès le début de partie, SANS technologie préalable**. Ton travail : comprendre comment les points de culture se génèrent, inventorier ce qui existe, et **PROPOSER un bâtiment** avec ses chiffres. Erik arbitrera ensuite ; une mission d'implémentation suivra (peut-être pas toi).

## 1. Préalables

- Docs à lire : RULES.md (voies de victoire — culture ; T-xx culturels existants), DESIGN.md (philosophie), `PROJET.md` §socle (zone culturelle, culture). Sources canon : **la fidélité à CivRev prime** — Erik fournit les constats du vrai jeu ; s'il existe des documents de référence d'Erik sur la culture (`docs/recherche/`, `Territoire_culturel.md` à la racine), ils FONT FOI.
- Baseline : rules 1214 / server 503 / web 793 / jev-port 52 / sableuse 228 verts, `schemaVersion` **28**. **Zéro push sauf le rapport.**
- Contexte connu : les seuils de victoire culturelle (20 jalons / 20 000 or pour l'économique — voir T3-ONU) sont **humains seulement au banc** ; la zone culturelle en dégradé continu existe (ZONE-CULTURELLE-DEGRADE).

## 2. Les questions auxquelles le rapport répond

1. **Comment les points de culture se génèrent-ils aujourd'hui ?** Exhaustif et chiffré : par ville (citoyens affectés ? bâtiments ?), par merveille, par chef/gouvernement, par jalon de zone culturelle, par événement — chaque source avec son unité (points/tour) et l'endroit exact du code (fichier:ligne). La formule du jalon culturel (les « jalons » de la voie culturelle) et son seuil de victoire.
2. **Qu'existe-t-il comme générateurs de culture construits ?** Inventaire complet des bâtiments/merveilles à effet culture (nom, coût, tech de déblocage, effet chiffré, ère) — avec la constatation clé : **quel est le PREMIER générateur de culture accessible et à quel tour/tech ?** (l'écart entre ce premier accès et le début de partie est le trou à combler).
3. **Proposition : UN bâtiment** (pas une liste de dix) — disponible **dès le début, sans tech**, avec :
   - nom CivRev-plausible + effet chiffré (points de culture/tour ? autre mécanique ?) ;
   - **coût en marteaux** calibré (comparé aux bâtiments de début existants : grenier, caserne… — justifier le placement) ;
   - **l'argument d'équilibre** : pourquoi ça ne casse pas la voie science/domination (le coût d'opportunité des marteaux est la balance naturelle — chiffrer : X marteaux = Y tours de guerrier perdus) ;
   - **l'implémentation data-driven** (où ça s'insère dans les tables existantes : c'est un bâtiment = une entrée de données + l'effet dans la formule de culture — estimer l'ampleur : mineur si l'effet existe déjà pour un autre bâtiment) ;
   - **le plan de banc** : quel banc mesure l'effet (culture/partie ? jalons ?) et quel critère Erik arbitrera.
   - **2-3 variantes de calibrage** (ex. effet faible/coût bas vs effet fort/coût élevé) avec ta recommandation argumentée — Erik tranche un chiffre.

## 3. Méthode

Lecture du code (`packages/rules` — culture, victoire, bâtiments, merveilles ; `data/` tables), lecture des documents d'Erik, chiffrage sur des exemples concrets (une ville type t10 : culture/tour avant et avec le bâtiment). Si un document de référence d'Erik contredit le code, LE DOCUMENT GAGNE (consigner l'écart).

## 4. Livrable

`PROPO-BATIMENT-CULTURE.md` à la racine : les réponses aux 3 questions (génération exhaustive chiffrée, inventaire, trou temporel), **la proposition unique** avec variantes de calibrage, l'ampleur d'implémentation estimée, le plan de banc. Puis arrêt, remise de la main — Erik tranche, le pilot cadre la mission d'implémentation.

## 5. Périmètre

Zéro modification de code, zéro banc, zéro partie. Ne jamais committer les secrets ni les fichiers personnels d'Erik (`Techtree/`, `Territoire_culturel.md` et PDF restent hors git — les LIRE mais pas les committer).

**Pièges** : 46 techs (pas 44) ; les merveilles ont obsolescence/exclusivité (le bâtiment proposé ne doit pas duper une merveille existante — vérifier) ; culture = la voie où les filtres bots/ex seuils s'appliquent au banc (le plan de banc doit le mentionner).
