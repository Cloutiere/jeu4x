# REPORT-CARAVANE — La Caravane : commerce forfaitaire entre nations

**Décisions Erik 19/10** (HANDOFF-CARAVANE) — Caravane jouable : livraison automatique **80/50 or** (Ère Ancienne, ×ère, arrondi au plus proche), capture amendée R-43, Monnaie accorde enfin Caravane + Marché.

## Livré

**Moteur** (`packages/rules`)
- `data/units.json` : `caravane.implemented: true` (0/1/3, coût 30, Monnaie, vision 2, `canAttack:false`, `canFoundCity:false` — données inchangées par ailleurs, D6).
- `data/economy.json` : bloc `caravane` — bases `livreurOr: 80`, `hoteOr: 50`, `captureOr: 80`, `eraFactors` **1/2/3/5** (data-driven, note de divergence consignée dans le fichier).
- `src/caravane.ts` (NOUVEAU) : calculs purs — `isCaravane`, `facteurCaravane`, `montantsLivraison` (arrondi au plus proche, indépendant), `montantCapture` (ère du PROPRIÉTAIRE). Exporté par `index.ts`.
- `src/turn.ts` :
  - **D1 — livraison** : au pas d'entrée (movement loop), AVANT Grande Muraille / village / branches combat-capture : `cityAt` étrangère + caravane → paiement livreur/hôte, événement `CaravanDelivered`, consommation (`kill` cause `mission` — jamais de cohabitation R-30, défenseur intact) ;
  - **dépose navale** (`tenterDepose`) : le filtre « case vide » est amendé pour la caravane sur ville étrangère (toujours « entrable » — défenseur compris) ; la dépose LIVRE (miroir du câblage ARTEFACT/HUTTE) ;
  - **D3 — capture** (`capturePeaceful`) : en guerre, le capteur encaisse `80 × facteur(ère du propriétaire)` au lieu du butin Colon (10), `Captured.caravanGold` porté ; en paix : détention standard, aucun or ; barbares : rien (R-95 inchangée) ; Colon : R-43 inchangée (test).
- `src/events.ts` : `CaravanDelivered { livreur, hote, montantLivreur, montantHote, villeId, at }` + `Captured.caravanGold?` + refs (fog).
- `apps/server/src/botPolicy.ts` : **D4** — le bot ne produit jamais de caravane (`u.id === 'caravane'` exclu).

**Client** (`apps/web`)
- `labels.ts` : libellé `CaravanDelivered` ; `chronique.ts` : entrées Monde — livraison (chaque camp voit SA part ; tiers : mention neutre) et capture (« Caravane de X capturée par Y — N or saisis ») ;
- `render/playback.ts` : durée 360 ms + toast `good`.

