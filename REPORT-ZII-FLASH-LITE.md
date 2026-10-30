# REPORT-ZII-FLASH-LITE — Zii plus rapide : thinking désactivé + glm-4.5-flash

**Mission HANDOFF-ZII-FLASH-LITE (Erik 30/10)** — livrée. Part de ZII-GLM-VOIX (`a9097f7`, prod `80b07d9a`).

## 1. Changements (3 fichiers + tests)

| Fichier | Changement |
|---|---|
| `apps/server/src/zii/glm.ts` | D1 : le corps d'appel porte `"thinking": {"type": "disabled"}` (inconditionnel — les modèles qui refusent renvoient 1210 → repli v1 déjà géré). D3 : `TIMEOUT_GLM_MS` 20 s → **12 s**. D4 : `max_tokens` **2000 inchangé** (contrat troncature). Commentaire R-191 mis à jour. |
| `apps/server/src/zii/zii.json` | D2 : `modele` → **`glm-4.5-flash`** (défaut du banc, voir §2). Contrat `{reponse, ton, intentionPercue}`, décodeur v1, replis, liste blanche, budget 0,05 $, `schemaVersion` 28 : INCHANGÉS (D5). |
| `apps/server/tests/zii-glm-voix.test.ts` | +3 tests (43/43 verts) : thinking disabled dans le corps ; `TIMEOUT_GLM_MS = 12 000` + AbortController câblé (fetch jouet qui rejette au signal) ; modèle lu de zii.json (garde-fou). |

Le client, Jev, le paquet léger, l'anti-injection : zéro changement.

## 2. Banc comparatif (L2 — API réelle, dialogue scripté bonjour → menace → demande de paix, 2 passes, historique de conversation)

Données brutes : `devtmp/banc-zii-modeles.json` (copie : `dev-logs/captures-zii-flash-lite/`). Script : `devtmp/banc-zii-modeles.mjs`.

| Modèle | JSON valide | Latences (ms) | Médiane | reasoning_content | Coût |
|---|---|---|---|---|---|
| `glm-5.3-flash` (référence actuelle) | — (HTTP 400 ×6 avec `thinking:disabled` — erreur 1210, thinking non désactivable) | 3 500–6 300 (sondage 30/10) | ~4 s | toujours présent | 0,15/0,50 $/M |
| **`glm-4.5-flash` — RETENU** | **6/6** | 1461 / 1632 / 1682 / 1713 / 2101 / 2340 | **1713 ms** | **absent ×6** | **0 $/0 $** |
| `glm-4.7-flash` | 5/6 (1× HTTP 429) | 1715 → 17 603 (erratique) | 3532 ms | absent | ~0,07/0,40 $/M |
| `glm-4.7-flashx` | — | EXCLU (sondage 30/10 : 1,6 s puis 61 s) | — | — | — |

