# HANDOFF-EMBARQUEMENT-PROGRAMME — Embarquer/débarquer sur les chemins programmés des navires

**Décisions Erik 03/10 (tranchées en vivo avec le pilot, feed direct).** Suite directe d'EMBARQUEMENT-BUG (`72ea5ea`) qui a rétabli le geste actuel ; ce chantier change la MÉCANIQUE, pas seulement le client.

---

## 1. Préalables

- Lire `RULES.md` **R-117** (Mouvement naval — Transport), **R-41** (ordre de résolution unitId), R-30/R-159 (cohabitation/priorité de destination), R-161 (fog) ; leçon générale : valider le validateur `orderShapeError` AVANT toute nouvelle forme d'ordre.
- Baseline : suites vertes (rules 954 + web 488 + server 120), `schemaVersion` **27**. Vérifier `git status` (sessions parallèles possibles ; le serveur dev 5174 d'Erik tourne — ne pas y toucher).
- Étude du pilot (à re-vérifier, pas à refaire) : la résolution Phase A exécute les chemins unité par unité en ordre unitId (`turn.ts` ~4686, `executeMoveOrder` ~1159) — aucune notion de rencontre entre chemins. Embarquement actuel = pas vers une case occupée par un transport au moment de l'exécution (position de début de tour en pratique) ; débarquement actuel = premier pas terrestre libre adjacent au transport, puis l'unité poursuit (attaque comprise). Client : `interaction.ts` `boardableTransport` (~318) et portes `pathTo` (~540-560) ; `interaction.ts:791` — « une cargaison n'a pas d'ordre à donner » ; `UnitPanel.svelte` boutons « Débarquer en (q,r) » adjacents (~556-567) et chip cargaison (~184-190).

## 2. Contexte — le problème d'Erik (capture du 03/10)

Galère dans la ville portuaire, guerrier adjacent : il est impossible d'embarquer — la seule destination d'embarquement est la case du bateau AU DÉBUT du tour ; or entrer dans la ville ne doit pas embarquer (garnison). Si le bateau est programmé sur l'eau, l'unité ne peut pas le rejoindre là où il SERA. Et un bateau en chemin ne peut déposer sa cargaison qu'adjacente à sa position de début de tour.

**Le moteur doit connaître les CHEMINS PROGRAMMÉS des navires pendant la résolution.**

## 3. Décisions d'Erik (votées le 03/10 — non négociables)

- **D1-B — Embarquement à la volée** : le bateau est embarquable en n'importe quel pas de son chemin programmé. Gestes couverts : (a) l'unité marche vers une case du chemin du bateau (départ, intermédiaire, arrêt) ; (b) **ramassage** : le bateau programmé ENTRE sur une case où une unité terrestre amie est debout → il la ramasse.
- **D2-A — La dépose n'arrête pas le bateau** : il dépose et poursuit son chemin jusqu'à sa case d'arrêt.
- **D3-A — Geste de dépose** : navire sélectionné → la cargaison devient sélectionnable → clic droit sur la case terrestre cible = « débarque ici ». Le moteur la dépose au **premier pas du chemin d'où la dépose est possible** (case terrestre LIBRE adjacente à la position courante du navire, contrôle initial à la position de départ compris).
- **D4 — Embarquer ou débarquer TERMINE LE TOUR de l'unité** : PM à 0, chemin restant annulé, **aucune attaque après une dépose** (révocation de la « poursuit normalement, attaque incluse » de R-117 — tests historiques à réécrire, motif R-62).
- **D5 — Ville portuaire** : entrer dans la ville = garnison, JAMAIS un embarquement (même si un transport ami y est) — comportement actuel préservé et verrouillé par test.
- **D6 — Ordre de résolution** : **passe navale d'abord** (unitId croissant), puis passe terrestre (unitId croissant, inchangée). R-41 amendée en conséquence.
- **D7 — Capacité de chargement** : infinie (décision du 02/10) — `cargoCapacity` reste ignoré ; le ramassage embarque TOUTE la pile debout sur la case d'entrée.

## 4. Modèle de résolution (spécification à implémenter)

**Passe navale** — chaque navire exécute son chemin pas à pas :
1. Contrôle initial (avant de bouger) : si sa cargaison a un ordre de débarquement dont la cible est une case terrestre libre adjacente à sa position courante → dépose (événement `Disembark`), cargaison PM 0, puis le navire poursuit ;
2. À CHAQUE pas, dans l'ordre : (a) dépose éventuelle comme ci-dessus ; (b) **ramassage** : les unités terrestres AMIES debout sur la case d'entrée embarquent (événement `Embark`, leur ordre/chemin est annulé, PM 0). Une unité déjà embarquée ne peut pas être visée ; les ennemis suivent les règles normales (mêlée/capture — aucun ramassage ennemi) ;
3. Bateau bloqué avant son terme : les unités qui visaient un pas non atteint ne rencontrent rien (pas d'embarquement, arrêt normal R-30/R-159).

**Passe terrestre** (règles actuelles, deux extensions) :
4. Une unité terrestre qui ENTRE sur une case occupée par un transport ami embarque — la case peut désormais être **n'importe où le navire SE TROUVE À CE MOMENT** (arrêt après passe navale, y compris sa case d'arrêt programmée — c'est le cas d'Erik). Coût 1 PM puis **PM 0 (D4)**, chemin gelé/annulé ;
5. **Limite consignée** : une unité qui marche vers un pas INTERMÉDIAIRE déjà franchi par le navire (ni départ ni arrêt) ne rencontre rien ce tour — elle s'arrête sur sa cible. 🔶 raffinement futur possible (« pause-and-resume » du navire au point de rendez-vous) — à NE PAS implémenter.

**Ordre de débarquement** : réutilise l'ordre `Move` de l'unité embarquée (pas de nouvelle forme — vérifier quand même `orderShapeError`). Validation moteur à la résolution : cible terrestre libre, adjacente à au moins un pas du chemin programmé (ou de la position) du transport du même tour ; sinon l'ordre est ignoré proprement (cargaison reste à bord, consigné dans le journal). Fog : dépose possible sur case inconnue (le moteur est autoritaire, le filtrage fog s'applique au rendu).

