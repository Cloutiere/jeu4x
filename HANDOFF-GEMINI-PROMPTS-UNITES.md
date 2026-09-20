# MISSION GÉMINI — Créer les prompts Recraft des unités du jeu (assets vectoriels, style injecté par référence)

Tu es un assistant spécialisé en rédaction de prompts de génération d'images pour **Recraft.ai** (mode Vector Illustration). Ton client développe un jeu de stratégie 4X au tour par tour inspiré de Civilization Revolution : hexagones, style « board-game facetté » avec contours brun foncé, personnages en pied lisible en petit format. **Ton travail : rédiger UN prompt Recraft par unité de la liste ci-dessous.**

## 1. Le protocole de style (IMPORTANT — ne pas décrire le style dans les prompts)

Le style visuel (trait, ombrage, palette, proportions) est **injecté par une image de référence** que le client sélectionnera dans Recraft (son guerrier validé). Donc :

- Tes prompts décrivent **uniquement** : le sujet, l'époque/les tenues, la pose, l'arme, et la **zone d'accent** (voir §2) ;
- Ne décris PAS le rendu (pas de « flat vector », pas de « clean outlines », pas de couleurs de tenue précises — sauf les gris d'accent du §2 et l'encre des contours si utile). Recraft calera le style sur l'image de référence ;
- Cohérence : tous les prompts doivent pouvoir passer avec la MÊME image de référence sans se contredire.

## 2. Le protocole d'accent (LE point critique)

Chaque unité possède **UNE zone d'accent** — l'élément qui recevra, à l'intégration, les couleurs de la faction du joueur (le jeu recolore mécaniquement cette zone). Dans le SVG livré par Recraft, cette zone doit être dessinée **uniquement avec 3 gris exacts** (ce sont des repères de luminance qui seront remplacés par les couleurs du joueur) :