**Règles & tests**
- RULES.md : **R-186** (D1-D8 complète) + amendement R-43 (capture caravane).
- `tests/caravane.test.ts` (NOUVEAU, 11 tests) : montants Ancienne/Médiévale (+160/+100 — critère #1), ère du LIVREUR, table 1/2/3/5, consommation + défenseur intact (pas de combat, pas de Captured), ville détruite en route = zéro paiement, capture (capteur +80 / +160, propriétaire rien, `caravanGold`), paix = détention sans or, Colon inchangé (10 or), embarquement-dépose-livraison sur ville défendue, déterminisme, données (canAttack/canFoundCity/implemented).
- Révisés : `tests/techs.test.ts` (caravane `implemented: true`), `tests/bonus-decouverte.test.ts` (le bonus Monnaie accorde désormais caravane ET marché — R-109 s'active de lui-même, aucun code moteur touché).

## Suites (vertes)
- règles : 1087/1087 (dont 11 nouvelles) ; web : 691/691 ; `tsc` server + rules 0 ; svelte-check 0 erreurs.
- e2e GUI `devtmp/caravane-gui.mjs` (ports dédiés 8797/5191) → captures `dev-logs/captures-caravane/` : production menu, caravane sur carte, trajet multi-tours, livraison (montants aux DEUX trésoreries au dump admin).

## 🔶 Consignés (à l'œil Erik)
1. **Table d'ère DISTINCTE de la table rush** : le handoff annonce « la TABLE PARTAGÉE du rush-buy R-135 (Ancienne ×1, Médiévale ×2…) » mais la table R-135 réelle (economy.json, canon dataminé 06/09) est **×2/×3/×4/×8**. Le critère d'acceptation #1 (Médiévale = +160/+100, donc ×2) fixant l'intention, j'ai créé la table `caravane.eraFactors` **1/2/3/5** (chiffres dictés) et NAI PAS touché à la table rush (« lue, jamais modifiée »). Si la table rush devait être LA source, les montants passeraient à 160/100 dès l'Ancienne — verdict Erik attendu.
2. **Grande Muraille ne bloque pas une livraison** : la livraison précède le test de la merveille (D1 « la case ville est toujours entrable »). Alternatif : la bloquer comme une attaque.
3. **Fog de la livraison adverse** (D7) : fog standard — livreur et hôte sont référencés par l'événement (chacun voit SA transaction) ; un tiers ne voit l'entrée Chroniques que si la case est visible/explorée (même politique que les captures). Le libellé tiers est volontairement neutre (pas de montants).
4. **Capture en PAIX = détention sans or** : D3 ne parle que de capture « règles normales R-43 » ; en guerre il y a destruction + butin, en paix détention — j'ai appliqué l'or UNIQUEMENT en guerre. Une caravane détenue puis « butin + guerre » (§7.7-c) suivra le choix du capteur (or standard du détenu, pas le tarif caravane — non tranché, hors périmètre).
5. **e2e GUI — LIVRAISON capturée en écran NON obtenue ; capture D3 VALIDÉE en jeu réel** : `devtmp/caravane-gui.mjs` (ports dédiés, partie solo/multi réelle) a produit les captures production/menu/carte/trajet/chroniques (`dev-logs/captures-caravane/`). La LIVRAISON écran n'a pas été obtenue après de nombreuses tentatives — causes d'infrastructure consignées : zombies wrangler/workerd locaux (verrous « ordres déjà verrouillés », workers figés après ~10 tours), bot solo RASANT sa propre capitale sous les barbares vers t45-72 (fin de partie avant l'arrivée), chemins brume/eau (corrigé par BFS terrain). En revanche la **D3 a été validée en jeu RÉEL** dans une de ces parties : la caravane interceptée par le bot a émis `Captured.caravanGold: 80` (le capteur encaisse 80 × ère du propriétaire). La livraison (D1) et l'embarquement-dépose-livraison restent couverts par les tests moteur (caravane.test.ts : montants exacts, consommation, défenseur intact, dépose SUR ville défendue).
6. **Tooltip caravane** : rien de spécifique R-43 n'existe côté client (tooltips = tuile/stats génériques) — rien ajouté.
7. **Icônes VAGUE5** : textures `unite_caravane_j1..j4` (4 palettes chargées dans textures.ts) — si une partie à 5-6 nations affiche la caravane, repli atelier prévu (état VAGUE5 inchangé).

## Pièges e2e rencontrés (consignés)
- Monnaie = ~40+ tours de recherche en solo (chaîne poterie → alphabet → travail_du_bronze → code_des_lois → monnaie, conversion science obligatoire) — boucle de production portée à 75 tours, redémarrages wrangler gérés.
- Le bonus Premier découvrir peut accorder la caravane GRATUITEMENT avant la production (concurrence du bot sur la tech) — le script prend la première caravane trouvée.
- Fixture moteur : une ville par défaut PRODUIT un colon (garnison de fait sur le chemin) et le palier 100 or en lâche un second — deux scénarios de test contaminés, neutralisés (production bâtiment, purge de l'unité entre les tours).
