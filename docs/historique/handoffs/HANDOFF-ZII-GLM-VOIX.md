# HANDOFF-ZII-GLM-VOIX — Zii prend la parole en langage naturel (GLM-5.3-Flash)

**Décisions Erik 30/10.** Zii v1 parlait par répliques pré-écrites (le compte n'exposait que `jev-latest`, un modèle décisionnel — consigné). Erik fournit une clé GLM (Z.ai, API compatible OpenAI) : Zii passe à la **génération naturelle réelle**, en gardant les répliques v1 comme repli. La structure ZII-V1 (liste blanche, anti-injection, `resumePourJev`, budget) ne bouge PAS.

## 1. Préalables

- Lire ZII-V1 (`apps/server/src/zii/zii.ts` noyau, `zii.json` data-driven, décodeur + repli silencieux, `zii/etat.ts` budget/échecs), CHAT-SOCLE (canaux), le port Jev (`tests-jev/`).
- **Secrets** : `ZII_GLM_API_KEY` DÉJÀ posé en prod (worker `game-4x-server-prod`, Erik) et en local (`apps/server/.dev.vars` + `ZII_GLM_MODELE=glm-5.3-flash`). **Jamais dans le git** — lire l'environnement uniquement ; tests en FAUSSE LLM.
- API : `https://api.z.ai/api/paas/v4/chat/completions` (compatible OpenAI — testée par le pilot : clé valide, appel fonctionnel).
- Baseline : suites vertes (server 369 / web 706 / rules 1101 / sableuse 80), `schemaVersion` 28. Vérifier `git status`.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Adaptateur de fournisseur** : un module d'appel `fetch` (compatible OpenAI) dans le noyau Zii ; `zii.json` gagne `fournisseur` ("typesafe" | "glm") + `modele` — le pipeline actuel (jev-latest, répliques) reste l'état par défaut si l'entrée manque (rétrocompatible).
- **D2 — Le contrat de réponse NE CHANGE PAS** : le prompt GLM demande le MÊME JSON structuré que le décodeur attend (message, ton, intention perçue, `resumePourJev`) ; réponse invalide/non-JSON = repli silencieux existant ; **échec GLM = repli sur les répliques v1** (candidats existants), puis muette — jamais de panne visible.
- **D3 — Anti-injection inchangé** : le paquet léger liste blanche et le cadrage « donnée non fiable » précèdent l'appel GLM ; le modèle génère du texte libre MAIS le décodeur reste responsable (longueur max, champs exacts) — tout débordement est tronqué/rejetté.
- **D4 — Budget** : plafond 0,05 $/partie conservé (compteur existant, le coût GLM Flash réel au rapport) ; échecs 3 → muette inchangé.
- **D5 — Local** : `.dev.vars` déjà à jour par Erik ; rappel — relancer wrangler dev après modification.
- **D6 — Intouchés** : Jev (décisions), CHAT-SOCLE, T2, `schemaVersion` 28.

## 3. Mission

- **L1 — test-first** : adaptateur (fixture de réponse GLM réelle → décodeur vert ; JSON invalide/tronqué → repli), bascule fournisseur par config, budget compté sur le nouvel appel, FAUSSE LLM (zéro appel réel dans les tests).
- **L2 — implémentation** (D1-D4, serveur).
- **L3 — vérification locale réelle** : wrangler dev + clé — dialogue scripté GLM (bonjour, menace, demande de paix) : réponses GÉNÉRÉES variées, `resumePourJev` au journal de Jev, repli prouvé (clé retirée → répliques v1) ; captures `dev-logs/captures-zii-glm/`.
- **L4 — commit + push (CI déploie — le secret prod s'active)** ; **Erik dialogue avec Zii en prod** : la validation finale est la TIENNE (voix libre vs répliques).
- **L5** : rapport `REPORT-ZII-GLM-VOIX.md` (coût GLM réel, qualité générée vs v1, 🔶), arrêt, remise de la main.

## 4. Critères d'acceptation

1. En prod, Zii répond en langage GÉNÉRÉ (variations libres, plus de répétition de répliques) ;
2. Repli v1 éprouvé (panne GLM invisible pour le joueur) ;
3. Liste blanche/anti-injection/budget inchangés (tests existants verts) ;
4. Suites vertes, `schemaVersion` 28, zéro secret committé.

## 5. Périmètre interdit

Jev (modèle et harnais), les autres bots, T2, CHAT-SOCLE, tout calibrage de personnalité (à l'œil après), `schemaVersion`.

## 6. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik ni des secrets.
