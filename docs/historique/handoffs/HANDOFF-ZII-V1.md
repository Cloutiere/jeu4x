# HANDOFF-ZII-V1 — Zii, la bouche de Jev : salutations, dialogue naturel, relais vers Jev

**Décisions Erik 29/10** (vision Zii validée, séquence votée). Zii = un SECOND LLM **léger** (moins cher, moins lent) qui PARLE pour le joueur Jev — il n'est PAS décisionnel tactique. Socle chat livré (CHAT-SOCLE) ; les interfaces de négociation existent (T2) ; l'officialisation formelle des accords est la TRANCHE SUIVANTE — Zii v1 : salutations, dialogue naturel, relais d'information vers Jev.

## 1. Préalables

- Lire CHAT-SOCLE (`chat.ts` noyau pur, storage chatLog/rencontres, formats de message — le contexte de Zii), DIPLOMATIE-T2 (formes privées, grille de prix — Zii cite le prix indicatif mais n'émets AUCUN ordre), le port serveur de Jev (`tests-jev/`, `joueur.mjs` porté — le tour de Jev, le condensé), R-146 (traits), le fog R-73 (liste blanche).
- Baseline : suites vertes (server 344 / web 706 / rules 1101 / sableuse 80), `schemaVersion` 28. Vérifier `git status`. Clés en env/secret uniquement.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Deux cerveaux, deux modèles** : Jev reste sur son modèle (décisions) ; Zii sur un modèle **LÉGER** du même SDK (le plus petit disponible — choix consigné, data-driven `zii.json` : modèle, budgets, fréquences). Zii répond SEULEMENT quand un joueur humain écrit dans UN de ses canaux (Général ou individuel), ou aux moments d'initiative (D2).
- **D2 — Les initiatives de Zii** : (a) **salutation de début de partie** (canal Général) — probabilité liée au nombre de joueurs ET à un nouveau trait data-driven `sociabilite` par civ (civilizations.json, défaut 0,5 — propositions de valeurs au rapport, Zoulous chaleureux/Inde réservée à l'œil Erik) ; (b) **salutation de première rencontre** individuelle (au PlayerMet existant) — un message de courtoisie du dirigeant.
- **D3 — Le paquet léger (LISTE BLANCHE)** : Zii ne reçoit JAMAIS l'état complet — seulement : parties rencontrées (civ, dirigeant, ère, état de guerre T1, forces VISIBLES en ratio, distance capitales, l'historique récent de SA conversation (N derniers messages), et la stance de Jev (en guerre avec qui, `agressivite`). JAMAIS : trésorerie, techs exactes, positions hors vision, plans. Miroir des disciplines existantes (condensé/Jev, fog).
- **D4 — Anti-injection, double barrière** : les messages joueurs sont des DONNÉES non fiables (cadrés comme telles dans le prompt) ; Zii répond en **JSON structuré** : { message (le texte parlé), ton, resumePourJev (résumé factuel : demandes, menaces, offres aperçues), propositionSuggeree? (une SUGGESTION, pas un ordre) }. **Jev lit `resumePourJev`, jamais le chat brut.** Réponse invalide = pas de message envoyé, repli silencieux + consigné.
- **D5 — Le relais vers Jev en cours de tour** : après un échange Zii, `resumePourJev` est ajouté au contexte du prochain tour de décision de Jev (le champ existe — miroir du mécanisme du harnais) ; Jev peut alors ajuster SES décisions à la résolution suivante. Les canaux de Zii sont des messages de chat canon (CHAT-SOCLE) — visibles du joueur humain, jamais d'ordre.
- **D6 — Hygiène** : budget Zii par partie (plafond data-driven, ex. 0,05 $ — un modèle léger à ce coût est quasi illimité), débit hérité du chat, longueur max de réponse, température reproductible, journal complet (réutilisable pour l'itération Zii).
- **D7 — Intouchés** : T2 (la modale d'officialisation = tranche suivante), les décisions de guerre/paix de Jev (son harnais v4 reste maître), les autres bots (muets), `schemaVersion` 28.

## 3. Mission

- **L1 — test-first (serveur)** : paquet léger à liste blanche (test négatif : aucune donnée interdite présente), formats de réponse (valide/invalide → repli), salutations (probabilité sociabilite, une fois par partie/rencontre), relais resumePourJev, budget/débit, FAUSSE LLM (zéro appel réel dans les tests).
- **L2 — serveur/GameDO** : Zii branché aux canaux (CHAT-SOCLE), données `zii.json` + `sociabilite`, secret Zii en env/Cloudflare.
- **L3 — client** : rien ou presque (les messages de Zii sont des bulles de chat canon avec son nom/dirigeant — vérifier l'affichage de l'auteur bot).
- **L4 — vérification** : wrangler local avec clé — dialogue réel scripté (salutation → réponse → relais vérifié au journal de Jev) ; captures `dev-logs/captures-zii-v1/` ; deploy ; **Erik discute avec Zii en prod** (la vraie validation).
- **L5** : suites vertes complètes, RULES.md (§diplomatie — Zii v1), commit (jamais de clés), rapport `REPORT-ZII-V1.md` (modèle choisi, coûts réels, 🔶 ton/personnalité à l'œil).

## 4. Critères d'acceptation

1. Zii salue en début de partie et à la rencontre, répond naturellement quand on lui écrit, dans le canal et la langue du joueur ;
2. Ses échanges nourrissent le contexte de Jev (`resumePourJev` au journal) ;
3. Aucune donnée interdite dans le paquet ; anti-injection testé ; budget plafonné ;
4. Suites vertes, `schemaVersion` 28, zéro secret committé.

## 5. Périmètre interdit

L'officialisation formelle des accords (tranche suivante), les décisions tactiques de Zii, les autres bots parlants, le chat bot-à-bot, T3, tout calibrage de Jev, `schemaVersion`.

## 6. Fin de session

Rapport (coûts, modèle, 🔶 personnalité), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik ni des secrets.
