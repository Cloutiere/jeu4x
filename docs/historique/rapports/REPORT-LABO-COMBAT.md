# REPORT-LABO-COMBAT — Le laboratoire de programmation et de résolution

**Statut : livré et accepté par usage (Erik), déployé en prod. Session itérative du 15-16/09 close.**

## Itérations de la session du 15-16/09 (retours Erik)

1. **Déploiement Cloudflare** — Erik étant à distance, le labo est déployé sur le Worker de
   prod : https://game-4x-server-prod.erik-ai-studio.workers.dev/#/labo-combat (wrangler
   deploy --env prod, front + API même origine). La route a été déplacée AVANT la garde de
   session dans App.svelte (comme #/atelier) : le labo s'ouvre sans login, aucun appel /api.
2. **Lignes d'ordres toujours visibles** — les chemins/cibles/fondations programmés des DEUX
   joueurs s'affichent en permanence (l'onglet actif en surépaisseur, l'autre en trait fin),
   quel que soit l'onglet de programmation actif.
3. **Couleurs codifiées** (SPEC-ART / textures.ts PLAYER_COLORS) : J1 menthe néon `#3dffce`,
   J2 bleu vif `#3b6fd6`, **barbares en rouge** `#e03131` (le rouge leur est réservé) ; texte
   sombre sur les pastilles menthe ; hint « menthe (J1) / bleue (J2) ».
4. **Cases numérotées** : chaque case affiche ses coordonnées `(q,r)` (case à cocher pour
   masquer) — lecture directe des coordonnées du journal sur la carte.
5. **Journal unique en 4 sections + copie** (demande explicite d'Erik pour l'ajustement) :
   - `— DISPOSITION DE DÉPART —` : chaque unité (id, type, camp, position, PV, vétéran,
     fortification), chaque ville, chaque camp barbare (pile, compteur de spawn) ;
   - `— ORDRES DONNÉS —` : chaque ordre avec **toutes les cases traversées**, la
     **destination programmée**, l'action finale (fondation), la cible d'attaque, tenir ;
   - `— RÉSOLUTION —` : événements avec contexte courant — PV **avant→après** par échange,
     terrain (bonus défensif) du défenseur, replis qualifiés (« case d'origine (libre,
     R-54-1) » vs « case adjacente la plus proche de l'origine, R-54-2 »), captures, butin,
     spawns ;
   - en-tête Tour/seed.
   Boutons : **📋 Copier le journal complet** et **🧾 Copier la disposition** (poses + ordres
   + seed en JSON) — Erik colle le journal à ZCode pour reproduction exacte d'un tour.
6. **Résumé des ordres avant résolution** : la section « Résoudre » liste les ordres des deux
   côtés tels qu'ils partiront au moteur (détection d'ordres inattendus).
7. **Détection d'anomalie ouverte — le « double repli »** : deux fois, le journal d'Erik a
   montré un attaquant en survie mutuelle replié DEUX fois (origine puis adjacente). Les
   balayages exhaustifs (positions u2 × camps × gardes × 2000 configs fuzz) n'ont PAS
   reproduit le cas. Prochaine session : Erik rejoue la disposition et colle le journal
   complet (disposition + ordres + seed inclus) pour reproduction exacte et arbitrage.

Constat au passage (journal enrichi) : un explorateur barbare aggro peut AVANCER sur la case
d'une unité ennemie et y être **capturé sans combat** (unité pacifique, R-43 — destruction +
10 or de butin) ; comportement invisible dans l'ancien journal.

Déploiements prod effectués : versions `202a2fa5` (labo), `620c1a7d` + `753825ab` (couleurs/
lignes) puis version finale (journal 4 sections) — vérifiées dans le navigateur.

## Ce qui existe maintenant

Nouvelle route dev **`#/labo-combat`** (URL seule, aucun lien depuis l'UI de jeu, comme `#/progen`) :
outil client pur — le vrai moteur (`@game/rules`, résolution seedée R-80) tourne dans le
navigateur, **zéro appel serveur**.

### M1 — La carte de test (pose libre)
- Carte hexagonale rectangulaire ajustable (largeur/hauteur/fond), **pinceau de terrain**
  (prairie, plaine, forêt, colline, montagne, désert, eau, océan — montagne/eau infranchissables
  refusées à la pose).
- **Placement libre** : outil « Poser » — unité (guerrier, archer, piquier, cavalier, legion,
  catapulte, colon, explorateur, milice), **camp** Joueur 1 / Joueur 2 / Barbare, PV courants
  ajustables (bornés au max du type). Pile amie autorisée sur une même case.
- **Villes posables** (J1/J2, pop et capitale éditables — rayon de travail du moteur tel quel) ;
  **camps barbares posables** : réglage gardes (0–4, T-49 — ne sortent jamais) + explorateur
  (agit, R-97). Le régime BARBARES-PILES s'applique tel quel (les poses alimentent
  `spawnedUnits` ; la dotation automatique T-50 de `makeState` est retirée pour que le labo
  pose SES barbares).
- Outil « Éditer » : clic sur une unité/ville/camp posée → modification ou retrait.
- Compteur « Spawn barbare » (T-18) réglable (0 = jamais de spawn pendant le test).

