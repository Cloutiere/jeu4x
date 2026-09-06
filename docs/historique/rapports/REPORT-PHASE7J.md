# RAPPORT PHASE 7j — Personnages Illustres : classes canoniques, Consume & Settle

Date : 03/09/2026. Handoff : `HANDOFF-PHASE7J.md` (source : doc d'Erik « Merveilles et Personnages », tableau Consume/Settle). Commit : `8eb8d83` — CI Deploy **success**, prod health `{"ok":true}` et bundle déployé identique au build local (`index-Ba7-5Hri.js`).

## Livré

- **D1 — Fusion Artiste/Penseur (R-114 révisée)** : une seule classe `artiste_penseur` ; l'alternance déterministe 🔶 de 7f est **obsolète** (le doc tranche). Le canal culture engendre directement la classe fusionnée.
- **D2 — Six classes canoniques (R-123 complétée)** : renommages `scientifique`→`savant`, `mogul`→`explorateur` (Grand Explorateur / Industriel), `ingenieur`→`batisseur` ; **Grand Humanitaire** nouveau — canal CROISSANCE : accumulateur `city.gpAccumFood` (excédent alimentaire > 0 cumulé en Phase C), seuil T-30 (même table `culture.json`, data-driven — aucun durcissement).
- **D3 — Consume/Settle (R-126)** : nouvel ordre `GreatPersonAction { unitId, action: 'consume'|'settle', cityId }` (validateur `orderShapeError` vérifié/enrichi EN PREMIER — leçon 7f ; validation métier GameDO ; `InstallPerson` conservé comme alias de Settle). Effets exacts du doc :
  - Consume **Bâtisseur** achève la production en cours (unité posée ville/sinon adjacente, bâtiment avec remplacement, merveille + jalon + Jardins/ONU/victoire) ;
  - Consume **Savant** achève la recherche (passe par `creditScience` → Premier découvrir applicable, comme une découverte normale) ;
  - Consume **Humanitaire** : +1 pop à toutes les cités (pendingFill) ;
  - Consume **Leader** : toutes les unités militaires (`canAttack`) → Vétéran ;
  - Consume **Artiste/Penseur** (flip) et **Explorateur** (or, 50/100/200/400) : **inactifs v1** — l'ordre est ignoré (GP reste en attente) et l'UI affiche un bouton grisé « Consume — reporté (7l / territoire) » ;
  - Settle : multiplicateurs de la cité hôte — +50 % Culture (artiste_penseur), +50 % Science (savant), +50 % Or (explorateur), +50 % croissance/surplus (humanitaire), −50 % marteaux des futurs **bâtiments** (batisseur, ×0,5 par GP, testé avec contrôle négatif), nouvelles unités vétérans (leader).
- **D4 — Canon** :
  1. **Jalon À L'OBTENTION** (révision de R-115) : tout GP obtenu (toutes classes/canaux, Premier découvrir inclus) donne immédiatement +1 jalon (`CultureMilestone` raison **`obtain`**) ; le Settle n'en donne plus. L'escalade T-27 est alimentée par **toute** obtention 🔶 ;
  2. **Seuls les installés émettent** : nouveau champ `city.settledGreatPersons: string[]` (source unique) — les multiplicateurs Settle sont lus en Phase C ; un GP « en attente de choix » n'émet rien et **ne peut pas être volé** 🔶 (test dédié) ;
  3. **Vol (R-119 révisée)** : le GP installé volé est retiré de la liste de la ville cible (le plus récent) et **réinstallé dans la capitale du voleur** (sinon première ville) — −1/+1 jalon et escalade inchangées (décision d'Erik conservée) ;
  4. **Modèle d'entité** : le doc décrit des unités civiles mobiles 2 PM ; notre modèle compteurs + entités de ville est **conservé** (écart documenté, cf. handoff).
- **D5 — Canaux d'obtention** :
  1. **Premier découvrir (R-109 étendu)** : récompense `greatPerson` **activée** — Invention → Grand **Bâtisseur** (Léonard de Vinci), Monarchie → Grand **Leader** (Roi David), posé première ville/sinon adjacente, jalon d'obtention, champ `greatPerson` dans l'événement `FirstDiscovered`. **Toutes les techs des figures existent dans l'arbre** (`litteratie` = Alphabétisation, `feudalite`, `chemin_de_fer`, `combustion`…) — aucune tech manquante signalée ;
  2. **Ciblage technologique 🔶 (R-127)** : la classe du GP culturel = celle de la figure rattachée à la tech **en cours de recherche** (`figures.json`) ; sinon **rotation déterministe** sur les 6 classes (index = `greatPersonsObtained`). Pas de RNG (alternative seedée R-80 non retenue) ;
  3. **Canaux or (500 / 10 000)** : reportés 7l (non implémentés).
- **Migration `schemaVersion` 12 → 13** : renommage des types d'unités GP, **fusion sans perte** des compteurs `greatPersonsByType` (`penseur`+`artiste` → `artiste_penseur`), champs additifs par ville (`gpAccumFood: 0`, `settledGreatPersons: []`). Idempotente, testée (tests 7j + e2e jointure : un état v12 migré puis rejoué).
- **UI** : dialogue Consume/Settle au niveau du panneau d'unité (boutons libellés avec l'effet exact, Consume inactifs grisés « reporté »), jauge GP mise à jour pour les **6 classes** (Grand Humanitaire inclus), chips « GP installés » dans le panneau de ville avec tooltip du multiplicateur, labels/toasts/journal 7j (`personnage obtenu`, `GreatPersonConsumed`, FirstDiscovered GP), compteur de jalons du header recalculé depuis `settledGreatPersons`.
- **Bot** : choix déterministe simple 🔶 = **toujours Settle** via `GreatPersonAction`.
- **RULES.md §8.8** ajouté (tableau des 6 classes Consume/Settle, R-126, R-126bis figures.json, R-127, D5.1, migration v13), R-114 réécrite.

## Tests

**580 verts** (rules 495 — dont 22 nouveaux `phase7j.test.ts` citant R-114 rév./R-123 complétée/R-126/R-127/R-119 révisée/D5.1 —, web 50, server 35), typecheck + build verts. ~35 tests préexistants mis à jour vers la nouvelle sémantique (types renommés, jalon à l'obtention, ordre Settle).

## Session live (GUI vs bot sur 5174, partie 6ESDNC)

- Deux dev servers **périmés** (pré-7j, d'une session antérieure) occupaient 8787/5174 et faussaient les premiers essais — tués et relancés avec le code courant (piège classique ; au passage : les anciens `driver7g/7i.mjs` ont disparu du dépôt).
- **GP obtenu en vivo** (canal production → Grand Bâtisseur au tour 6) : journal UI correct — « Grand Bâtisseur apparaît dans c1 (p1) » et « +1 jalon culturel pour p1 (personnage obtenu (7j)) — total 1/20 » ; état admin en schemaVersion 13, `gpAccumFood`/`settledGreatPersons` présents.
- **Bug réel trouvé et corrigé en vivo** : les classes renommées n'avaient pas de sprites → `buildUnitContainer` renvoyait un conteneur sans barre de PV → exception `fill.width` sur null dans le ticker → **boucle de rendu morte, clics carte inopérants**. Corrigé : alias de silhouettes pour les 6 classes (art dédiée 🔶 7k) + garde-fou `hpFill` null. Capture : `dev-logs/captures-7j/`.
- **Limite de vérification** : après le correctif, je n'ai pas pu rejouer le clic de sélection du GP dans l'iframe d'automatisation (les clics synthétiques restent sans effet sur la carte, y compris sur des cases ordinaires — probablement propre à l'environnement d'automatisation, le tooltip de survol fonctionnant correctement). **À vérifier en ligne avec le login OAuth d'Erik** : le dialogue Consume/Settle au clic sur un GP, les boutons grisés « reporté », les chips GP installés et les multiplicateurs en jeu. Le e2e « obtention par chaque canal + consume/settle + vol d'installé » est couvert au niveau moteur par `phase7j.test.ts` (22 tests, tous les canaux : culture, science, or, production, croissance, combat, Premier découvrir).

## Valeurs 🔶 à calibrer (aucune recalibrée sans accord)

- Seuil du canal Humanitaire : réutilise T-30 (20, ×2 par GP de la classe) — un seuil de croissance dédié (`T-xx` propre) est possible si Erik le souhaite ;
- Jalon à l'obtention alimente T-27 pour **toutes** classes (les GP d'accumulateurs font monter le seuil culturel) ;
- Multiplicateurs Settle **additifs** (+50 % par GP installé de la classe) ; remise Bâtisseur **multiplicative** (×0,5 par GP) ;
- Leader Settle = unités produites **vétérans** (interprétation du « +3 XP », pas de modèle d'XP) ;
- Déficit alimentaire ne détruit pas `gpAccumFood` (seul le surplus > 0 crédite) ;
- Ciblage R-127 : pondération déterministe (rotation en repli) — le tirage seedé R-80 reste une alternative ;
- Bot : toujours Settle.

## Reste (phases suivantes)

7k merveilles (effets restants, obsolescence GLOBALE, exclusivité, récupération de marteaux) ; 7l trésorerie (rush-buy, Banque mondiale, canaux GP par or, injection d'or Explorateur, flip culturel/territoire en suspens) ; 7m ICBM/SDI + contre-espionnage ; 7n civilisations & traits. Art dédiée pour les 6 classes GP (sprites génériques réutilisés en 7j).

## Fin de session

Dev servers locaux arrêtés. main poussé (`8eb8d83`), Deploy CI success, prod vérifiée. Rémise de la main au pilot.
