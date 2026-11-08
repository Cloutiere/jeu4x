# HANDOFF-CARAVANE — La Caravane : commerce forfaitaire entre nations

**Décisions Erik 19/10** (vision dictée, tranchés 1-8 votés + règle de capture). Activation de la Caravane (`implemented: false` → jouable) : l'amener dans une ville étrangère paie 80 or au livreur et 50 or à l'hôte (Ère Ancienne), × multiplicateur d'ère du rush-buy, arrondi au plus proche.

## 1. Préalables

- Lire R-43 (unités pacifiques/capture — À AMENDER), R-135 (rush — la TABLE des facteurs d'ère est PARTAGÉE : l'Ère Ancienne = ×1, la base 80/50 EST la valeur Ancienne), R-109 (le bonus Premier découvrir de Monnaie accordera enfin la Caravane — à vérifier qu'il s'active automatiquement quand `implemented` passe à true), R-117 (embarquement — la Caravane est embarquable comme toute terrestre), R-30 (une entité par case ville).
- Baseline : suites vertes à jour, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions Erik (votées — non négociables)

- **D1 — Livraison** : entrer sur la case d'une ville ÉTRANGÈRE (toute autre nation, visible et atteignable) avec une Caravane = **livraison automatique à l'arrivée** (miroir hutte) : livreur **+80 × mult**, hôte **+50 × mult**, la Caravane est **consommée**. Aucune capture possible lors de la livraison — la case ville est toujours « entrable » pour elle (le défenseur en place ne bloque pas : l'unité disparaît, jamais de cohabitation R-30).
- **D2 — Multiplicateur d'ère** : la TABLE PARTAGÉE du rush-buy R-135 (Ancienne ×1, Médiévale ×2, Industrielle ×3, Moderne ×5 — data-driven, une seule source) ; ère de référence = celle du **livreur** ; **arrondi au plus proche** (les deux montants indépendamment).
- **D3 — Capture d'une caravane** (amendement R-43) : si une unité ennemie CAPTURE une caravane (règles normales R-43 — case contestée/occupée hors livraison), le **capteur touche immédiatement 80 × mult de l'Ère du PROPRIÉTAIRE de la caravane** (le bonus de livraison qui aurait été le sien) ; le constructeur ne reçoit RIEN ; la caravane disparaît.
- **D4 — Pas d'autre usage** : pas de fondation, pas d'attaque (R-43 inchangée par ailleurs), une seule livraison par unité (consommée) ; le bot solo ne produit pas de caravanes (hors périmètre).
- **D5 — Trait espagnol `caravanesPlus50`** : reste INACTIF (documenté) — dossier séparé.
- **D6 — Données** : `caravane.implemented: true` (0/1/3, vision 2, coût 30, Monnaie, `canAttack:false`, `canFoundCity:false`) ; aucune migration attendue (aucun champ d'état nouveau — la livraison/capture sont des crédits d'or + événements) ; `schemaVersion` 27 sauf nécessité démontrée.
- **D7 — Événements + Chroniques** : `CaravanDelivered { livreur, hôte, montants, ville }` et l'événement de capture enrichi (montant capté) — fog standard (le joueur voit ses transactions ; la livraison adverse visible comme les captures ? à l'œil, consigné), libellés journal.
- **D8 — UI** : la caravane est productible (menu, onglet Unités — icône VAGUE5) ; la préview vivante/preview optimiste ne changent pas (c'est un Move) ; entrée Chroniques à la livraison et à la capture.

## 3. Mission

- **L1 — test-first (moteur)** : livraison (montants exacts par ère — table partagée, arrondi, consommation, défenseur en place ne bloque pas, ville détruite en route = pas de paiement), capture (capteur = 80 × ère du propriétaire, constructeur rien), R-43 inchangée pour le Colon, embarquement/dépose de caravane (la dépose sur ville étrangère livre — miroir du câblage ARTEFACT/HUTTE à la dépose), bonus Monnaie Premier découvrir (caravane + marché accordées), déterminisme.
- **L2 — moteur** : D1-D3 (Phase A/C au pas d'entrée — motif `openHutAt`/`balayages`), événements, labels, `orderShapeError` non concerné (aucun ordre nouveau).
- **L3 — client** : rien au-delà des Chroniques/libellés et de la productibilité (données) ; vérifier tooltip caravane (R-43 déjà libellée ?).
- **L4 — captures GUI avant commit** (`dev-logs/captures-caravane/`) : production, trajet multi-tours, livraison à une nation (montants au dump serveur des DEUX trésoreries), capture par un barbare/enanti, embarquement-dépose-livraison.
- **L5** : suites vertes complètes, RULES.md (nouvelle règle Caravane + amendement R-43), commit, push, rapport `REPORT-CARAVANE.md` (🔶 fog de la livraison adverse, D5).

## 4. Critères d'acceptation

1. Livraison : +160/+100 à l'ère Médiévale (80/50 ×2) aux bonnes trésoreries, caravane consommée ;
2. Capture : le capteur encaisse 80 × ère du propriétaire, rien pour le constructeur ;
3. Aucune capture à la livraison, défenseur inoffensif ;
4. Bonus Monnaie complet (caravane ET marché) ; suites et bancs verts.

## 5. Périmètre interdit

Routes (inexistantes), le trait espagnol (D5), le bot, tout le 3D, les valeurs rush-buy (table partagée lue, jamais modifiée), `schemaVersion` sauf nécessité.

## 6. Fin de session

Rapport (🔶 consignés), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
