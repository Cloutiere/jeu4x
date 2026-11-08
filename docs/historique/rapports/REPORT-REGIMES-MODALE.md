# REPORT-REGIMES-MODALE — Modale « Nouveaux régimes » (handoff 05/10, D1-D5)

## Livré

Client seul, zéro moteur/serveur/protocole, `governments.json` et schemaVersion 27 intouchés (R-122 inchangée).

- **L1 — logique pure (`apps/web/src/lib/regimesModale.ts`)** :
  - `regimesDebloquesCeTour` / `fenetreRegimeActive` : détection sur `techsUnlockedThisTurn` (même état moteur que le moteur — aucun champ nouveau) ;
  - `lignesRegimes` : les 6 régimes avec état `actif | gratuit | payant | verrouille` (gratuit = `anarchyFreeAdoption` OU immunité R-149 ; payant jamais de coût masqué — D4) ;
  - `refusAnarchie` : miroir du refus moteur pendant l'anarchie (D2) ;
  - `iconeRegime` (D5) : images cuites TECHTREE (`tech_monarchie/code_des_lois/democratie/communisme/religion.jpg`), **Despotisme = repli générique or `/art/icone_gouvernement.png`** 🔶 (art Erik plus tard).
- **L2 — UI** :
  - `RegimesModale.svelte` : modale AAA or-sur-sombre (miroir idle-dialog/TECHTREE), liste des 6 régimes (icône, nom, effets/penalités R-121), actif marqué, gratuits **surlignés or + badge « ✨ Sans anarchie — ce tour seulement »**, payants « Coût : 1 tour d'anarchie » avec **confirmation explicite en deux clics** (bouton devient « Confirmer (1 tour d'anarchie) »), verrouillés inertes ; refus affiché + boutons désactivés pendant une anarchie ; Échap / croix / clic extérieur / « Décider plus tard » — ne bloque jamais le tour. Clic = ordre `SetGovernment` existant (D2).
  - Déclenchement dans `Game.svelte` : `TechResearched` d'une tech de gouvernement (garde `lastReplayedSeq` — une fois par complétion).
  - **D3 — badge `GovernmentPanel`** : « ✨ Sans anarchie cette tour » tant que la fenêtre est ouverte (jamais affiché pendant l'anarchie, qui prime).
- **L3 — GUI réelle** (`devtmp/regimes-modale-gui.mjs`, partie solo 4JP6Z8 → Z2EPDS, capitale côtière car le commerce/science vient de l'eau R-107) :
  - A : complétion `code_des_lois` → modale, République **gratuite surlignée or** + badge panneau ✅ ;
  - B : complétion `monarchie` plus tard → modale, Monarchie gratuite, **République devenue payante avec coût affiché** ✅ ;
  - C : clic République → « Confirmer (1 tour d'anarchie) » → adoption, `anarchyUntil = tour+1` vérifié sur dump admin ✅ ;
  - Captures `dev-logs/captures-regimes-modale/` (A-modale-gratuite, A2-badge-panneau, B-modale-payant, C-confirmation-payant, D-apres-adoption-anarchie) — relues PASS.

## Vérifications

- Suites web **582 vertes** (+14, `tests/regimes-modale.test.ts`) ; svelte-check **0 erreur** / 17 warnings (= baseline) ; rules/server intouchés.
- R-122 : aucun test moteur modifié.

## 🔶 À l'œil d'Erik / notes

- **Refus pendant l'anarchie prouvé en unitaires seulement** : aucune complétion de tech ne peut arriver pendant une anarchie (science à zéro), donc la modale ne peut pas s'ouvrir naturellement dans cet état — le cas est couvert par `refusAnarchie` (test) et le code (bandeau + boutons désactivés).
- Despotisme : icône repli générique or (D5, art Erik attendu).
- Les deux toasts conseiller existants sont conservés (ils alimentent la Chronique) — la modale s'ajoute, la fenêtre est désormais impossible à manquer.
- Piège découverte pendant la GUI : `SetResearch`/`SetConversion`/`SetGovernment` sont des messages WS DIRECTS, pas des `SubmitOrder` (le harnais antérieur les passait par le GUI réel uniquement).
- Captures sur parties solo procédurales — la fenêtre R-122 expire à la résolution suivante (conforme R-122).