### M2 — Programmer et résoudre
- **Onglets « Programmer J1 » / « Programmer J2 »** : sélection d'une unité au clic, puis
  **chemin multi-étapes R-158** (clics de cases adjacentes en chaîne, re-clic = annuler le
  dernier pas), **attaque adjacente** explicite, **action finale fondation** (colons), Tenir,
  Effacer. Validations côté page (adjacence, passabilité) ; le moteur revalide tout.
- **Barbares** : comportement automatique du moteur à la résolution (garde/explorateur, aggro
  T-19) — rien à programmer.
- **Résoudre le tour** : `resolveTurn` réel, **seed affiché et modifiable**. Reproductibilité
  vérifiée dans l'interface : revenir à l'avant-résolution puis re-résoudre avec le même seed
  redonne le **même journal à l'identique** (constaté e2e).
- **Journal complet** à côté de la carte : chaque Move, ATTAQUE, échange (PV après), MORT,
  REPLI, spawn, fondation, tour résolu — combat par combat, c'est l'outil d'ajustement.
  **Avant/après** : survivantes (PV avant→après, position) + liste des mortes.
- **Bonus livré** : « ↩ Revenir à l'avant-résolution » (snapshot, mêmes ordres rejouables) et
  « ▶▶ Poursuivre » (l'état résolu devient la base du tour suivant, ordres gelés visibles).

## Fichiers
- `apps/web/src/lib/laboCombat.ts` — module PUR : `creerEtatLabo` (poses libres → GameState v24
  validé via la fixture canonique `makeState`, fog désactivé), `ordreDe` (R-158 : MultiStep +
  `foundCity`, attaque, Hold), `formatEvent` (journal FR), helpers camps.
- `apps/web/src/pages/LaboCombat.svelte` — la page (carte SVG maison, outils, programmation,
  résolution, journal, avant/après).
- `apps/web/src/App.svelte` — enregistrement de la route (avant la garde de session).
- `apps/web/tests/labo-combat.test.ts` — **13 tests** (voir M3).

## M3 — Vérification
- **Tests purs (13, verts)** : pose/état (trois camps, PV ajustables, fog désactivé, pile du
  camp dans `spawnedUnits`, pas de dotation automatique, déterminisme de la construction) ;
  **reproductibilité seed** (même config + mêmes ordres + même seed = mêmes événements ET même
  état) ; ordres des deux côtés dans la même résolution ; **assaut de pile** (2 gardes +
  explorateur vs 2 guerriers J1 — journal combat par combat, gardes immobiles) ;
  **dispute de destination R-159** (une seule unité arrive, l'ordre du perdant tronqué, les deux
  survivent) ; MultiStep + fondation (R-158) ; aggro barbare (T-19) ; `formatEvent`/`ordreDe`.
- **Isolation** : un espion sur `fetch` échoue les tests au moindre appel réseau — le labo ne
  dépend d'aucun serveur.
- **e2e GUI** (captures dans `dev-logs/captures-labo-combat/`, locales) :
  - `01-assaut-configuration.png` — 2 guerriers J1 + camp barbare (2 gardes + explorateur) +
    1 guerrier J2 posés au clic ;
  - `02-assaut-journal.png` — les deux côtés programmés (attaques J1, Tenir J2), tour résolu :
    journal ATTAQUE/échange/REPLI un par un + avant/après (PV, replis) ;
  - `03-dispute-r159.png` — deux guerriers J1 programmés vers la même case : une seule arrive,
    l'ordre de l'autre est tronqué ;
  - `04-lignes-deux-cotes.png` — chemins J1 (menthe) et J2 (bleu) visibles simultanément ;
  - `05-journal-enrichi-cases-numerotees.png` — cases numérotées (q,r) + journal qualifié.
  - Reproductibilité rejouée dans l'interface (revenir → re-résoudre même seed → journaux
    identiques).
- **Suite verte forcée : 1182 tests** (818 rules + 289 web + 75 server) — la baseline 1169 +
  les 13 nouveaux. **Typecheck 4/4** (svelte-check 0 erreurs). `schemaVersion` **24** intacte.
  **Zéro diff 3D, zéro diff serveur, zéro moteur** (seuls `apps/web` et ce rapport changent).

## Notes d'implémentation (pour l'itération d'Erik)
- Le labo OBSERVE la résolution : aucune valeur de calibrage touchée (périmètre interdit
  respecté).
- Une pile de 1–2 barbares est entièrement « garde » (T-49) : pour voir un explorateur sortir,
  poser 2 gardes + 1 explorateur.
- Un garde peut être REPLIÉ par un combat perdu (R-54) — c'est un mécanisme distinct de la
  sortie volontaire (constaté au cours de l'e2e).
- L'action finale `foundCity` exige des PM restants au terme du chemin (sinon annulée,
  mouvement conservé — R-158) : le journal le montre.
- Thème sombre : la page porte ses propres couleurs (fond panneaux, texte clair) — les
  premières captures montraient du texte invisible, corrigé avant la capture 03.
- Limites connues (non bloquantes, à itérer) : pas d'import/export JSON de configuration, pas
  de pose de huttes/artefacts, programmation J2 limitée aux unités J2 existantes.
