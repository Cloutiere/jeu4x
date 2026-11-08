# HANDOFF-OSCILLATION-MARCHE — Fini le ping-pong : une marche qui avance ou s'arrête, jamais ne recule

**Statut : prêt — NON LANCÉ.** Le résiduel consigné depuis GUERRE-VIVANTE (l'armée bot qui oscille « 27-29 / 20-23 » au banc) vient d'être **capturé en prod par Erik** (02/11) : l'unité u4 de Jev ping-pong entre **(23,31) et (24,31)** des tours 8 à 12 (Chroniques : #30 #34 #36 vs #28 #32 #38), après une progression normale à l'est (19,32 → 23,32). C'est LE bug : la marche MultiStep (D-E2, re-planifiée chaque tour) repart en arrière au lieu d'avancer ou de s'arrêter.

## 0. Préalables

1. `sableuse/REPORT-GUERRE-VIVANTE.md` §1 (le constat banc : « objectifs `rallier` corrects mais 0 progression nette — oscillation locale, `auRayon=0` à jamais, cause fine non élucidée (recalcul de chemin / brouillon garnison / parité hex) ») ; `REPORT-JEV-CALIBRAGE-OFFENSIF.md` (la marche D-E2 : `cheminMarche` pas glouton, re-planifié chaque tour, cible = capitale vue OU point de passage projeté) ;
2. Code : `sableuse/src/partie.mjs` + `joueur.mjs` (la marche : calcul de cible, re-planification), port TS bit-à-bit `apps/server/src/jev/`, et côté BOT `apps/server/src/botPolicy.ts` (la même oscillation y a été vue au banc — si la cause est partagée, un seul fix des deux côtés ; si distincts, consigner séparément) ;
3. ⚠ Discipline : diagnostic AVANT tout code (gratuit), tests FIRST, banc bot 40×3 gratuits, banc Jev de confirmation UNIQUE ≤ 0,60 $ si le fix touche la marche de Jev, sonde crédits, jev-port via config dédiée.

## 1. Mission L0→L4

- **L0** : préalables, suites vertes, `git status` propre.
- **L1 — Diagnostic (gratuit, AVANT tout code)** :
  (a) **Reproduire au banc** : les oscillations consignées (bancs guerre-vivante/croissance : « 27-29/20-23 ») sont déjà dans les journaux JSONL locaux — extraire 2-3 cas complets (cible demandée, cible choisie, chemin calculé, raison du pas arrière) ;
  (b) **La trace d'Erik** : la partie prod a un seed dans son GameDO — si Erik peut fournir l'identifiant de partie, extraire les tours 4-12 ; sinon, se contenter du banc (l'oscillation y est reproductible). Hypothèses à trancher PAR LA TRACE : la cible bascule-t-elle chaque tour (capitale vue ⇄ point de passage) ? le chemin recalculé repart-il du parent le plus proche (l'unité « revient » à l'anneau) ? un conflit d'ordre (garnison qui réabsorbe, ordre fortify écrasant la marche) ? une parité hex (2 pas d'aller-retour = même hexagone rayon) ?
  (c) **Cadrage du fix selon la cause** : la règle cible est simple — **une marche ne pose jamais un pas qui augmente la distance à sa cible courante ; si aucun pas utile n'existe, l'unité tient sa position** (ordre explicite, journalisé). Si la cause est la cible qui bascule : mémoriser la cible au memo (stabilité tant que la condition de bascule n'a pas changé) — à cadrer au rapport AVANT de coder si ça sort de cette règle.
- **L2 — Tests FIRST** : le cas ping-pong reconstitué (même fixture que la trace) : l'unité n'émet plus jamais un pas arrière ; la marche vers cible lointaine avance nette ; l'arrêt est explicite et journalisé ; les re-cals des tests de marche existants consignés.
- **L3 — Bancs** : bot 40×3 avant/après (l'oscillation du bot doit disparaître : tours moyens, progression des campagnes) ; si Jev touché : banc Jev de confirmation ≤ 0,60 $ (5 seeds croissance — les marches des guerres parties 4/5 doivent progresser sans ping-pong). Suites complètes, commit + push, rapport `REPORT-OSCILLATION-MARCHE.md` (la cause, la règle du fix, les tableaux avant/après, la trace d'Erik traitée si disponible).
- **L4 — Remise de la main** : Erik re-joue/re-regarde sa partie — plus de ping-pong.

## 2. Critères d'acceptation

1. Zéro pas arrière dans les traces (banc ET partie d'Erik si fournie) : une marche avance ou tient, jamais ne recule ;
2. Les guerres des bancs progressent (fin des campagnes immobiles : `auRayon` atteint dans les parties 4/5 du banc guerre-vivante re-jouées si banc Jev) ;
3. Suites toutes vertes ; `schemaVersion` 28 ; budget ≤ 0,60 $ si banc Jev.

## 3. Périmètre interdit

Le canon de la marche (cible capitale/point de passage, fog, re-planification) : on corrige la STABILITÉ, on ne redessine pas la stratégie ; les déclarations mécaniques, le siège, la diplomatie : INTACTS ; jamais de secret ni de fichier non tracké d'Erik ; pas de banc hors verdict Erik en session.

## 4. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : dernier résiduel majeur de la chaîne IA levé — Erik joue contre le Jev complet.
