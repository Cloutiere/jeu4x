# HANDOFF-DIAG-DEFENSE-VILLE — Pourquoi les villes tombent (diagnostic, zéro code)

**Mission de DIAGNOSTIC — pas une livraison de fonctionnalité. Zéro modification de code, zéro re-banc LLM.** Le verrou vient de l'acceptation JEV-ESCORTE (12/11) : la règle escort fonctionne (les colons obéissent), mais **3 colons du banc joueur-escorte sont morts AVEC leur ville** (p03 : colon produit t21, capitale tombée t36 ; p08 idem à (-8,25)) et **3 éliminations précoces p2** (t37, t50, t70 vs 1 en baseline). Le pilot cadrera la mission DÉFENSE-DE-VILLE sur tes conclusions — ton travail est de produire la vérité terrain.

## 1. Préalables

- Matériel : journaux archivés `sableuse/bancs/joueur-escorte/` (10 parties JSONL, seeds connus) + baseline `sableuse/bancs/joueur-gate/` + sonde `sonde-escorte-raffinee.mjs` (ton outil, reconstruit les positions par tour — réutilise-le).
- Contexte existant à lire : TB-SIEGE-DEFENSE (`9964a7b` — tactique bot rassemble + défend ses seuils), CANON-SIEGE (bonus ville 0,25), GUERRE-VIVANTE (paix), RULES.md (garnison, T-02, R-44 FormArmy).
- Baseline : rules 1200 / server 453 / web 793 / jev-port 40 / sableuse 228 verts, `schemaVersion` 28, Deploy SUCCESS `2094d10`. RIEN à pousser sauf le rapport.

## 2. Les trois questions (le pilot les pose, ton rapport y répond)

1. **Qui a pris la ville ?** barbares précoces (satellites aggro) ou belligérant civil (Jev adverse / bot) — guerres déclarées ou cohabitation hostile ? Pour chaque chute (p03 t36, p08, les éliminations t37/t50/t70) : belligérant, force d'assaut, depuis combien de tours le siège durait.
2. **Qu'est-ce qui défendait ?** garnison présente/inexistante (combien d'unités, quelles forces), unités vivantes AILLEURS au moment de la chute (explorateurs partis et jamais rappelés ? assiégeants de l'ennemi ?), bonus de ville appliqués (T-02 0,25), et pourquoi les défenseurs n'ont pas suffi (écrasés à p donné ? absents ?).
3. **Qu'est-ce que Jev savait ?** le condensé porte les `menaces` — la menace était-elle visible à temps (combien de tours d'avance) ? la question de défense/production lui a-t-elle été posée et que répondre-t-il ? si le canon bot (pas Jev) pilotait : quelle branche botPolicy a décidé (rassemble ②, garnison, exploration) et quel arbitrage a envoyé les unités ailleurs.

## 3. Méthode

- Forensic sur les journaux (ton outil de reconstruction par tour), miroir du diagnostic D3UUQJ : chronologies tour par tour des chutes (quiest où, forces, événements `CombatExchange`/`Capture`), lecture des journaux Jev (questions posées / réponses), comparaison avec la baseline joueur-gate (les mêmes seeds : ce qui a changé avec le veto escort — le colon qui attend en ville change-t-il réellement quelque chose à la défense, ou le verrou préexistait-il ?).
- Si une chute n'est pas explicable depuis les journaux : consigner l'angle mort (pas de re-banc, pas de partie nouvelle).
- Statistiques honnêtes sur n=10 : distinguer le cas confirmé du pattern suggéré.

## 4. Livrable

`DIAG-DEFENSE-VILLE.md` à la racine : chronologie de chaque chute, réponses aux 3 questions, et **une section « leviers candidats pour le cadrage »** (par ex. : seuil de garnison minimum en unités/forces, rappel défensif à la menace visible, production défensive prioritaire quand 0 défenseur, question Jev dédiée) — **sans les implémenter**, avec pour chaque levier : ce qu'il change, ce qu'il coûte, quel canon Erik il suppose. Puis arrêt, remise de la main — le pilot cadre.

## 5. Périmètre

Zéro modification de `packages/rules`, `apps/server`, `sableuse/src` (la sonde peut être étendue en script de lecture seul) ; zéro partie nouvelle ; zéro push sauf le rapport + scripts d'analyse en `devtmp/`. Ne jamais committer les secrets ni les fichiers personnels d'Erik.

**Pièges** : journaux JSONL hors git (ils sont bien à `sableuse/bancs/` — vérifier avant de conclure « données manquantes ») ; ids d'unités recyclés (leçon de la sonde raffinée — reconstruire les cycles de vie) ; la trace du banc n'est PAS la trace prod admin (`?turn=`, rétention 20 tours — ici tout est dans les journaux, tout est conservé).
