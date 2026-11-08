# HANDOFF-HANG-LOCAL — Diagnostiquer et régler le hang à la résolution du tour 6 en local (wrangler dev)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `PROJET.md` (état — notamment le signalement : **hang local à la résolution du tour 6, wrangler dev, partie solo, même sans ordre ; le jeu local ne se joue pas au-delà du tour 5 ; la PROD n'est pas concernée**), et les conventions serveur (GameDO, alarmes, WebSocket hibernation, résolution de tour dans `apps/server/src/game.ts`). Baseline : suites vertes, prod 200. **2D uniquement.** Règle d'or : **diagnostiquer avant de corriger** — le correctif dépend de la couche fautive, et elle n'est pas encore connue.

## 1. Objectif (demande d'Erik du 01/10)

Rendre le jeu **jouable en local** au-delà du tour 5. Trois suspects, trois conséquences très différentes :
1. **Moteur** (`packages/rules`) : un état précis de tour 6 fait boucler `resolveTurn` → **vrai bug à corriger** (la prod n'est épargnée que par hasard) ;
2. **Serveur** (GameDO) : un `await` qui ne revient jamais (alarme, stockage, WebSocket) pendant la résolution → correction serveur ;
3. **Wrangler/workerd** : un pépin de l'outil de dev (limites, mode simulator, version) → **contournement documenté** (ex. `--remote`, ajustement de config), pas de « correction » du code.

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Séparation des suspects D'ABORD** (le moteur est pur, exploitons-le) : capturer l'état exact au tour 5 d'une partie solo locale qui hang (dump admin `#/debug` ou export local — l'outil existe) puis exécuter `resolveTurn` sur cet état **dans Node pur, hors wrangler**, avec timeout et profilage. Verdict : ça hang (moteur) / ça passe (serveur ou wrangler).
- **D2 — Si moteur** : reproductibilité minimale (test unitaire avec l'état capturé — réduit si possible), correctif minimal test-first, **sans changer aucune règle** ; le hang affecte potentiellement la prod (même moteur) → la correction est prioritaire et ira en prod à ton feu vert.
- **D3 — Si serveur (DO)** : identifier l'attente bloquante (logs `wrangler tail` + traces autour de la résolution dans `game.ts`), corriger (ex. alarme manquante, promesse non résolue, boucle d'attente). Aucun changement de protocole sans validation d'Erik.
- **D4 — Si wrangler/workerd** : NE PAS « réparer » workerd — documenter le contournement (mode remote, flags, version), l'ajouter aux docs dev (`serveurs-locaux`), et vérifier que le flux dev complet redevient utilisable. Consigner la version de wrangler et le comportement observé (candidat à un rapport upstream, pas à un patch local).
- **D5 — Régression protégée** : quelle que soit la couche, les suites moteur/serveur existantes restent vertes, les cartes existantes bit-identiques si le moteur est touché (le précédent CI-FLAKY : relances RNG dérivées, pas de redistribution), et **zéro changement protocole**.
- **D6 — Si le hang n'est PAS reproductible au diagnostic** (il ne se manifeste plus) : le dire franchement, consigner les conditions exactes connues (tour 6, solo, sans ordre), instrumenter le chemin de résolution (logs de phase + durée) pour capturer la prochaine occurrence, et livrer l'instrumentation + le protocole de capture au lieu d'un correctif spéculatif. **Interdit de « corriger » au hasard.**

## 3. Mission

### L0 — Reproduction et capture
- Reproduire le hang en local (solo, wrangler dev, résolution tour 5→6) ; capturer : `wrangler tail`, CPU (le processus wrangler boucle-t-il à 100 % ? indicateur fort : boucle CPU = moteur ; idle = attente bloquante), version de wrangler, logs du GameDO.
- Exporter l'état du tour 5 (dump admin local).

### L1 — Verdict de couche (D1)
- `resolveTurn` Node pur sur l'état capturé (timeout 60 s + stack au timeout). Documenter le verdict et le mécanisme précis (quelle phase de résolution, quelle boucle ou quel await).

### L2 — Correctif/contournement selon la couche (D2/D3/D4/D6)
- Minimal, test-first, protégé D5. Si wrangler : contournement + docs.

### L3 — Vérification
- Partie solo locale jouée **au-delà du tour 6** (objectif : 20+ tours sans hang) ; e2e existants verts ; si moteur touché : banc seeds (précédent CI-FLAKY) bit-identique hors seed du bug ; prod intacte.
- **Captures/extraits `dev-logs/hang-local/`** : verdict, preuves (stack, timings), correctif.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter : la couche fautive et POURQUOI, le correctif (ou le contournement, ou l'instrumentation si non reproduit), preuves. NE COMMITTER QU'APRÈS FEU VERT — et si la prod est concernée (D2), le dire explicitement à l'arrêt.

### L5 — Rapport
- `REPORT-HANG-LOCAL.md` : reproduction, verdict de couche (avec preuves), correctif/contournement, limites, 🔶, mise à jour des docs dev (serveurs locaux).

## 4. Critères d'acceptation
1. Une partie solo locale passe le tour 6 et se joue au-delà (20+ tours) sans hang.
2. La couche fautive est identifiée avec preuves — pas d'hypothèse non vérifiée dans le correctif.
3. Si moteur : test de non-régression + cartes existantes bit-identiques ; si wrangler : contournement documenté pour tout l'équipe.
4. Suites vertes, zéro changement protocole, zéro secret.

## 5. Périmètre interdit
- Toucher à la prod ou forcer un déploiement (le correctif moteur, s'il y a, partira avec le prochain push validé par Erik) ;
- Modifier le protocole, la coquille Electron, la sableuse/JEV ;
- Tout « correctif » sans verdict de couche (D6) ; désactiver un test ou une assertion pour passer.
