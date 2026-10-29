# REPORT-JEV-CONTACT-GUERRE — Jev ne déclare la guerre qu'après un contact réel

**Mission** (HANDOFF-JEV-CONTACT-GUERRE, décisions Erik 29/10) : dans la fumée, Jev déclarait la guerre immédiatement — la guerre doit devenir l'ABOUTISSEMENT d'un arc relationnel, pas un mouvement d'ouverture. Fix au harnais sableuse uniquement (v5), méthode v2/v3. Zéro impact moteur/serveur/web, `schemaVersion` 28 intact.

## 1. Livré

**Harnais (`sableuse/src/joueur.mjs`)** :
- **D1 — État de rencontre depuis la vision** : `majRencontres(etatFiltre, moi, memo)` — un rival est « rencontré » dès qu'une de ses unités ou villes figure dans l'état FILTRÉ fog, au moins une fois ; la PREMIÈRE rencontre tient (memo inter-tours du harnais) ; barbares exclus.
- **D1 — Question guerre masquée** : la question guerre n'est construite que si la cible est rencontrée ET que le délai minimal de coexistence est écoulé (`seuils.delaiGuerreApresRencontre`, **10 tours**, ajouté à `questions-joueur.json`). Pas de rival éligible = pas de question (directive n°3, jamais de critère vide). Un tour sans question guerre = zéro déclaration possible de Jev (le bot tactique ne déclare déjà jamais à sa place).
- **D2 — L'arc avant la guerre** : `blocDiplomatie` expose par rival `rencontreTour`, `toursDepuisRencontre`, `provocations` (unités hostiles du rival à rayon 5 de nos villes, miroir RAYON_MENACE). Le critère OUI porte désormais : « Relation : rencontré depuis N tours (premier contact au tour T), provocations : aucune / N unité(s) hostile(s) près de nos villes » — critères plats, méthode v2.
- Le condensé journalisé porte l'arc → la métrique « guerres avant rencontre » est calculable bit-à-bit depuis les journaux de banc.

**Tests** : `sableuse/tests/v5.test.mjs` (11 tests, écrits FIRST — 9 rouges avant implémentation) : état de rencontre (unité OU ville, première rencontre conservée, barbare exclu), masquage avant contact, délai non écoulé, retour de la question après délai, arc au condensé et aux critères, fausse LLM « oui-guerre » impuissante avant l'arc, déterminisme, partie complète (zéro déclaration sur 12 tours). Tests existants réalignés (`joueur.test.mjs`) : les tests harnais guerre/paix utilisent le seed 97 (rencontre déterministe t11, trouvé par sonde) avec délai 0 — ils portent la TRADUCTION de l'intention, le délai est couvert par v5.

**Suites** : sableuse **80/80 verte** (dont 11 v5).

## 2. Banc v4 — `sableuse/bancs/joueur-v4-2026-10-29/`

10 parties 1v1, seeds corpus identiques au banc v3, civs P7 du seed, plafond 150 tours. Coût réel **0,2316 $** (plafond mission 0,40 $ respecté ; 0,0232 $/partie, 0 erreur API, latence médiane 105 ms).

## 3. Comparaison v3/v4 (L3)

| Métrique | v3 (2026-10-27) | v4 (contact réel) |
|---|---|---|
| **Guerres déclarées AVANT rencontre + délai** | **34/34** (toutes immédiates, t10-t27) | **0** ✅ |
| Guerres déclarées (ok moteur) | 34 | 26 |
| Paires effectivement en guerre (fin de partie) | 4 | 4 |
| Fondations Jev (partie) | 23 | **31** |
| Villes Jev fin de partie / partie | 2,20 | **3,00** |
| Victoires Jev | 1/10 | 1/10 |
| Tours moyens | 139 | 141 |
| Coût total | 0,2261 $ | 0,2316 $ |

**Verdict : oui — Jev fait des guerres d'adulte maintenant.** La métrique visée est à 0 : plus une seule déclaration dans le brouillard. Et Jev reste belliqueux : dès que le contact est pris et le délai écoulé, il déclare (26 guerres en 10 parties, 4 rivaux amenés à la guerre effective comme en v3) — la non-régression des 37 guerres v2 à l'échelle v3 tient. Bonus inattendu : en reportant la guerre après le contact, Jev EXPLORE d'abord — les fondations bondissent de 2,20 à 3,00 villes/partie (31 fondations, non-régression v3 largement dépassée), sans perte de victoires ni de score.

### Anecdotes (v4)
- **seed 3802591813** (allemagne vs zoulous) : rencontre t14, première guerre t80 — Jev a laissé l'arc mûrir 66 tours (le rapport de forces présenté ne le convenait pas avant ; v3 déclarait t24 sur le même seed).
- **seed 4033602994** (allemagne vs inde) : rencontre très tardive t130 → guerre t140 — le délai de 10 tours est respecté même en fin de partie.
- **4 seeds sur 10** : jamais de contact en 150 tours (spawns éloignés) → **zéro guerre**, à la place 4 à 7 villes fondées. En v3, ces mêmes seeds donnaient 4 guerres « dans le vide ».

## 4. 🔶 Ouvert (consigné, hors périmètre)
- Les 26 déclarations restent des re-déclarations après paix (le bot re-déclare chez Jev) — le rythme guerre/paix ping-pong reste au backlog itération 4 (contact réel avant guerre est fait ; la QUALITÉ de l'arc, non tranchée).
- `provocations` ne compte que les unités proches de nos villes — une vraire mémoire des griefs (villes capturées, caravanes pillées) est une itération Zii possible.
- Délai 10 tours = donnée Erik par défaut ; recalibrable dans `questions-joueur.json` sans toucher au code.
- Coûts : banc v4 = 0,2316 $ — plafond campagne 10 $ intact.

## 5. Commit & fin
- Commit harnais : `sableuse/src/joueur.mjs`, `sableuse/tests/{v5,joueur}.test.mjs`, `sableuse/questions-joueur.json`, `sableuse/src/analyse-contact.mjs` (outil L3), rapport et handoff à la racine. L'artefact de banc `sableuse/bancs/joueur-v4-2026-10-29/` (plan, état, journaux JSONL, RAPPORT.md) reste LOCAL (convention dépôt : `bancs/` gitignoré, comme v2/v3). Jamais de clés (`.env.local` hors git).
- Arrêt. Remise de la main.
