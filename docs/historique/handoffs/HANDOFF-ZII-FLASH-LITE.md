# HANDOFF-ZII-FLASH-LITE — Zii plus rapide : modèle à thinking désactivable + banc comparatif

**Statut : prêt — NON LANCÉ.** Agent : lis ce handoff en entier, plus les préalables, puis exécute dans l'ordre. La mission ZII-GLM-VOIX est livrée et acceptée (`a9097f7`, prod `80b07d9a`) — tu pars de cet état.

## 0. Préalables (à lire AVANT tout code)

1. `PROJET.md` (état) + `RULES.md` R-190/R-191 (le piège du raisonnement forcé de `glm-5.3-flash`, les clés neutralisées dans `vitest.config.ts`) ;
2. `REPORT-ZII-GLM-VOIX.md` (la mission que tu prolonges : adaptateur, replis, contrat JSON) ;
3. Code : `apps/server/src/zii/glm.ts` (adaptateur, corps d'appel ligne ~75), `apps/server/src/zii/zii.json` (`fournisseur`/`modele`), `apps/server/src/zii/zii.ts` (décodeur v1, replis) ;
4. ⚠ La clé `ZII_GLM_API_KEY` vit dans `apps/server/.dev.vars` (hors git) — JAMAIS dans le code, les logs, les captures ni un rapport. `vitest.config.ts` la neutralise déjà pour les tests : ne pas casser ça.
5. ⚠ Entrelacement : personne d'autre ne touche à `apps/server/src/zii/` pendant ta mission. Rejoue la suite serveur COMPLÈTE avant tout push.

## 1. Contexte — pourquoi maintenant

Zii (bouche de Jev sur le chat) génère ses réponses via `glm-5.3-flash`, un modèle qui **raisonne toujours** (erreur 1210, thinking non désactivable) : latence mesurée **3,5 – 9 s** par échange, perceptible dans la Messagerie. Sondage du 30/10 (pilot, même prompt, clé locale) :

| Modèle | Thinking | Latence | Tarif (in/out /M) |
|---|---|---|---|
| `glm-5.3-flash` (actuel) | forcé | 3,5–6,3 s | 0,15 $ / 0,50 $ |
| `glm-4.5-flash` | désactivable | 1,5–1,7 s | **0 $ / 0 $** |
| `glm-4.7-flash` | désactivable | ~1,5 s | ~0,07 $ / 0,40 $ |
| `glm-4.7-flashx` | désactivable | **erratique : 1,6 s puis 61 s** — EXCLU | — |

Réserve : sondage mono-tour ; en vraie conversation (historique + cadrage) la latence sera plus élevée — d'où le banc de cette mission.

## 2. Décisions de tranche (défauts tranchés — veto Erik possible, sinon telles quelles)

- **D1 — L'appel GLM envoie `"thinking": {"type": "disabled"}`** pour tous les modèles qui le tolèrent. Le choix du modèle reste data-driven (`zii.json`) ; le paramètre est envoyé inconditionnellement (les modèles qui refusent renvoient 1210 → repli v1, comportement déjà géré). Si tu préfères un drapeau `desactiveThinking` dans zii.json pour la propreté data-driven, implémente-le (défaut `true`) — les deux options sont acceptées, Erik tranche à la relecture du diff.
- **D2 — Le banc arbitre le choix du modèle, pas une préférence a priori.** Tu mesures `glm-5.3-flash` (référence), `glm-4.5-flash` et `glm-4.7-flash` sur le MÊME dialogue scripté ; tu poses le tableau latence + validité JSON + coût dans le rapport. Le modèle retenu par défaut dans `zii.json` = **`glm-4.5-flash`** SI sa validité JSON est ≥ 4/5 (sinon `glm-4.7-flash`). Erik valide la voix à l'œil sur les transcriptions avant le push final.
- **D3 — Timeout 20 s → 12 s** une fois le thinking désactivé (les latences attendues sont ≤ 2 s ; on garde une marge ×6, jamais de panne visible : le repli répliques v1 couvre le timeout comme aujourd'hui).
- **D4 — `max_tokens` : garder 2000.** Un modèle sans reasoning a besoin de bien moins, mais le contrat est « débordement tronqué avec … », pas une panne — ne pas descendre (risque de troncature JSON invalide → repli silencieux). Si tu mesures la sortie réelle au banc et qu'elle reste < 400 jetons sur tous les échanges, tu peux PROPOSER 800 en note de rapport, sans l'implémenter.
- **D5 — Zéro changement** au contrat `{reponse, ton, intentionPercue}`, au décodeur v1, aux replis, à la liste blanche, au budget 0,05 $, à `schemaVersion` 28. Le client est inchangé.

## 3. Mission L0→L4 (dans l'ordre, test-first partout)

- **L0 — Cadrage** : lis les préalables ; confirme l'état (`git status` propre sous `apps/server/src/zii/`, suites zii 40/40 vertes en local).
- **L1 — Tests d'abord** : dans `tests/zii-glm-voix.test.ts`, ajoute (FAUX fetch, zéro réseau) : le corps d'appel contient `thinking.type = "disabled"` ; timeout = 12000 ; modèle lu depuis zii.json ; override `ZII_GLM_MODELE` fonctionne toujours. Fais-les ÉCHOUER, puis implémente dans `glm.ts` jusqu'au vert.
- **L2 — Banc comparatif** : réutilise `devtmp/zii-glm-dialogue.mjs` (dialogue scripté bonjour → menace → demande de paix, 3 civs : Isabelle/Égypte/Grèce). Pour CHACUN des 3 modèles × 2 passes : latence par échange, JSON valide oui/non, contenu du `reasoning_content` (attendu : absent sur 4.5/4.7), coût `usage`. Sortie : `devtmp/banc-zii-modeles.json` + transcriptions lisibles dans le rapport. Vérifie aussi la mémoire de conversation (rappel des menaces à la demande de paix) sur le modèle final retenu.
- **L3 — Bascule data-driven** : `zii.json` → `modele` = modèle retenu (défaut D2). Vérifie le repli sans clé (wrangler `--var ZII_GLM_API_KEY:""` → `source=replique`) et une capture GUI de bulle (wrangler dédié 8787, proxy Vite piégé — voir R-191). Captures dans `dev-logs/captures-zii-flash-lite/`.
- **L4 — Suites complètes AVANT push** (règle d'entrelacement) : server, jev-port, rules, web, svelte-check, typechecks. Puis commit + push (CI déploie). Rapport `REPORT-ZII-FLASH-LITE.md` à la racine : tableau du banc, transcription des réponses des 3 modèles pour l'œil d'Erik, latence avant/après, affirmations vérifiables.

## 4. Critères d'acceptation (mesurables)

1. Banc : latence médiane du modèle retenu ≤ **2,5 s** par échange en conversation scriptée (vs 3,5–6,3 s aujourd'hui) ; validité JSON ≥ 4/5 ;
2. Suites : zii ≥ 43 verts (40 + nouveaux), server / jev-port / rules / web / svelte-check / typechecks tous verts ; `schemaVersion` 28 ;
3. Repli sans clé prouvé ; aucune clé ni transcription de secret dans le dépôt ;
4. Prod : Deploy vert + curl health 200 ; Erik dialogue avec Zii en prod et valide LA VOIX (critère final — un modèle plus rapide mais moins bon parlant sera vetoé).

## 5. Périmètre interdit

- Ne touche ni au décodeur `zii.ts` (hors commentaires), ni aux replis, à la liste blanche, au paquet léger, au budget, ni au client ;
- Pas de nouveau fournisseur (Gemini/Grok : exclus de cette mission — un seul secret `ZII_GLM_API_KEY`) ;
- Pas de changement de Jev (`jev-latest`) ni de `apps/server/tests/jev-port` ;
- Ne commets AUCUN fichier non tracké d'Erik (rapports REPORT-* d'autres missions, `devtmp/` de banls antérieurs, images, PDF) ;
- La prod n'est jamais un banc de calibrage : tout se mesure en local d'abord.

## 6. Fin de session

Rapport + arrêt + remise de la main. Erik lit les transcriptions à l'œil, valide la voix, puis le pilot accepte et met PROJET.md à jour. La suite de la file (officialisation des accords) ne démarre qu'après.
