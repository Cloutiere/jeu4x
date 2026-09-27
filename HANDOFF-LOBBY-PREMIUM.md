# HANDOFF-LOBBY-PREMIUM — Refonte visuelle de la page lobby « Eternal Empires » (vision mockup d'Erik)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X — désormais officiellement nommé **Eternal Empires**. Lis `HANDOFF.md` §4, `PROJET.md` (état — notamment LOBBY-5 : la logique de création 5 sièges existe et est déployée), `REPORT-LOBBY-5.md`. **2D uniquement.** La FENÊTRE de référence est **1920×1080** (FENETRE-GRANDE). **Les fichiers d'Erik (`new_interface/`, `new_logos/`) ne se committent JAMAIS** — copies transformées en `assets-src/` et versions web compressées dans `apps/web/public/`.

## 1. Objectif (demande d'Erik du 27/09)

Rendre la page lobby **professionnelle**, conformément à sa vision : `new_interface/gpt_V2.png` (LA référence de mise en page — suivre sa structure et son langage visuel or-sur-sombre, pas au pixel près). Erik fournit :

- **Fonds** : `background_up_digit.jpeg` (panorama de merveilles, haut) et `background_down_digit.jpeg` (carte ancienne, bas) ;
- **Vecteurs** : `epees.svg` (épées croisées — bouton créer) et `lobby.svg` (icône/titre LOBBY) ;
- **22 banderoles de nations** `*_digit.jpeg` (une par civilisation choisie, affichée À DROITE de la rangée de siège) — dont 16 correspondent aux civs du jeu et 6 en réserve (voir §2) ;
- **Logos or vectorisés par nation** (`new_logos/`, pairs png/svg) — utilisés dans le lobby (et réserve d'usages futurs : badge en jeu, écran de victoire… plus tard).

## 2. Décisions tranchées (réponses Erik du 27/09 + défauts pilot — vetoables)

- **D1 — Titre officiel : « Eternal Empires »**, sous-titre « A Fast-Paced Async 4X », tagline « EXPLORE · EXPAND · ENDURE » — en-tête haut-gauche du lobby (typographie serif or du mockup). C'est le NOM DU JEU (consigné) : mettre aussi à jour le `<title>` de la page et le titre de la fenêtre Electron (« Eternal Empires » ; le suffixe (dev) peut rester en dev).
- **D2 — Page lobby COMPLÈTE** : l'écran de création (mockup) ET la liste des parties publiques + jointure par code, restylées dans le même langage visuel (panneaux sombres, liserés or, mêmes fonds). Aucune fonction nouvelle : la logique LOBBY-5 (5 sièges, couleurs, civs aléatoires, topographie, bots) reste exactement la même — refonte PRÉSENTATION seule.
- **D3 — Bandeau neutre avant choix** : tant qu'aucune nation n'est choisie, l'emplacement de droite montre un bandeau neutre sombre (motif discret, pas d'image de nation).
- **D4 — Logos or : lobby seulement** dans cette mission (sélecteur de civ + liste déroulante). Fallback : nation sans logo fichier → pas d'icône (pas de crash). Réserve d'usages notée au rapport.
- **D5 — Mapping nations↔civs (croisé avec `civilizations.json`, vérifié pilot)** : 16 correspondances — `arabian_digit`→`arabie`, `aztec_digit`→`azteques`, et 14 directs (allemagne, amerique, angleterre, chine, egypte, espagne, france, grece, inde, japon, mongolie, rome, russie, zoulous). **6 en réserve SANS civ** : babylone, canada, celtes, danemark, portugal, suede (futures civs — ne pas afficher, conserver les assets). Table data-driven (ex. `interface/nations.json` : civId → {banderole, logo}).
- **D6 — Compression web obligatoire** : les originaux sont lourds (fonds 7,5 Mo, banderoles 4-5 Mo ×22 ≈ 100 Mo — inacceptables à charger). Pipeline : banderoles redimensionnées (~800-1000 px de haut, JPEG qualité ~80, cible < 250 Ko pièce), fonds (~1920 px de large, < 400 Ko), logos SVG tels quels (optimisés si trivial). Les originaux restent en `assets-src/` (ou resteront hors dépôt si trop lourds — au jugé : les JPEG > 3 Mo ne se committent PAS, garder les transformés seulement). Page lobby cible : chargement initial < 2 s en local.
- **D7 — Priorité desktop 1920×1080** : la mise en page vise cette fenêtre (et le navigateur large) ; dégradé simple en dessous (scroll vertical acceptable, pas de layout cassé) — pas de responsive mobile.
- **D8 — Zéro changement serveur/protocole/moteur** : tout est client (CSS/markup/assets + `<title>`). Si quelque chose semble exiger du serveur, dériver.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. Lis `Lobby.svelte` (structure actuelle), le thème CSS global (`app.css`), le routage (Home/Lobby), et regarde le mockup en détail (`new_interface/gpt_V2.png`).
- Inventaire assets : lister les fichiers fournis, croiser banderoles↔civs et logos↔civs (D5), noter les manques de logos (le rapport listera toute nation sans logo).

