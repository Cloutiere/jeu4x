# HANDOFF-HUTTE-EXPLORATION — Une hutte adjacente s'ouvre : l'exploration ramasse les bonus sur son chemin

**Statut : prêt — NON LANCÉ.** Signalement d'Erik (04/11, partie ZWV7T5) : le guerrier de Jev passe à côté d'une hutte sans s'arrêter (tours 3-5). **Confirmé au dump admin** : u4 en (21,5), hutte h9 en (22,6) — ADJACENTE — `order: null`. Cause probable (à prouver au diagnostic) : la règle anti-recul d'OSCILLATION-MARCHE exige une amélioration stricte de distance vers la cible d'exploration lointaine → le pas latéral vers la hutte est jugé « non-améliorant » → Hold. Le fix anti-piétinement doit laisser place au ramassage des bonus.

## 0. Préalables

1. `sableuse/REPORT-OSCILLATION-MARCHE.md` (la règle « avance ou tient » + l'explorateur ancré) ; `sableuse/REPORT-CONFIANCE-EXPLORATION.md` (la doctrine D-B : explorer tant qu'il reste des cases) ; RULES R-6x (huttes : bonus à l'ouverture pour toute POSE — HUTTE-POSE) ;
2. Code : `apps/server/src/botPolicy.ts` (l'objectif `patrouiller`/`explorer` : classement des cases cibles — c'est LÀ que la hutte doit devenir une cible prioritaire ; le filtrage anti-recul), `apps/server/src/jev/` (garde de marche) ;
3. ⚠ Diagnostic L1 gratuit : rejouer les tours 3-5 de ZWV7T5 (seed dans le dump admin `devtmp/etat-ZWV7T5/`) et prouver lequel des deux bloque : (a) la cible d'exploration ignore les huttes (le classement ne les voit pas), ou (b) la règle anti-recul interdit le pas latéral. Les deux corrections sont compatibles ; prouver avant de coder.

## 1. Décision de tranche (votée par le canon CivRev d'Erik)

- **D1 — La hutte est une cible d'exploration prioritaire** : le classement des cibles de l'explorateur ajoute les huttes connues (visibles du camp) avec une forte priorité — « une hutte atteignable vaut mieux qu'une case lointaine ». Portée : un détour raisonnable (data `seuils.hutteDetourMax`, défaut à justifier — la hutte adjacente/à portée immédiate toujours ; la hutte à 6 cases de détour : à l'œil au banc) ; consommée (ouverte) → elle quitte le classement ;
- **D2 — La règle anti-recul s'incline devant la hutte** : un pas QUI ENTRE dans une case hutte connue n'est jamais un « pas arrière » — le ramassage est explicitement autorisé (exception ciblée à la règle OSCILLATION-MARCHE, testée : le pas vers une hutte ne peut pas être filtré par `filtrerMarcheBot` ni refusé par l'amélioration stricte). Zéro autre exception : le ping-pong reste mort ;
- **D3 — Intouchés** : villages barbares (PAS des huttes — les attaquer reste la porte de guerre canon, R-65), le reste du classement d'exploration, la doctrine D-B de CONFIANCE-EXPLORATION, gainSite, moteur (l'ouverture de hutte existe : bonus à la POSE), `schemaVersion` 28.

## 2. Mission L0→L3

- **L0** : préalables, sonde crédits, suites vertes (sableuse 228, server 418, jev-port 40).
- **L1 — Diagnostic** : rejeu ZWV7T5 tours 3-5 — lequel des deux bloque (classement ou anti-recul), consigné chiffré.
- **L2 — Tests FIRST** : hutte adjacente → l'unité ENTRAÎNE (Move sur la hutte, jamais Hold) ; hutte connue à portée de détour → cible prioritaire sur la case lointaine ; hutte ouverte → quitte le classement ; pas vers hutte JAMAIS filtré par la garde (test dédié) ; cul-de-sac sans hutte → Hold (non-régression anti-piétinement) ; re-cal des tests d'exploration si le classement change (consigné).
- **L3 — Banc UNIQUE ≤ 0,60 $** : 3-4 parties vanilla longues — tableau : huttes ouvertes par Jev/partie (LE critère : le banc ne mesurait pas cette donnée → l'ajouter au mètre ; attendu : la majorité des huttes à portée d'expansion ouvertes), inversions de marche (non-régression 3-14 %), victoires (non-régression), or de huttes au journal. Suites complètes, commit + push, rapport `REPORT-HUTTE-EXPLORATION.md`.

## 3. Critères d'acceptation

1. Zéro hutte adjacente contournée au banc (le cas ZWV7T5 reconstitué en test, l'unité entre) ;
2. Huttes ouvertes par Jev : significativement > 0 au banc (mesure nouvelle consignée) ;
3. Non-régression : anti-piétinement (inversions ≤ 15 %), victoires, suites vertes, `schemaVersion` 28, budget ≤ 0,60 $.

## 4. Périmètre interdit

Villages barbares et toute conduite de guerre ; le moteur (bonus de hutte : existe) ; la règle anti-recul hors exception D2 ; Zii, client ; jamais de secret ni de fichier non tracké d'Erik ; pas de banc hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : Erik rejoue — ses éclaireurs ramassent les bonus sur leur route, comme au CivRev.
