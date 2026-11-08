# REPORT-CHAT-SOCLE — Le chat : interface, rencontre, persistance serveur (zéro LLM)

**Mission** : HANDOFF-CHAT-SOCLE.md (décisions Erik 29/10 — socle obligatoire de Zii).
**Livrée le 29/10/2026.** Zéro LLM (D6 respecté — les canaux sont prêts, rien de plus).

## Ce qui est livré

### Serveur (hors état moteur — schemaVersion 28 INCHANGÉE)

- `apps/server/src/chat.ts` (NOUVEAU) — noyau PUR : `chatShapeError` (forme EN PREMIER — leçon d'or 7f), hygiène D4 (fenêtre glissante **10 messages/30 s/joueur**, longueur max **300**, historique plafonné à **500**), règle UNIQUE de privacité `voitCanal` (miroir DIPLOMATIE-T2), détection pure des rencontres `nouvellesRencontres` (première vision d'une entité adverse — unité OU ville, fait de fog R-73, une fois par paire, barbares exclus).
- `apps/server/src/game.ts` — storage `chatLog` + `rencontres` (clés dédiées, miroir `jevEtat` — zéro migration) ; `ChatSend` / `ChatHistory` dans le switch WS ; livraison ciblée `envoyerAuxEngineIds` (Général = tous, individuel = aux DEUX seulement) ; `detecterRencontres()` appelée dans `broadcastTurnResult` AVANT le TurnResult ; `Welcome.rencontres` (survit à la reconnexion — le popup ne joue QUE sur le PlayerMet en direct) ; dump admin enrichi (`chat: { log, rencontres }`).
- Hygiène : le débit est une mémoire vive du DO (l'hibernation la réinitialise — perte bénigne, l'hygiène reste effective sur les sessions actives).

### Protocole (`packages/shared`)

- Client→Serveur : `ChatSend { canal: 'general' | engineId, texte }`, `ChatHistory`.
- Serveur→Client : `ChatMessage { message: { partie, tour, auteur, canal, texte, horodatage } }`, `ChatHistory { messages }`, `PlayerMet { joueur, tour }` ; `Welcome.rencontres?: string[]`.

### Client (`apps/web`)

- `lib/chat.ts` (NOUVEAU) — store + réducteur PUR testé (déduplication écho/historique, rencontres sans popup au chargement, popup sur PlayerMet EN DIRECT uniquement) ; reset au changement de partie (miroir chronique).
- `components/Chat.svelte` (NOUVEAU) — onglet 💬 de la colonne droite : canaux **Général** + une conversation par joueur rencontré, bulles colorées à l'accent de l'auteur (palettes 4 tons, miroir bandeau), envoi instantané, tokens AAA or-sur-sombre (miroir Chroniques), défilement auto.
- `components/RencontreModale.svelte` (NOUVEAU) — popup « PREMIÈRE RENCONTRE — {joueur} — {nation} » (miroir RegimesModale : overlay, Échap, clic dehors, bouton Saluer).
- `pages/Game.svelte` — onglets **Chroniques / 💬 Messagerie** en tête de colonne (styles AAA) ; popup branchée sur `$chat.popupRencontre` ; historique tiré à chaque Welcome (connexion/reconnexion) ; `reinitialiserChat()` à l'entrée.
- `lib/gameClient.ts` — `envoyerChat()` / `demanderHistoriqueChat()` ; `appliquerMessageChat` branché dans `apply()`.

## Vérifications (L1/L4)

- **Suites** : server `tests/chat-socle.test.ts` **12/12 verts** (formes, débit, privacité pure, plafond, Général à 3 humains, reconnexion/historique, rencontre e2e complète sur pedagogique-40 : marche BFS wrap-aware des deux guerriers → PlayerMet UNE FOIS par paire → conversation déverrouillée → historique privé re-servi après reconnexion) ; **web 706 verts** (dont 6 nouveaux `tests/chat-socle.test.ts`) ; **svelte-check 0 erreurs** ; tsc server 0 erreur.
- ⚠️ **4 échecs PRÉEXISTANTS dans la suite jev** (`tests-jev/jev-port.test.ts` — questions diplomatie vs harnais v3 figé) : reproduits en stashant mes changements (vérifié par stash/pop). Dérive de la session parallèle contact-guerre — hors périmètre, à réconcilier par la mission JEV.
- **Captures GUI** (`dev-logs/captures-chat-socle/`, script `devtmp/chat-socle-gui.mjs`) :
  - `A` onglets Chroniques/💬 + Général vide ; `B` message Général d'Alice (UI) reçu par Bob ET Carol (3 sièges humains) ; `C` réponse de Bob, bulle à l'accent ;
  - `D` **popup de première rencontre EN DIRECT** (vérifiée visuellement : pastille palette, « Sans civilisation », bouton Saluer) ;
  - `E`/`E2` canal individuel Alice↔Bob (privé — Carol ne reçoit RIEN, prouvé en e2e vitest par la règle unique + la livraison ciblée) ;
  - `F` débit : « débit dépassé (10 messages / 30 s) » ;
  - `G` reconnexion : canal Bob toujours là + historique complet restauré.
- 🔶 À l'œil Erik : calibrage visuel des onglets/bulles/popup, libellés (« Saluer », « Messagerie »).

## Pièges rencontrés (pour la suite)

1. **`map(replier)`** — `Array.map` passe (valeur, INDEX) : l'index arrivait comme `largeur` du repli wrap → q=NaN → « chemin invalide ». Toujours `map((h) => replier(h))`.
2. **Pompe de test à waitFor unique** — en multi-tours, les waiters en course volent des messages hors phase (deadlock). `MiniSocket` à HISTORIQUE + curseur dans `tests/chat-socle.test.ts` : les messages sont archivés, jamais consommés.
3. **EndTurn pendant la résolution** — refus sans conséquence : re-poller chaque seconde jusqu'au TurnResult du nouveau tour.
4. **Ville sans production = fin de tour bloquée** — les capitales de pedagogique-40 existent au spawn : programmer `SetProduction` (via `SubmitOrder` ! — `SetProduction` nu n'est pas un type de message) avant EndTurn.
5. **Vite/ws sur ::1** — `Test-NetConnection 127.0.0.1` dit DOWN alors que localhost répond ; et les **zombies workerd** (ici un d'hier tenait le 8787) donnent un TCP ouvert muet → tout tuer et relancer wrangler SANS pipe (`> log 2>&1 &` — `| head` casse wrangler).

## Fin de session

- Suites : rules + server principales relancées vertes en fin de session (voir historique CI).
- Jamais committé les fichiers non trackés d'Erik (captures, images, handoffs restent hors git — seuls les fichiers de la mission sont commités).
