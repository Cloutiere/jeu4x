# DIAG-VERROUS-SIEGE — Classement des 3 verrous restants de l'approche de siège

**Diagnostic READ-ONLY du 14/11 (HANDOFF-DIAG-VERROUS-SIEGE) — zéro code source, zéro banc officiel, zéro partie LLM.** Méthode : re-simulations locales INSTRUMENTÉES (`apps/server/devtmp/diag-verrous-siege.ts`, miroir exact de `simulerPartie` `bancBotTd.ts:67` — mêmes RNG `botTurnSeed`, mêmes helpers) sur **20 seeds du corpus × 2 difficultés** (40 parties, 150 tours) + forensic des journaux Jev (`bancs/joueur-collision-mobile/`). Résultats bruts : `devtmp/diag-verrous-siege-resultats.json`.

## Le classement (dominant d'abord)

### 🥇 V3 — D1 épinglant : LE verrou dominant (et sa vraie cause : les barbares)

| Mesure (40 guerres analysées) | normal (20 guerres) | difficile (20 guerres) |
|---|---|---|
| Tours-membres d'armée épinglés par D1 | **5 539** | **6 973** |
| Part des tours-membres épinglés (hors maison) | **48 %** | **44 %** |
| Guerres avec ≥ 1 pin d'assiégeant | 17/20 | 18/20 |
| **Pins dont le chasseur est un BARBARE** | **5 208 (94 %)** | **6 520 (94 %)** |
| Pins dont le chasseur est un ennemi de guerre | 331 (6 %) | 453 (6 %) |

**Mécanisme** : le déclencheur de poursuite D1 (`planAntiCollision`, `botPolicy.ts:4xxx`) compte comme « chasseur » tout ennemi CONNU — **barbares compris** (miroir `defenseVille.ennemisConnus`, R-95). Or les barbares errants traversent en permanence le rayon de poursuite (2 tours de MARCHE) autour des villes domestiques : un membre d'armée qui hésite à d≤2 de chez lui est épinglé ~tours après tours (hystérésis inclus) vers le refuge D1 **pendant une guerre OFFENSIVE**. Il ne part jamais ; dist moyenne des membres à la ville de campagne : **22,2** (normal) / **22,3** (difficile) — l'armée ne converge pas.

### 🥈 V2 — effectif au rayon : structurel, mais c'est le SYMPTÔME de V3

| Mesure | normal | difficile |
|---|---|---|
| **maxEffectifRayon moyen** (assaut TB-SIEGE exige ≥ 4) | **0,1** | **0,1** |
| Guerres dont l'effectif n'a JAMAIS atteint 4 au rayon | **20/20** | **20/20** |
| maxTailleArmee moyen (les troupes EXISTENT) | 6,0 | 8,0 |
| Tours « effectif insuffisant » moyens par guerre | 108,7 | 114,5 |
| tourEffectif4 moyen | jamais | jamais |

Les armées existent (6-8 membres produits) mais **ne se rassemblent JAMAIS** : l'anneau de ralliement n'est atteint par personne. Ce n'est pas un plafond de production ni le seuil 4 en soi — c'est la conséquence directe des pins V3 (les membres restent à ~22 cases). **Interaction explicite** : poser V2 seul (baisser effectifCampagne) ne fermerait RIEN — l'effectif au rayon est 0,1, le seuil 4 ou 1 ne change rien tant que personne ne marche. Ordre de pose : **V3 d'abord, V2 re-mesurer ensuite**.

### 🥉 V1 — gate R-190 tôt : quasi inoffensif ici

| Mesure | normal | difficile |
|---|---|---|
| Refus du gate pendant les guerres (toute durée) | 26 | 36 |
| Refus avec k = 2 (début de guerre) | **0** | **0** |
| Refus avec k ≤ 1,3 (guerre ≥ 7 tours) | 14 | 33 |
| Refus AU RAYON du siège | 0 | 2 |
| Assauts PARTIS au rayon (gate favorable) | 4 | 6 |
| (comparaison : refus gate vs barbares en chasse) | 17 669 | 14 957 |

