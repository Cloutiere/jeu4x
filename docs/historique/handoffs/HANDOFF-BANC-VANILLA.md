# HANDOFF-BANC-VANILLA — 5 parties complètes Jev vs bot, sans uniques de civilisation, jusqu'à une victoire quelconque

**Statut : prêt — NON LANCÉ.** Question d'Erik (01/11) : « si on laissait aller les parties jusqu'à une victoire quelconque, Jev gagnerait-il ? » C'est une EXPÉRIENCE de mesure, pas un calibrage : zéro changement de règle, zéro retouche de Jev, uniquement le banc.

## 0. Préalables

1. `REPORT-T3-ONU.md` §7 (la variance tranchée 3/20 au plafond 150 tours — la question nouvelle est « et SANS plafond court ? ») ; le banc T3 (`bancs/joueur-t3-onu-2026-10-31`, `--n-parties` déjà paramétrable) ;
2. Code : `sableuse/src/partie.mjs` (boucle de partie, plafond 150 tours, détection `state.winner`), le banc (`sableuse` — script de lancement), data civs (`packages/rules/src/data/civilizations.json` : uniques d'unités, traits — `caravanesPlus50`, `sociabilite`, etc.) et `bot.json`/`botPolicy` (agressivité par civ, canon BOT-TC) ;
3. ⚠ **Crédits TypeSafe** : 9 erreurs 402 vues au banc T3 (parties 19-20) — **vérifier AVANT de lancer** que le compte est rechargé (une partie longue qui replie en v1 fausse l'expérience). Si des 402 apparaissent : ARRÊT, consigne, verdict Erik (relancer la partie après recharge).
4. Discipline habituelle : banc via tsx, mètre `analyse-tbsiege.py` (étendre aux longues durées si besoin — consigné), zéro changement moteur/harnais de décision.

## 1. Le protocole (défauts tranchés — déjà votés par Erik, à relire)

- **P1 — 5 parties complètes** Jev (p1) vs bot classique (p2), **jusqu'à une victoire QUELCONQUE** (`state.winner` posé — domination, science, culture, économique, forfait, raze) ; **cap de sécurité 600 tours** : au-delà, la partie est comptée « indécise » (résultat en soi) ;
- **P2 — Mode VANILLA** : tous les bonus/malus de civilisation NEUTRALISÉS des deux côtés — uniques d'unités désactivés, traits de civ neutralisés (économie/combat/caravanes), **agressivité de civ à neutre** (fini les guerres t10-17 : l'expérience isole le comportement de Jev). Implémentation data-driven : une config/variante de banc (« vanilla ») qui lit des données neutres — le jeu en prod est INCHANGÉ ;
- **P3 — Les autres règles d'hier restent actives** (bataille complète, canon siège, déclaration mécanique — c'est le Jev d'aujourd'hui qu'on mesure) ;
- **P4 — Zéro changement moteur** : le mode vanilla ne touche que les DONNÉES lues par le banc ; `schemaVersion` 28 ; le client, les bots en prod, Zii : intacts.

## 2. Mission L0→L3

- **L0** : préalables ; vérifier crédits LLM (402 ?) ; suites vertes.
- **L1 — Mode vanilla (tests FIRST)** : la config vanilla produit des civs sans uniques ni traits (unités génériques, agressivité neutre) — tests : aucune donnée de civ spéciale ne fuit au condensé ni au moteur de banc ; en prod (port serveur), RIEN ne change (test négatif : la config vanilla n'existe que côté banc) ;
- **L2 — Le banc long** : plafond paramétrable (600), détection `winner` quelconque consignée avec `reason` ; mètre étendu (victoire + raison + tour + stérilité).
- **L3 — L'EXPÉRIENCE (UN SEUL run ≤ 0,80 $)** : 5 parties. Tableau par partie : gagnant, TYPE de victoire (`reason`), tour, villes/forces de fin, déclarations (qui, quand). Réponse écrite à LA question d'Erik : Jev gagne-t-il quand on laisse aller ? Si des parties vont à 600 tours indécises, le consigner comme résultat. Suites non impactées (banc seul), commit des scripts + rapport `REPORT-BANC-VANILLA.md`.

## 3. Critères d'acceptation

1. 5 parties complètes, chacune avec un `winner` + `reason` OU « indécise à 600 » ;
2. Zéro 402 non signalé ; zéro unique de civ actif (prouvé aux tests) ;
3. La réponse à la question d'Erik est claire, chiffre à l'appui ; coût ≤ 0,80 $.

## 4. Périmètre interdit

Moteur, Jev (questions v8, mécanique), bots en prod, Zii, client, `schemaVersion` : INTACTS. Le mode vanilla vit dans le banc SEULEMENT. Pas de re-run sans verdict Erik (partie 402 = arrêt, pas de relance automatique).

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : Erik lit la réponse (Jev gagne-t-il jusqu'au bout ?) et tranche la suite (calibrage ressenti, miroir JvJ, atelier voix, vieux 🔶).