- **`#FFFFFF` (blanc pur)** — la teinte de BASE de la zone (la grande masse) ;
- **`#FEFEFE`** — les REFLETS (les petites zones éclairées de la zone d'accent) ;
- **`#8C8C8C`** (gris moyen) — les OMBRES (les creux et le dessous de la zone d'accent) — en aplats nets, style facetté, PAS de dégradé continu ;

Règles impératives :
1. La zone d'accent est **opaque** (aucun pixel transparent dedans, pas de trou) ;
2. Aucun autre gris que ces trois-là dans la zone d'accent ; les détails (lignes, motifs) peuvent être tracés en **encre brun foncé `#2B2620`** par-dessus les gris — ils resteront visibles sous toutes les couleurs ;
3. Le reste de l'unité (peau, tissus, cuir, bois, métal) ne contient **ni blanc pur, ni `#FEFEFE`, ni `#8C8C8C`** — ces trois valeurs sont RÉSERVÉES à la zone d'accent (le pipeline les détecte au pixel) ;
4. Dans chaque prompt, **nomme explicitement la zone d'accent** et précise qu'elle est dessinée « in three flat placeholder grays: highlights #FEFEFE, base #FFFFFF, shadows #8C8C8C — these exact placeholder grays will be recolored ».

## 3. Le format commun des prompts (recopie dans chacun)

```
Full-body game sprite of [UNIT + ERA + DETAILS], front view, standing pose facing the camera,
readable silhouette at small size, [ACCENT ZONE description, dessinée en 3 aplats gris :
highlights #FEFEFE, base #FFFFFF, shadows #8C8C8C — flat placeholder grays that will be
recolored]. No background, no shadow, no text, transparent background, single centered
character.
```

Complète les crochets ; tu peux développer, mais garde la structure et les hex exacts.

## 4. La liste des unités (vague 1 — terrestres, ordre chronologique d'apparition dans le jeu)

Pour chaque unité : le repère historique CRÉDIBLE à décrire (le client tient à l'exactitude d'époque — pas d'anachronisme), et la **zone d'accent** proposée (un seul élément par unité, visible de face).

1. **Colon** (fonde les villes) — colons du Néolithique/chalcolithique : tunique de peau ou laine brute, bottes de cuir simple, il porte un fardeau (sac, outils, enjoliveur de bâton) et tient un bâton de marche. Zone d'accent : **le grand sac de fardeau sur son dos**.
2. **Archer** (début de partie — PAS médiéval) — archer de l'âge du bronze/préhistoire récente : arc simple en bois (pas d'arbalète, pas d'arc recurvé décoré), carquois en os/rotin, vêtements de peau et cuir, pas d'armure. Zone d'accent : **le carquois**.
3. **Piquier** — hoplite/phalange antique (Grèce ou Macédoine, ~Ve-IVe s. av. J.-C.) : tunique courte, linothorax simple ou cuir, casque corinthien léger, long pique tenu oblique, petit bouclier rond. Zone d'accent : **le bouclier**.
4. **Légion** — légionnaire romain (Ier s. av. – Ier s. ap. J.-C.) : lorica segmentata ou maille, scutum rectangulaire, gladius, casque galea. Zone d'accent : **le scutum** (face du bouclier).
5. **Catapulte** (à distance) — catapulte de siège antique (Grèce/Rome, ~IIIe s. av. J.-C.) : machine à traction/flexion sur chariot en bois, PAS un trébuchet médiéval. Deux servants. Zone d'accent : **le cadre/bras de la machine** (les éléments en bois peints).
6. **Cavalier** — cavalier antique (cavalerie légère thrace/scythe ou compagnons, ~Ve s. av. J.-C.) : cheval monté sans étriers, tunique courte, javelot ou épée courbe, petite cape. Zone d'accent : **la cape du cavalier** (elle flotte, bien visible).
7. **Chevalier** (ici, le médiéval est correct) — chevalier européen XIe-XIIIe s. : cotte de mailles, heaume ou casque à nasal, tabard/surcot, monture caparaçonnée légère. Zone d'accent : **le tabard (surcot)**.
8. **Fusilier** — fusilier d'infanterie de ligne (XVIIe-XVIIIe s.) : uniforme réglementaire (veste croisée, guêtres), tricorne ou shako précoce, mousquet à baïonnette. Zone d'accent : **la veste de l'uniforme**.
9. **Canon** (à distance) — canon de campagne à poudre (XVe-XVIe s.) : tube de bronze sur affût en bois à roues, un ou deux servants, boîte à munitions. Zone d'accent : **l'affût (châssis en bois peint)**.
10. **Infanterie moderne** — fantassin Première Guerre mondiale : casque Adrian ou Brodie, uniforme drap, fusil, sac de campagne. Zone d'accent : **la veste de l'uniforme**.
11. **Char d'assaut** — char d'assaut Seconde Guerre mondiale (type Sherman/T-34, silhouette générique) : tourelle, chenilles, plaque frontale, regarder de trois-quarts pour lisibilité. Zone d'accent : **la plaque frontale/tourelle**.
12. **Artillerie** (à distance) — obusier de campagne Seconde Guerre mondiale : tube long sur affût bifurqué, roues pneumatiques, un servant. Zone d'accent : **le bouclier de l'affût**.

## 5. Vagues suivantes (ne PAS les faire maintenant — le client les demandera)

Vague 2 : unités uniques de civilisations (16). Vague 3 : navals (galère, galion, croiseur, cuirassé, sous-marin). Vague 4 : aériens (chasseur, bombardier). Vague 5 : spéciaux (espion, caravane, Personnages illustres). Attendre la validation du style et du format sur la vague 1.

## 6. Format de ta réponse

Pour chaque unité : un titre (`## Guerrier — …`), puis **le prompt Recraft en anglais** (prêt à coller), puis **une ligne en français** : « Zone d'accent : … » (la confirmation de l'élément coloré). Termine par la liste des points de règle que tu as appliqués (§2) — une seule fois, en récapitulatif.

## 7. Contraintes de sortie

- Anglais pour les prompts (Recraft), français pour le reste ;
- Un seul personnage (ou machine + servants) par prompt ; pose de face ou trois-quarts face ; lisible en petit ;
- Jamais d'arrière-plan, d'ombre portée, de texte, de cadre ;
- Jamais de référence à des franchises ou artistes existants ;
- Les hex `#FEFEFE` / `#FFFFFF` / `#8C8C8C` / `#2B2620` doivent apparaître EXACTEMENT ainsi dans chaque prompt qui les utilise.
