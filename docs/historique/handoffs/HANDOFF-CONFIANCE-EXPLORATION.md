# HANDOFF-CONFIANCE-EXPLORATION — Des seuils de confiance par question + des unités qui n'attendent jamais les bras croisés

**Statut : prêt — NON LANCÉ.** Deux découvertes de la partie réelle d'Erik (YU4SHH, dump admin du 02/11 — `devtmp/etat-YU4SHH/`) : (1) la gate de confiance générique 0,5 **écrase les réponses de Jev en prod aussi** — `fonder` à 0,21 et `convertir` à 0,38 jetés au tour 22, pendant que ses deux villes bâtent des merveilles et qu'aucun colon ne sort : la croissance est bloquée par la même maladie soignée pour `guerreSterile` seule ; (2) l'unité u4 (guerrier, seul membre de l'armée de Jev) reste 4+ tours **sans aucun ordre** (`order null`, pm inutilisés) — aucune question de déplacement au journal. **Canon d'Erik (voté) : tant qu'il reste des cases à explorer, les unités explorent ; Jev peut les rappeler pour protéger ses villes ou les laisser en éclaireur face à un ennemi vu — jamais inactives.**

## 0. Préalables

1. `devtmp/etat-YU4SHH/` (dump admin, journal Jev tours 0-23 — LE corpus de calibrage des seuils, réel) ; `sableuse/REPORT-GUERRE-VIVANTE.md` (le précédent `confianceGuerreSterile 0,3` — canon v2 : « chaque question porte son propre seuil ») ; `sableuse/REPORT-OSCILLATION-MARCHE.md` (l'explorateur ancré + réservation) ;
2. Code : `apps/server/src/jev/joueur.ts` + `sableuse/src/joueur.mjs` (la gate `decisionMin 0,5` — son unique site d'application ; les questions `fonder`/`convertir`/`produire`/`deplacement`), `botPolicy.ts` (explorateur ancré — pourquoi u4 sans ordre : la question est L1), `questions-joueur.json` v10 ;
3. ⚠ Discipline : tests FIRST, port TS bit-à-bit, jev-port via config dédiée, banc via tsx, sonde crédits, **banc réel UNIQUE ≤ 0,60 $**, diagnostic L1 gratuit avant tout code.
4. ⚠ Piège noté : la route trace prod prend `?turn=` (pas `?tour=`) — utile si re-diagnostic.

## 1. Diagnostic L1 (gratuit, AVANT tout code)

1. **La distribution réelle des confidences** : extraire de `devtmp/etat-YU4SHH/jev-tours` (télécharger les journaux 0-23 via `/admin/game/YU4SHH/jev?tour=N`) le tableau question × confidence × choix — combien de réponses valables ont été écrasées par 0,5 par question ? C'est ce tableau qui FIXE les seuils (pas d'invention : les données d'Erik décident).
2. **Pourquoi u4 sans ordre** : le bot de base devrait l'explorer (explorateur ancré, case libre) — tracer où le plan se perd : question de déplacement jamais posée à Jev ? plan bot filtré par `filtrerMarcheBot` à tort ? Hold « explicite » représenté par `order null` (alors le rendre VRAIMENT explicite, journalisé) ? réservation de case qui exclut u4 ?
3. Consigner les deux constats chiffrés au rapport — ils orientent les tests.

## 2. Décisions de tranche (votées — ne rien étendre)

- **D-A — Seuils de confiance PAR QUESTION** (canon v2 appliqué partout) : `seuils.confiance = { guerreSterile: 0.3 (existant), fonder: <valeur du tableau L1>, convertir: …, produire: …, techOfferte: …, … }` — data, défaut conservateur, chaque seuil justifié par la distribution réelle. La gate générique 0,5 ne s'applique qu'aux questions sans seuil dédié. ⚠ Risque assumé et consigné : baisser un seuil fait tirer des choix moins sûrs — c'est VOULU (un adversaire qui décide à 0,25 vaut mieux qu'un qui ne décide pas ; le banc arbitre).
- **D-B — Doctrine d'exploration (canon Erik)** : tant que des cases non couvertes sont atteignables, les unités de Jev SANS autre mission explorent (l'explorateur ancré existant le fait côté bot — étendre à la doctrine Jev : le plan bot de base doit couvrir les unités de Jev, la garde ne filtre que le pas arrière) ; Jev peut rappeler pour protéger (question `protegerCapitale` existante) ou poster en éclaireur face à un ennemi vu — mais **jamais inactif sans ordre explicite journalisé** : toute unité avec pm > 0 sans ordre en fin de tour = anomalie consignée (le correctif : l'ordre tenue explicite ou l'exploration reprend).
- **D-C — Intouchés** : la guerre stérile (seuils propres déjà), la marche (règle anti-recul), gainSite, les déclarations mécaniques, le moteur, Zii, client, `schemaVersion` 28. questions-joueur.json → v11 (copie serveur, test de copie).

## 3. Mission L0→L4

- **L0** : préalables, suites vertes (sableuse 219, jev-port 40, server 415).
- **L1 — Diagnostics consignés** (distribution des confidences par question, la trajectoire perdue de u4).
- **L2 — Tests FIRST** : D-A (chaque question porte son seuil data ; une réponse à confidence ≥ seuil HONORÉE même < 0,5 — le cas fonder 0,21 reconstitué ; sans seuil dédié → 0,5) ; D-B (unité sans mission explore ; unité rappelée protège ; unité en éclaireur reste ; unité sans ordre = tenue EXPLICITE journalisée, jamais `order null` silencieux). Port TS bit-à-bit + tests croisés jev-port.
- **L3 — Banc UNIQUE ≤ 0,60 $** : 4-5 parties vanilla longues (seeds croissance, dont la famille de YU4SHH si le seed est identifiable) — tableau : fondations/partie (la croissance doit reprendre : ≥ 4), unités sans ordre en fin de tour (→ 0), écrasements de réponses valables (→ ~0 par seuil justifié), victoires (non-régression). Suites complètes, commit + push, rapport `REPORT-CONFIANCE-EXPLORATION.md` (tableau L1 des confidences, seuils choisis et pourquoi, banc).
- **L4 — Remise de la main**. Erik rejoue : ses unités explorent, ses villes fondent, ses décisions à 0,2-0,4 passent quand elles sont le meilleur choix disponible.

## 4. Critères d'acceptation

1. Expansion : ≥ 4 fondations/partie au banc (la fenêtre gainSite rouvre avec des colons réellement produits) ;
2. Zéro unité de Jev sans ordre explicite en fin de tour (au banc comme en prod) ;
3. Les seuils sont justifiés par le tableau L1 (pas de valeurs sorties du chapeau) ;
4. Non-régression : victoires, guerres vivantes, suites vertes ; `schemaVersion` 28 ; budget ≤ 0,60 $.

## 5. Périmètre interdit

La gate `guerreSterile` (déjà réglée) ; la logique de fondation (seuils gainSite — ce sont les DÉCISIONS qui manquaient, pas la fenêtre) ; la marche (règle anti-recul) ; le moteur ; bots classiques hors doctrine d'exploration si L1 l'impute au plan de base partagé (alors un seul fix des deux côtés, consigné) ; Zii ; jamais de secret ni de fichier non tracké d'Erik ; pas de banc hors verdict Erik en session.

## 6. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : Erik rejoue — et le gisement de diagnostics prod (codes de partie via les routes admin) reste l'outil de triage de tous les futurs signalements.