**Critère D2** : validité ≥ 4/5 → `glm-4.5-flash` retenu (6/6). **Critère 1 du handoff** : médiane 1,7 s ≤ 2,5 s ✓ (vs 3,5–6,3 s aujourd'hui).

## 3. Transcriptions (pour l'œil d'Erik)

**glm-4.5-flash, passe 1** (dialogue scripté avec historique) :
- *bonjour* → « Bonjour Shaka Zulu, enchanté de vous rencontrer également. J'espère que nos relations diplomatiques seront fructueuses pour nos deux empires respectifs. »
- *menace* → « Votre rhétorique belliqueuse est regrettable. L'Empire de Jev recherche la paix et la prospérité pour tous les peuples. La force brute ne construira qu'un héritage de destruction. »
- *demandePaix* → « La proposition de paix est accueillie avec intérêt. L'Empire de Jev valorise toujours la diplomatie comme moyen de résoudre les différends. Une paix durable bénéficierait à nos deux peuples. »

**glm-4.5-flash, passe 2** :
- *menace* → « Votre rhétorique belliqueuse est remarquable, Shaka Zulu. L'Empire de Jev préfère la diplomatie à la confrontation. Poursuivre cette voie mènerait inévitablement à des conséquences regrettables pour nos deux peuples. »
- *demandePaix* → « La proposition de paix est accueillie avec intérêt. L'Empire de Jev valorise toujours les solutions diplomatiques qui évitent le conflut. Comment suggériez-vous de formaliser cette acccord entre nos nations ? » 🔶 deux coquilles (« conflut », « acccord »)

**glm-4.7-flash (écarté, extrait)** :
- *menace* → « C'est une déclaration de guerre imprudente. Nous avons observé vos mouvements et préparerons une riposte équivalente. Ne comptez pas sur notre clémence. » (voix plus tranchante — mais 429 + 17,6 s)

**Mémoire de conversation (sonde dédiée, `devtmp/banc-zii-memoire.mjs`, 3 essais glm-4.5-flash)** : réponses JSON valides et courtoises à la demande de paix après menace, MAIS la menace antérieure n'est pas rappelée explicitement (« La paix est toujours une option préférable, Shaka Zulu. Que proposerez-vous en retour… »). 🔶 À l'œil Erik — le prompt (`promptGlmZii`, zii.ts) est hors périmètre de cette mission.

## 4. Vérification réelle locale (wrangler + clé, JAMAIS de clé dans les logs)

- **Dialogue scripté via le vrai worker (8787) : 3/3 GÉNÉRÉS, `source=glm`**, latences **1710 / 1884 / 2294 ms**, budget cumulé 0,000053 $ (plafond 0,05 $). Voix en contexte (Cléopâtre/Égypte) : « Salutations, noble étranger. Je suis Zii, la voix de Cléopâtre… » ; menace → « Les menaces sont le langage des faibles. L'Égypte a survécu à des empires plus puissants. »
- **Repli sans clé PROUVÉ** : wrangler avec `ZII_GLM_API_KEY` vide → `source=replique`, réplique v1 des candidats zii.json, zéro panne visible.
- **Capture GUI bulle** : `dev-logs/captures-zii-flash-lite/` (bulle générée dans la Messagerie, navigateur réel). 🔶 Sur un message d'ouverture, la voix a produit « Le peuple chinois avance avec détermination sur la voie du socialisme » — anachronisme de ton à l'œil Erik (le cadrage est hors périmètre).

## 5. ⚠️ ACTION PROD OBLIGATOIRE (avant validation Erik en prod)

Le secret prod **`ZII_GLM_MODELE`** vaut vraisemblablement `glm-5.3-flash` (c'était le cas du `.dev.vars` local). À l'état, ce secret ÉCRASE `zii.json` : la prod resterait sur 5.3-flash qui **rejette `thinking:disabled` (HTTP 400 / erreur 1210) → TOUS les échanges tomberaient au repli répliques v1** (jamais de panne, mais plus de génération).

**À faire par le pilot/Erik : `wrangler secret put ZII_GLM_MODELE` → `glm-4.5-flash` (ou supprimer le secret pour retomber sur zii.json).** Localement, `.dev.vars` a été mis à jour (`ZII_GLM_MODELE=glm-4.5-flash`) — note : `.dev.vars` PREND LE DESSUS sur `--var` wrangler (piège constaté, ajouté au §7).

## 6. Suites (L4)

- zii (zii-glm-voix + zii-v1) : **43/43 verts** en local (40 + 3 nouveaux) ;
- server / jev-port / rules / web / svelte-check / typechecks : voir commit (tous verts avant push — résultats consignés dans le commit).
- `schemaVersion` 28 inchangée.

## 7. Pièges consignés (pour RULES.md / pilot)

1. **Zombies wrangler** : chaque relance de `wrangler dev` peut laisser un `node` parent + `workerd` enfants qui RE-ÉCOUTENT le port ; les requêtes tombent alors sur un VIEUX bundle (ici : 5.3-flash + ancien code, d'où des 400 fantômes). Purge complète requise (script : `devtmp/purge-8798.ps1` — tue les parents node ET les workerd) avant toute vérif.
2. **`.dev.vars` écrase `--var`** : ni `--var ZII_GLM_MODELE:...` ni `--var ZII_GLM_API_KEY:""` ne prennent le dessus sur `.dev.vars` en local. Pour tester sans clé : vider la ligne dans `.dev.vars` (avec sauvegarde), puis relancer wrangler, puis RESTAURER.
3. `glm-5.3-flash` + `thinking:disabled` = HTTP 400 (erreur 1210) — c'est le repli v1 qui couvre (comportement D1 accepté), mais un override secret obsolète en prod ferait perdre toute génération (§5).

## 8. Fin de session

Rapport livré, worker/wrangler/vite de test arrêtés. Erik lit les transcriptions (§3) et la capture GUI, valide LA VOIX en prod après l'action §5 ; critère final = son œil (un modèle plus rapide mais moins bon parlant sera vetoé — candidat de repli : `glm-4.7-flash`, plus mordant mais erratique). La file (officialisation des accords) ne démarre qu'après.
