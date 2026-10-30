# HANDOFF-CHAT-SOCLE — Le chat : interface, rencontre, persistance serveur (socle de Zii, zéro LLM)

**Décisions Erik 29/10** (vision Zii — ceci est le SOCLE obligatoire : l'endroit où Zii parlera). Chat multijoueur complet joueur↔joueur : écran à droite (la place libérée par les Chroniques), popup de premier contact, persistance **côté serveur** (décision Erik : le futur LLM lira l'historique — JAMais localStorage seul). Zii viendra par-dessus, hors périmètre.

## 1. Préalables

- Lire la mémoire de cadrage (persistance serveur : messages structurés hors état moteur — GameDO storage séparé, éviter les migrations), DIPLOMATIE-T2 (privacité — le chat est privé aux participants), les Chroniques (la colonne droite, `Historique` retiré), R-73 (fog — la « rencontre » est un fait de vision).
- Baseline : suites vertes à jour (rules 1101 / server 332 / web 700), `schemaVersion` 28. Vérifier `git status` (sessions parallèles — le harnais Jev travaille ailleurs, zéro chevauchement).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Interface** : onglet 💬 de la colonne droite : canaux **Général** (tous les joueurs) + **une conversation par joueur rencontré** ; bulles colorées à l'accent de l'auteur (palettes existantes), champ de saisie, envoi instantané (WebSocket existant — message broadcast temps réel, pas d'attente de résolution) ; les bots non-Jev ne répondent PAS (silence scripté — tranché).
- **D2 — La rencontre** : première vision d'une entité adverse (unité ou ville — fait de fog R-73) → **popup de rencontre** (« Vous avez rencontré Jules César — Rome ») + conversation déverrouillée avec ce joueur ; événement de rencontre côté serveur (une fois par paire par partie).
- **D3 — Persistance serveur** : messages structurés { partie, tour, auteur, canal général|destinataire, texte, horodatage } stockés dans le storage du GameDO (HORS état moteur — zéro `schemaVersion`) ; survit à la reconnexion ; l'historique complet est disponible par message dédié (prêt pour l'injection au futur LLM).
- **D4 — Hygiène** : limite de débit (donnée, ex. 10 messages/30 s/joueur) ; longueur max d'un message ; le chat est PRIVÉ aux participants (miroir T2 — le canal individuel ne fuit à personne) ; le canal Général est visible de tous les joueurs de la partie.
- **D5 — Style** : tokens AAA or-sur-sombre (miroir Chroniques), compact — la colonne droite garde ses panneaux actuels, le chat s'y ajoute en onglet.
- **D6 — Zéro LLM** : aucune intelligence dans cette tranche — les canaux sont prêts pour Zii (formats D3 = son contexte futur).

## 3. Mission

- **L1 — test-first** : forme du message + storage (persistance, relecture à la reconnexion, débit, longueurs), rencontre (première vision → événement unique + déverrouillage), privacité du canal individuel, broadcast temps réel.
- **L2 — serveur/GameDO** : messages, rencontre, hygiène (valider le validateur pour toute nouvelle forme de message — leçon d'or).
- **L3 — client** : onglet 💬, canaux, popup de rencontre, bulles accent ; `schemaVersion` 28.
- **L4 — captures GUI avant commit** (`dev-logs/captures-chat-socle/`) : partie 3 sièges — Général lu par tous, canal individuel privé au tiers, popup de première rencontre, reconnexion avec historique, débit limité.
- **L5** : suites vertes, svelte-check 0, commit, push, rapport `REPORT-CHAT-SOCLE.md` (🔶 visuels à l'œil).

## 4. Critères d'acceptation

1. Toi et un bot-partie (ou une 2e session humaine) échangez en temps réel dans les deux canaux ;
2. Le popup de rencontre apparaît à la première vision ; l'historique survit à la reconnexion ;
3. Privacité individuelle prouvée ; débit verrouillé ;
4. Suites vertes, `schemaVersion` 28.

## 5. Périmètre interdit

Zii et tout LLM ; les réponses de bots ; la négociation (T2 reste la modale) ; état moteur ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