## 5. Mission

- **L0** : relire R-117/R-41 et le code cité §1 ; confirmer le diagnostic ; vérifier `orderShapeError` pour `Move` d'une unité embarquée.
- **L1 — test-first (moteur)** : suite `embarquement-programme.test.ts` couvrant : le scénario de la capture (galère ville→eau programmée, guerrier sur case d'arrêt → à bord, PM 0) ; ramassage en marche (pile entière, ordres annulés) ; dépose au pas intermédiaire (navire 3 PM, dépose au 2e, le navire finit sur son arrêt, cargaison PM 0, ZÉRO attaque ce tour même avec cible adjacente) ; dépose au contrôle initial ; dépose impossible → reste à bord ; ville = garnison jamais embarquement ; bateau bloqué → pas d'embarquement ; unité vers pas intermédiaire franchi → limite consignée ; naufrage après dépose (la déposée survit) ; R-41 navale-d'abord (barbares compris) ; reprise d'une partie en cours (chemins gelés existants). Réécrire les tests R-117 historiques contredits par D4.
- **L2 — moteur** : passe navale / passe terrestre dans la Phase A (mirroir miroir des événements `Embark`/`Disembark` existants — playback, journal, laboCombat, replay REPLAY-RESOLUTION). Aucune migration attendue (aucun champ nouveau — sinon la consigner et la justifier, `schemaVersion` ne bouge que si nécessaire).
- **L3 — client** : (a) `pathTo`/`toBoardable` acceptent toute case du chemin programmé d'un transport ami (positions dessinées, flèche FLECHE-MOUVEMENT) ; (b) D3-A : cargaison sélectionnable depuis le navire (chip UnitPanel), clic droit terrestre = ordre de dépose, aperçu fantôme sur la cible ; (c) les boutons « Débarquer en (q,r) » adjacents restent (raccourci du cas immédiat) ; (d) validation locale miroir exacte du moteur ; (e) jamais de destination d'embarquement sur une case de ville (D5) ; (f) affichage : l'unité ramassée/à bord miroite le navire (existant), la déposée apparaît à sa case.
- **L4 — vérification** : suites vertes (rules + web + server), svelte-check 0 ; **e2e solo légal** (`devtmp/`, motif `embarquement-e2e.mjs`) rejouant le scénario de la capture + une dépose en chemin, vérifiées au dump serveur ; **captures GUI** `dev-logs/captures-embarquement-programme/` (validation locale AVANT tout commit).
- **L5** : `RULES.md` — R-117 révisée (D1-B/D2-A/D3-A/D4 — poursuite post-débarquement abrogée, embarquement = fin de tour) et R-41 amendée (D6) ; rapport `REPORT-EMBARQUEMENT-PROGRAMME.md` ; commit, push (la CI déploie).

## 6. Critères d'acceptation

1. Le scénario de la capture fonctionne de bout en bout (programmation navire puis unité → embarqué à la résolution) ;
2. Ramassage d'une unité debout sur le chemin d'un bateau programmé ;
3. Dépose au 2e PM d'un bateau 3 PM qui continue, cargaison termine son tour là ;
4. Ville portuaire = garnison, jamais embarquement ;
5. D4 verrouillé par tests (ni poursuite ni attaque après embarquement/débarquement) ;
6. Suites et bancs verts, e2e + captures, replay et journal cohérents.

## 7. Périmètre interdit

Re-tranchage de `cargoCapacity` (D7 — infinie, dossier séparé) ; combat naval et soutien R-118 ; unités aériennes ; pause-and-resume (§4.5) ; tout le 3D ; `schemaVersion` sauf nécessité démontrée dans le rapport ; RELECTURE-3D.

## 8. Fin de session

Rapport `REPORT-EMBARQUEMENT-PROGRAMME.md` (défauts 🔶, liste « reste à vérifier en ligne par Erik »), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
