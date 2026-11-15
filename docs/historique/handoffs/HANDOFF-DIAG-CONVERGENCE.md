# HANDOFF-DIAG-CONVERGENCE — Pourquoi l'armée de campagne ne converge jamais (diagnostic, zéro code)

**Mission de DIAGNOSTIC — pas une livraison de fonctionnalité. Zéro modification de code source, zéro banc nouveau ; re-simulations locales tsx + journaux existants.** Contexte : D1-CAMPAGNE (ton commit LOCAL sur `2b4e386`) a réduit les épinglages barbares de −83 %/−65 % comme prédit, **mais la convergence ne reprend PAS** : maxEffectifRayon moyen toujours **0,1**, 40/40 guerres jamais ≥ 4 au rayon, banc bot bit-à-bit (2/2/1), alors que des armées de 6-8 existent et que le diagnostic VERROUS avait montré une distance membres→campagne de 22. **Un second mécanisme empêche les membres « en marche » de joindre le rayon de ralliement** — jamais diagnostiqué. Erik a tranché : le diagnostiquer AVANT toute décision (V3-(ii) reste en place localement, non régressif ; il sera poussé dans la passe finale quelle que soit l'issue).

## 1. Préalables

- Docs : BOT-MARCHE (marche monotone), TB-SIEGE (rassemble, `effectifCampagne`), D1 (refuge/tiering — ton code), COLLISION-MOBILE, D2-POSTURE, OSCILLATION-MARCHE (anti-recul), leçon NP8JEE (waypoint non praticable — même famille de candidat ici).
- Candidats à forer (ton intuition de l'arrêt, à confirmer/infirmer) : la **cible de ralliement re-tirée chaque tour** (le point de rendez-vous change avant que les membres n'y arrivent — ils courent derrière un objectif mobile) ; **re-assignation/drafts** (l'unité change de rôle et sa route avec) ; la marche elle-même (anti-recul, praticabilité, chemin interrompu) ; D2-collision mobile filtrant les pas de convergence vers les barbares errants (le pas vers le ralliement croise souvent leur portée) ; D1 résiduel (les pins −83 % mais les 919-2 432 restants ?).
- Baseline : ton commit LOCAL `028773d`-base + D1-CAMPAGNE (local), prod poussée `2b4e386`, suites rules 1214 / server 536 / web 793 / jev-port 52. Journaux : tes bancs, `devtmp/diag-verrous-siege.ts` (ton outil — l'étendre).

## 2. La question unique

**Pourquoi un membre d'armée de campagne à d = 22 du rayon, non épinglé (D1 levé), ne rejoint JAMAIS le rayon en 150 tours — quel mécanisme bloque ou annule sa marche de convergence, tour après tour ?**

Méthode : instrumenter TON outil (`diag-verrous-siege.ts`) pour suivre UNE armée de campagne complète tour par tour (position de chaque membre, objectif courant, ordre émis, pas réellement fait, distance au rayon) sur 3-4 guerres représentatives ; classer chaque tour non-convergent par cause : objectif re-tiré (ralliement mobile ?), ordre écrasé par une priorité supérieure (garnison/rappel/D1 résiduel/patrouille), pas refusé (anti-collision/anti-recul/praticabilité), mp perdues sans pas, unité ré-assignée. Puis généraliser sur les 40 guerres (comptages).

## 3. Livrable

`DIAG-CONVERGENCE.md` à la racine : la chronologie d'au moins une armée complète (tour par tour), la cause identifiée (mécanisme précis, fichier:ligne), les autres candidats infirmés, le classement des causes sur 40 guerres, et **une section « leviers candidats pour le cadrage »** (paramètre + valeur + risque + test de verrouillage, dans l'esprit des leviers passés : mechanism-first, pas de seuil à l'aveugle). Puis arrêt, remise de la main — le pilot cadrera la passe finale convergence + D1-CAMPAGNE avec fin de partie garantie.

## 4. Périmètre

Zéro modification de code source (ton script d'instrumentation en `devtmp/` seul), zéro partie nouvelle, zéro banc. Ne jamais committer les secrets ni les fichiers personnels d'Erik.

**Pièges** : cache vitest RACINE ; re-sim via `tsx` ; Guerrier = mouvement 1 ; `order null` = lecture piège ; l'ordre du tour est recalculé chaque tour (un membre peut avoir un objectif différent chaque tour SANTI gérer une route persistante — c'est peut-être LE mécanisme) ; chaque analyse cite fichier:ligne.
