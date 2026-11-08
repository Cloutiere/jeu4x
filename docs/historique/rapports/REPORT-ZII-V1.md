# REPORT-ZII-V1 — Zii, la bouche de Jev (Erik 29/10) — LIVRÉE

Mission exécutée d'après `HANDOFF-ZII-V1.md` (décisions Erik D1-D7 appliquées, aucun veto levé).

## 1. Ce qui est livré

- **Noyau pur** `apps/server/src/zii/zii.ts` : intention du message (classification déterministe par mots-clés), paquet léger à **LISTE BLANCHE** (D3), candidats de répliques (templates à slots de `zii.json`), questions systemOne (anti-injection cadrée), décodeur (réponse invalide → **repli silencieux**, D4), résumé factuel `resumePourJev`.
- **Données** `apps/server/src/zii/zii.json` : modèle, plafond budget **0,05 $**, historiqueMax 8, longueurMax 300, tons, mots-clés d'intention, candidats de salutations/réponses (éditable sans code).
- **État** `zii/etat.ts` (hors état moteur, storage `ziiEtat`, schemaVersion 28) : budget, échecs (3 → muette), marqueurs de salutations, `resumesPourJev`, journal (cap 50).
- **Orchestre** `zii/orchestre.ts` : salutations DÉTERMINISTES seedées (D2 — zéro LLM, idempotent au rejeu), réponse aux canaux de Jev (D1), relais (D5).
- **GameDO** (`game.ts`) : salutation de début à l'activation, salutation individuelle au PlayerMet quand JEV rencontre, réponse après ChatSend dans Général/canal Jev, **consommation des resumes au prochain tour de Jev** (condense `chatsPourJev` — bit-à-bit jev-port inchangé quand vide), dump admin `zii`.
- **Rules** : trait `sociabilite` (16 civs + `sociabiliteDefaut` 0,5) + helper `sociabiliteDe`.
- **Client (L3)** : zéro changement — les messages de Zii sont des bulles canon affichant le nom du siège Jev (« Jev 🤖 »), vérifié en capture.

## 2. Modèle choisi (D1)

Le compte n'expose que **`jev-latest`** et `jev-preview` (probe `client.models.list()` avec clé) — **aucun modèle plus léger disponible**. Zii tourne donc sur `jev-latest` (même moteur que Jev, requêtes ~30× plus petites que le tour décisionnel). La config `zii.json.modele` reste data-driven : un jour un modèle léger apparaît, un changement de ligne suffit. 🔶 consigné.

## 3. Vérification réelle (L4, wrangler local 8787 + clé)

`devtmp/zii-dialogue-e2e.mjs` — dialogue réel scripté (`dev-logs/captures-zii-v1/dialogue-*.json`) :
- salutation de début de partie tirée (civ neutre 0,5 → 50 %) → livrée dans le chatLog ;
- « Bonjour Jev ! … » → **réponse réelle en ~140 ms** : « Salutations à toi, Chef neutre. Puissions-nous coexister paisiblement. » (ton courtois, intention perçue question) ;
- menace (« Soumets-toi ou je rase tes villes. ») → « Nous avons bien reçu votre message. L'histoire dira ce qu'il valait. » (ton **ferme**, intention perçue **menace**) ;
- **relais D5 PROUVÉ** : le condensé de Jev au tour 1 porte `chatsPourJev` = les 2 résumés (endpoint `/admin/game/:code/jev?tour=1`), resumes consommés (`resumesPourJev` vide ensuite) ;
- budget après 2 appels : **0,000079 $** (le plafond 0,05 $ = ~1200 échanges/partie).

Captures GUI (`devtmp/zii-gui.mjs`) : `dev-logs/captures-zii-v1/zii-{A,B,C}-*.png` — onglet 💬 Messagerie, bulles « JEV » à l'accent doré, salutation de début + réponse réelle + réplique ferme à la menace.

## 4. Tests

- `tests/zii-v1.test.ts` : **25 verts** — liste blanche (test négatif : trésorerie/techs/plans absents du paquet), anti-injection (cadrage NON FIABLE), décodeur valide/invalide, salutations (une fois, déterminisme seedé), budget/échecs/journal, FAUX LLM (nominal, invalide, panne, désactivation), relais condensé bit-à-bit, e2e SANS clé (repli gracieux, ziiEtat persisté).
- Suites complètes : **server 369** (344+25), **jev-port 20** (croisés bit-à-bit verts), **rules 1101**, **web 706**, **svelte-check 0**, **sableuse 80**. Typechecks 4/4.

## 5. 🔶 À l'œil Erik (non tranchés)

1. **Personnalité/ton** : les candidats de `zii.json` sont un premier jet — la voix de chaque dirigeant (Zoulous chaleureux, Inde réservée) est à l'œil en jouant (Erik discute avec Zii en prod — la vraie validation).
2. **Sociabilité par civ** : propositions (Zoulous 0,85, Mongolie 0,8, Aztèques 0,75 … Inde 0,25) — calibrage à l'œil.
3. **Mots-clés d'intention** : « Soumets-toi ou je **rase** tes villes » est classé « autre » par les mots-clés (le LLM, lui, perçoit « menace » et répond ton ferme via les candidats « autre ») — enrichir `zii.json.intentions.menace` si besoin.
4. **Salutation individuelle quand l'HUMAIN n'a pas encore rencontré Jev** : le canal individuel reste verrouillé pour LUI (fog R-73) jusqu'à vision réciproque ; la courtoisie de Zii arrive dans une conversation à sens unique (consigné — lisible mais non répondable).
5. **Modèle léger** : indisponible sur le compte (§2) — re-probe un jour.

## 6. Pièges (pour la suite)

- Le SDK systemOne ne renvoie que du structuré (choice/noul/score) : les énoncés de Zii sont des CHOIX parmi les candidats de `zii.json` (slots substitués) — la personnalité s'édite en données, pas en prompt.
- Un waiter de message périmé doit être RETIRÉ à son timeout (sinon il vole les messages suivants — bug corrigé dans le script e2e).
- Proxy Vite figé sur 8787 (piège connu) — wrangler sur un autre port = GUI muette.
- La salutation de début est tirée À L'ACTIVATION (handleJoin) : marqueur `salutationDebutFaite` persisté AVANT publication (idempotent au rejeu).

## 7. Fin de session

Aucune clé committée (`.dev.vars` hors git). Serveurs locaux arrêtés (wrangler 8787, Vite 5174). Commit propre (données + serveur + tests + RULES.md R-190 + ce rapport + scripts devtmp).