### L1 — Assets
- Construire la table `nations.json` (civId → banderole + logo, + entrées réserve marquées `reserve: true`).
- Compresser/intégrer : fonds, 16+6 banderoles, logos or, `epees.svg`, `lobby.svg` (D6). Fiches avant/après poids.
- Thème CSS : tokens or/sombre (couleurs du mockup : or ~#C9A227 et dégradés, fond bleu-noir profond), réutilisables par les deux écrans.

### L2 — Écran de création (le mockup)
- Structure : en-tête (titre Eternal Empires + carte « Connecté : X / Déconnexion »), bandeau LOBBY (icône + statut), carte « Labo de cartes » (lien existant), panneau « Créer une partie — 5 sièges » avec rangées (# / Type humain-bot / Couleurs / Civilisation + logo or + banderole à droite), checkbox « Civilisations aléatoires », Topographie, Timer, Partie publique, bouton or « Créer la partie » avec épées, note de pied (duel = 2 humains + 3 bots, cartes préfabriquées au labo).
- Interactions existantes conservées à l'identique (sélections, grisés, validations LOBBY-5) — banderole s'affiche à la sélection (D3 sinon).

### L3 — Liste des parties + jointure (D2)
- Panneaux « Parties publiques » (liste : noms, places libres, join) et « Rejoindre par code », restylés dans le même langage (panneau sombre, liseré or, boutons assortis) — sans changer les flux.

### L4 — Vérification
- Suite + typecheck verts (aucun test de logique ne doit changer ; si des tests assertent le DOM du lobby, les adapter à la présentation).
- e2e : créer une partie 2 humains + 3 bots dans le nouveau lobby (parcours complet), jointure par code, sélection de nation → banderole.
- **Captures `dev-logs/captures-lobby-premium/`** : page complète 1920×1080 (création, liste, jointure), détail d'une rangée avec banderole, états vides/neutres, poids des assets.

### L5 — ARRÊT POUR APPROBATION D'ERIK
Présenter captures 1920×1080 vs mockup + les poids. NE COMMITTER QU'APRÈS FEU VERT.

### L6 — Rapport
- `REPORT-LOBBY-PREMIUM.md` : mapping D5 (table finale), inventaire logos manquants éventuels, poids avant/après, écarts mockup (et pourquoi), note réserve d'usages logos, ce qu'Erik valide en ligne, 🔶 (tailles de banderoles, opacités des fonds, densité des rangées).

## 4. Critères d'acceptation

1. La page lobby 1920×1080 ressemble à la vision d'Erik (structure + langage or/sombre), titre « Eternal Empires » en place.
2. Choisir une nation affiche sa banderole à droite ; sans choix : bandeau neutre ; les 6 nations en réserve n'apparaissent nulle part.
3. Toute la logique LOBBY-5 fonctionne à l'identique (aucune régression fonctionnelle) ; création 2 humains + 3 bots complète en e2e.
4. Assets compressés (page < 2 s en local, ~4-6 Mo total max), originaux d'Erik non commités.
5. Liste publique + jointure par code dans le même langage visuel ; zéro changement serveur/moteur/protocole ; suites vertes.

## 5. Périmètre interdit
- Logos or en jeu (badge carte, écrans de victoire) — tranche future ; nouvelles fonctions lobby (chat, invitations, avatars) ; 3D ; modification de la logique LOBBY-5/serveur ; les fichiers bruts d'Erik au dépôt.
