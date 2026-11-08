# HANDOFF-REGIMES-MODALE — Modale « Nouveaux régimes » à la découverte d'une tech de gouvernement

**Décisions Erik 05/10** (cadrage avec le pilot, tranchés D1-D5 présentés). Rendre VISIBLE la fenêtre R-122 « adoption sans anarchie à la complétion de la tech » — aujourd'hui un toast discret ; zéro changement moteur.

## 1. Préalables

- Lire RULES.md **R-121/R-122** (régimes, fenêtre `techsUnlockedThisTurn`), `governments.json` (6 régimes, modificateurs), `GovernmentPanel.svelte` (panneau régime actuel), le câblage toast/conseiller 7h, les images cuites TECHTREE (`monarchy/code_of_law/democracy/communism/religion`).
- Baseline : suites vertes à jour (rules 999 + web 568 + server 120), `schemaVersion` 27, **client seul**. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (votées Erik 05/10 — veto possible)

- **D1 — Modale après la résolution** : si la complétion de la tech débloque ≥ 1 régime (détectée côté client sur les événements `TechResearched` + données), modale listant les **6 régimes** : icône, nom, effets résumés (R-121) ; actif marqué ; **débloqués cette tour surlignés or + badge « Sans anarchie — ce tour seulement »** ; disponibles payants grisés « Coût : 1 tour d'anarchie » ; verrouillés inertes. Rejetable (Échap/croix/clic extérieur) — ne bloque jamais le tour.
- **D2 — Clic = ordre `SetGovernment`** (existant) : surligné → direct ; payant → confirmation explicite ; pendant une anarchie en cours → refus affiché (R-122).
- **D3 — Badge dans `GovernmentPanel`** : « Sans anarchie cette tour » tant que `techsUnlockedThisTurn` contient une tech de régime — le même état moteur que le moteur lit déjà (aucun nouveau champ).
- **D4 — R-122 intouchée** ; immunité Anarchie (Chine/Inde/Japon) = jamais de coût affiché.
- **D5 — Icônes** : techs associées cuites TECHTREE (Monarchie=`monarchy`, République=`code_of_law`, Démocratie=`democracy`, Communisme=`communism`, Fondamentalisme=`religion`) ; **Despotisme = icône repli générique or** 🔶 (art Erik plus tard).

## 3. Mission

- **L1 — test-first (client)** : détection « tech de régime complétée cette tour » ; contenu de la modale (états par régime selon état moteur + fenêtre), refus pendant anarchie, badge panel, mapping icônes (Despotisme = repli).
- **L2 — UI** : composant modale (langage AAA or-sur-sombre, miroir TECHTREE/modales existantes) + badge D3 ; déclenchement après playback de la résolution (une fois par complétion).
- **L3 — vérification GUI locale avec captures AVANT commit** : partie solo légale — complétion de Monarchie → modale avec surlignage gratuit, adoption sans anarchie ; cas payant avec confirmation ; anarchie en cours → refus affiché. Captures `dev-logs/captures-regimes-modale/`.
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push, rapport `REPORT-REGIMES-MODALE.md`.

## 4. Critères d'acceptation

1. Découvrir une tech de régime → modale claire, régime gratuit surligné, adoption en un clic sans anarchie ;
2. Le panneau régime porte le badge pendant la fenêtre ;
3. R-122 inchangée (tests moteur intacts), zéro serveur ;
4. Captures avant/après.

## 5. Périmètre interdit

Moteur/serveur/protocole ; `governments.json` (valeurs) ; le techtree livré (réutilisable, pas modifiable) ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Mini-rapport (🔶 visuels à l'œil), arrêt, remise de la main.