Le gate refuse 26-36 attaques par campagne entière — un bruit à côté des 40 guerres jamais réunies, et **jamais à k = 2** : quand une cible est favorable, elle passe même tôt. Les 14-33 refus k ≤ 1,3 sont des duels défavorables refusés tard — comportement voulu. **Lever V1 ne fermerait presque rien ; ne pas toucher** (éviterait aussi de rouvrir le profil stérile D3UUQJ).

## Levier recommandé (UNIQUE)

**V3-(ii) — Exclure les barbares du déclencheur de poursuite D1 pour les MEMBRES de l'armée de campagne offensive uniquement** (guerre déclarée en cours, `assignerArmee`/`cibleCampagne` existants — zéro nouvelle table) :

- **Paramètre** : dans `planAntiCollision`, le test « chasseur » ignore les ennemis `isBarbarian` quand l'unité est membre de l'armée de campagne en guerre déclarée. (Variante plus large — exclure les barbares pour TOUTES les unités : plus simple, mais change GZJQZX, voir risque.)
- **Effet attendu chiffré** : libère ~94 % des 5 539 + 6 973 pins observés (~44-48 % de tous les tours-membres) → le rassemblement devient possible (6-8 membres disponibles) → maxEffectifRayon ≥ 4 atteignable en ~10-20 tours de marche (dist 22, mouvement 1, durées de guerre observées 63-67) → les assauts TB-SIEGE partent (le gate les laisse déjà passer, §V1).
- **Risque GZJQZX** : la variante LARGE (toutes unités) supprimerait la poursuite D1 contre u27-barbare — mais la protection ESSENTIELLE (jamais le pas fatal) reste portée par **D2-collision mobile** (u27 mobile → case d'arrivée refusée → Fortify, test 30 seeds inchangé) ; seule la réponse « entre en ville » disparaîtrait. La variante CIBLÉE (membres de campagne seulement) laisse **GZJQZX bit-à-bit intact** (u4 n'était pas membre d'une campagne offensive) — recommandée.
- **Risque piétinement** : nul par construction — on SUPPRIME des Fortify (les membres repartent en marche), on n'en ajoute pas.
- **Test de verrouillage** : re-jouer le diag instrumenté (`devtmp/diag-verrous-siege.ts`) — critère : pins membres de campagne → ~0 (le résidu 6 % = ennemis de guerre, voulu) ; maxEffectifRayon ≥ 4 dans la majorité des guerres ; puis banc bot 40×3 (victoires ≥ ~8) et banc Jev (0 collision mobile, pertes ≤ 10).
- **V2 ensuite SI nécessaire** : après V3, si le rassemblement reste partiel, baisser `effectifCampagne` (4 → 3) — mais ne PAS le poser en même temps (mesurer l'effet propre de V3).

## Les réponses aux 3 questions (chiffrées, §2 du handoff)

1. **Gate tôt** : 0 refus à k = 2 sur 40 guerres ; 26-36 refus totaux par difficulté, presque tous à k ≤ 1,3 (duels défavorables refusés — voulu) ; les assauts partent quand l'armée est au rayon (4-6). **Non, le gate n'est pas le verrou.**
2. **Effectif 4** : 20/20 + 20/20 guerres jamais ≥ 4 au rayon (max moyen 0,1) alors que les armées de 6-8 existent — le blocage est AVANT le seuil (les troupes ne marchent pas), pas le seuil lui-même.
3. **D1 épinglant** : 44-48 % des tours-membres épinglés, **94 % par des barbares**, dans 35/40 guerres — le refuge D1 confond chasse domestique et poursuite de guerre et ramène les assiégeants. **Oui — et c'est le verrou dominant.**

## Fichiers

- Script : `apps/server/devtmp/diag-verrous-siege.ts` (re-simulations instrumentées, tsx, ~20 min / 40 parties).
- Résultats bruts : `devtmp/diag-verrous-siege-resultats.json`.
- Baseline : `2b4e386` (pushé, prod 200) — **aucun fichier source touché** (git diff vide hors ce document).
