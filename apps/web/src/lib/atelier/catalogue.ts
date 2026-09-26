/**
 * catalogue — INDEX CENTRAL des assets visuels de l'atelier (page #/atelier).
 *
 * Généré depuis les SOURCES DE VÉRITÉ du projet (aucune liste dupliquée à la
 * main) : `visuel3d.json` via `spec3d.ts` (terrains 3D, structures 3D,
 * cartes-ressources), les registres du moteur `@game/rules` (terrains,
 * unités, bâtiments, ressources, artefacts — noms des sprites 2D) et le
 * nommage de `generate.py`/`sync-art` (`public/art/<stem>.png`).
 *
 * L'atelier EXPOSE les assets, il ne les définit pas : tout nouvel asset doit
 * d'abord exister dans sa source (cf. ATELIER-ASSETS.md § État du répertoire).
 */
import {
  TERRAINS3D,
  STRUCTURES3D,
  MODELES_UNITES3D,
} from '../render3d/spec3d.js';
import {
  TERRAINS,
  UNIT_TYPES,
  BUILDINGS,
  RESOURCES,
  ARTEFACTS,
  RESOURCE_UNKNOWN,
} from '@game/rules';

/** Catégories de l'atelier (ordre de la barre). */
export const CATEGORIES = ['terrains3d', 'structures3d', 'cartes', 'sprites', 'dirigeants', 'overlays'] as const;
export type CategorieAtelier = (typeof CATEGORIES)[number];

export const NOM_CATEGORIE: Record<CategorieAtelier, string> = {
  terrains3d: 'Terrains 3D',
  structures3d: 'Structures 3D',
  cartes: 'Cartes-ressources',
  sprites: 'Sprites 2D',
  dirigeants: 'Dirigeants',
  overlays: 'Overlays',
};

/** Comment l'asset s'affiche en vue d'isolement. */
export type SorteAsset =
  | 'terrain3d'   // tuile 3D seule (TerrainWorld)
  | 'structure3d' // structure 3D posée sur une tuile prairie (StructuresWorld)
  | 'carte3d'     // carte-ressource sur son slot (tuile prairie + ressource)
  | 'sprite'      // PNG 2D (base + accent teinté par joueur)
  | 'overlay';    // effet programmatique (aucun fichier) — fiche seule

export interface AssetAtelier {
  /** Identifiant EXACT (copiable — c'est ce qu'Erik dicte en session). */
  id: string;
  categorie: CategorieAtelier;
  /** Nom FR courant. */
  nom: string;
  /** Source de vérité (entrée JSON / fonction générateur). */
  source: string;
  sorte: SorteAsset;
  /** Sprites : stem du PNG (`public/art/<stem>.png`, `#` = suffixe `_accent`). */
  sprite?: string;
}

const SRC_JSON = (chemin: string): string => `visuel3d.json §${chemin}`;
const SRC_MOTEUR = (fichier: string): string => `packages/rules/src/data/${fichier}`;
const SRC_GENERATEUR = (nom: string): string => `assets-src/tools/generate.py (${nom})`;

function spriteAsset(id: string, nom: string, source: string, accent: boolean): AssetAtelier {
  return { id, categorie: 'sprites', nom, source, sorte: 'sprite', sprite: accent ? `${id}#` : id };
}

// --- Terrains 3D (miroir exact de visuel3d.json §terrains) ------------------
function terrains3d(): AssetAtelier[] {
  return Object.entries(TERRAINS3D).map(([id, spec]) => ({
    id,
    categorie: 'terrains3d' as const,
    nom: spec.nom,
    source: `${SRC_JSON(`terrains.${id}`)} (miroir moteur : ${SRC_MOTEUR('terrain.json')})`,
    sorte: 'terrain3d' as const,
  }));
}

// --- Structures 3D (visuel3d.json §structures, hors cartes) ------------------
function structures3d(): AssetAtelier[] {
  const s = STRUCTURES3D;
  return [
    {
      id: 'structures:slot',
      categorie: 'structures3d',
      nom: 'Slot de carte-ressource (standard)',
      source: SRC_JSON('structures.slot'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:carteNeutre',
      categorie: 'structures3d',
      nom: `Carte neutre « inconnue » (marqueur ${RESOURCE_UNKNOWN}, R-92)`,
      source: SRC_JSON('structures.carteNeutre'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframe',
      categorie: 'structures3d',
      nom: 'Mainframe des villes (socle, corps, paliers, antenne, modules, merveille)',
      source: SRC_JSON('structures.mainframe'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:cratere',
      categorie: 'structures3d',
      nom: 'Cratère (déclinaison stérile 7m C15)',
      source: `${SRC_JSON('structures.cratere')} + terrain « cratere »`,
      sorte: 'terrain3d',
    },
    {
      id: 'structures:hutte',
      categorie: 'structures3d',
      nom: 'Hutte bonus barbare',
      source: SRC_JSON('structures.hutte'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:village',
      categorie: 'structures3d',
      nom: 'Village barbare (tente/camp + mur)',
      source: SRC_JSON('structures.village'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:uniteGuerrier',
      categorie: 'structures3d',
      nom: 'Unité 3D — Script de Base (Guerrier humanoïde cyber)',
      source: SRC_JSON('structures.uniteGuerrier'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:uniteArcher',
      categorie: 'structures3d',
      nom: 'Unité 3D — Sentinelle Réseau (Archer cyber, lasso électrique)',
      source: SRC_JSON('structures.uniteArcher'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframePalier',
      categorie: 'structures3d',
      nom: `Paliers du Mainframe (pop max ${s.mainframe.paliers.map((p) => p.popMax).join(' / ')})`,
      source: SRC_JSON('structures.mainframe.paliers'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframeCapitale',
      categorie: 'structures3d',
      nom: 'Capitale (couronne, antenne longue, accent large)',
      source: SRC_JSON('structures.mainframe.capitale'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframeMerveille',
      categorie: 'structures3d',
      nom: 'Module doré des merveilles',
      source: SRC_JSON('structures.mainframe.merveille'),
      sorte: 'structure3d',
    },
  ];
}

// --- Unités 3D à modèle .glb (fonderie T3 : visuel3d.json §structures.unites3d
//     entrées { glb, echelle } — un type par fichier de assets-src/modeles/) ---
function unitesGlb(): AssetAtelier[] {
  return Object.entries(MODELES_UNITES3D)
    .filter(([, e]) => e.kind === 'glb')
    .map(([type, e]) => {
      if (e.kind !== 'glb') throw new Error('catalogue : entrée .glb inattendue');
      return {
      id: `uniteglb:${e.glb}`,
      categorie: 'structures3d' as const,
      nom: `Unité 3D .glb — ${UNIT_TYPES[type]?.name ?? type}`,
      source: `${SRC_JSON(`structures.unites3d.${type}`)} (fonderie : assets-src/modeles/${e.glb})`,
      sorte: 'structure3d' as const,
      };
    });
}

// --- Cartes-ressources (visuel3d.json §structures.cartes × resources.json) --
function cartesRessources(): AssetAtelier[] {
  return Object.keys(RESOURCES).map((id) => ({
    id: `carte:${id}`,
    categorie: 'cartes' as const,
    nom: `Carte ${RESOURCES[id]!.name}`,
    source: `${SRC_JSON(`structures.cartes.${id}`)} (ressource : ${SRC_MOTEUR('resources.json')})`,
    sorte: 'carte3d' as const,
  }));
}

// --- Sprites 2D (registre generate.py — noms consommés par textures.ts) -----
/** Icônes de rendement/jeton : liste fixe du peintre (aucun registre moteur). */
const ICONES = [
  'or', 'commerce', 'science', 'nourriture', 'production',
  'pv', 'pm', 'fin_tour', 'reseau', 'culture', 'gouvernement',
] as const;

function sprites2d(): AssetAtelier[] {
  const out: AssetAtelier[] = [];
  // Sprites IMPORTÉS (SVG Recraft d'Erik, pipeline import_svg.mjs) — le PNG
  // écrase celui du painter dans exports/ ; fiche A/B du painter conservée.
  const IMPORTES = new Set(['unite_guerrier']);
  // Tuiles IMPORTÉES (SVG d'Erik 22/09, import_svg.mjs mode tuile) — A/B
  // painter conservé (fichiers tile_<n>_avant.png) ; eau (rivage) et océan
  // ajoutées le soir. Ne reste au painter que tile_ville_sol.
  const TUILES_IMPORTES = new Set(['prairie', 'plaine', 'colline', 'montagne', 'desert', 'foret', 'eau', 'ocean']);
  for (const id of Object.keys(TERRAINS)) {
    const stem = id === 'ville' ? 'tile_ville_sol' : `tile_${id}`;
    const mention = TUILES_IMPORTES.has(id) ? ' — IMPORT SVG (Erik, import_svg.mjs mode tuile)' : '';
    out.push(spriteAsset(stem, `Tuile ${id}`, `${SRC_GENERATEUR('render_tile')} — consommé par textures.ts (tiles)${mention}` , false));
  }
  for (const [id, u] of Object.entries(UNIT_TYPES)) {
    const mention = IMPORTES.has(`unite_${id}`)
      ? (id === 'guerrier' ? ' — IMPORT SVG 4 tons (Erik 23/09, import_svg.mjs guerrier-ref/guerrier-4tons)' : ' — IMPORT SVG (Recraft, import_svg.mjs)')
      : '';
    out.push(spriteAsset(`unite_${id}`, `Unité ${u.name}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (units)${mention}`, true));
  }
  // A/B : les anciennes tuiles peintres, conservées pour le verdict d'Erik
  // (fichiers tile_<n>_avant.png, issus du dernier generate.py painter).
  for (const id of TUILES_IMPORTES) {
    out.push(spriteAsset(`tile_${id}_avant`, `Tuile ${id} (peintre, AVANT import — comparaison A/B)`, `${SRC_GENERATEUR('render_tile')} (référence A/B de l'import SVG) — textures.ts (tiles)`, false));
  }
  // A/B : l'ancien sprite peintre du guerrier, conservé pour le verdict
  // d'Erik (fichiers unite_guerrier_avant*.png, issus du dernier generate.py).
  out.push(spriteAsset('unite_guerrier_avant', 'Guerrier (peintre, AVANT import — comparaison A/B)', `${SRC_GENERATEUR('unite_guerrier')} (référence A/B de l'import SVG) — textures.ts (units)`, true));
  // Variantes CUITES ×6 par unité — ASSETS-6COULEURS (décision Erik 26/09) :
  // un SVG PEINT par faction (plus de recoloriage pipeline) — import_svg.mjs
  // profils guerrier-6couleurs / archer-6couleurs (mode variantesFournies).
  // Violet Améthyste et Cyan Céleste sortent de la table active (D1).
  const VARIANTES_CUITES = [
    ['j1', 'Joueur 1 (bleu saphir)'],
    ['j2', 'Joueur 2 (rouge royal)'],
    ['j3', 'Joueur 3 (vert émeraude)'],
    ['j4', 'Joueur 4 (jaune d\'or)'],
    ['j5', 'Joueur 5 (cuivre ardent)'],
    ['j6', 'Joueur 6 (ardoise)'],
  ] as const;
  for (const [type, label] of [['unite_guerrier', 'Guerrier'], ['unite_archer', 'Archer']] as const) {
    for (const [suffixe, nom] of VARIANTES_CUITES) {
      out.push(spriteAsset(`${type}_${suffixe}`, `${label} — variante fournie ${nom} (SVG peint par Erik, 6 couleurs)`, `assets-src/tools/import_svg.mjs (profil ${type === 'unite_guerrier' ? 'guerrier' : 'archer'}-6couleurs, variantesFournies) — SVG d'Erik peints par IA sous sa direction`, false));
    }
  }
  // COLON-FONDATION : état « en train de fonder » du Colon (art d'Erik en
  // attente — PNG optionnel, badge provisoire au rendu tant qu'il manque).
  out.push(spriteAsset('unite_colonFondation', 'Colon « en train de fonder » (état, R-158)', `${SRC_GENERATEUR('render_entity')} — textures.ts (colonFondation)`, true));
  out.push(spriteAsset('ville_settlement', 'Ville (settlement)', `${SRC_GENERATEUR('render_entity')} — textures.ts (cities.settlement)`, true));
  out.push(spriteAsset('ville_capitale', 'Ville (capitale)', `${SRC_GENERATEUR('render_entity')} — textures.ts (cities.capital)`, true));
  // rouge CUIT dans la base (décision Erik 12/09) — aucune variante d'accent
  out.push(spriteAsset('village_barbare', 'Village barbare (sprite 2D)', `${SRC_GENERATEUR('render_entity')} (rouge cuit) — textures.ts (villageBarbare)`, false));
  out.push(spriteAsset('unite_barbare_guerrier', 'Guerrier barbare (sprite 2D)', `${SRC_GENERATEUR('render_entity')} (rouge cuit) — textures.ts (units, barbare_guerrier)`, false));
  out.push(spriteAsset('unite_barbare_archer', 'Archer barbare (sprite 2D)', `${SRC_GENERATEUR('render_entity')} (rouge cuit) — textures.ts (units, barbare_archer)`, false));
  out.push(spriteAsset('hutte', 'Hutte bonus (sprite 2D)', `${SRC_GENERATEUR('render_entity')} — textures.ts (hutte)`, true));
  for (const id of Object.keys(BUILDINGS)) {
    out.push(spriteAsset(`batiment_${id}`, `Bâtiment ${BUILDINGS[id]!.name}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (hutte/unites : modules ville 2D)`, true));
  }
  for (const id of Object.keys(ARTEFACTS.pool).filter((k) => !ARTEFACTS.pool[k]!.dlcOnly).sort()) {
    out.push(spriteAsset(`artefact_${id}`, `Artefact ${id}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (artefacts, ARTEFACT_IDS)`, true));
  }
  for (const id of Object.keys(RESOURCES)) {
    out.push(spriteAsset(`res_${id}`, `Ressource ${RESOURCES[id]!.name} (jeton 2D)`, `${SRC_GENERATEUR('render_entity')} — textures.ts (resources, R-91)`, false));
  }
  out.push(spriteAsset('res_inconnue', `Ressource inconnue (marqueur ${RESOURCE_UNKNOWN}, R-92)`, `${SRC_GENERATEUR('render_entity')} — textures.ts (resources)`, false));
  for (const icone of ICONES) {
    out.push(spriteAsset(`icone_${icone}`, `Icône ${icone}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (yieldIcons/overlays)`, false));
  }
  return out;
}

// --- Dirigeants (ATELIER-DIRIGEANTS : portraits grand format, SANS accent) ---
function dirigeants(): AssetAtelier[] {
  return [
    {
      id: 'dirigeant_napoleon',
      categorie: 'dirigeants',
      nom: 'Napoléon Bonaparte (France) — portrait 256×256, main dans la chemise',
      source: `${SRC_GENERATEUR('dirigeant_napoleon')} (rendu sans calque accent)`,
      sorte: 'sprite',
      sprite: 'dirigeant_napoleon',
    },
    {
      id: 'dirigeant_alexandre',
      categorie: 'dirigeants',
      nom: 'Alexandre le Grand (Grèce) — portrait 256×256, diadème et cuirasse au soleil de Vergine',
      source: `${SRC_GENERATEUR('dirigeant_alexandre')} (rendu sans calque accent)`,
      sorte: 'sprite',
      sprite: 'dirigeant_alexandre',
    },
    {
      id: 'dirigeant_cleopatre',
      categorie: 'dirigeants',
      nom: 'Cléopâtre (Égypte) — portrait 256×256, diadème au uraeus et collier usekh',
      source: `${SRC_GENERATEUR('dirigeant_cleopatre')} (rendu sans calque accent)`,
      sorte: 'sprite',
      sprite: 'dirigeant_cleopatre',
    },
  ];
}

// --- Overlays (effets PROGRAMMATIQUES — aucun fichier, fiche seule) ---------
function overlays(): AssetAtelier[] {
  return [
    { id: 'overlay:selection', categorie: 'overlays', nom: 'Anneau de sélection', source: 'code — render/ (calque PixiJS, v1 programmatique)', sorte: 'overlay' },
    { id: 'overlay:chemin', categorie: 'overlays', nom: 'Flèches de chemin (brouillon d’ordre)', source: 'code — render/interaction.ts + hexView', sorte: 'overlay' },
    { id: 'overlay:workedTile', categorie: 'overlays', nom: 'Marqueur de case travaillée', source: 'code — GameCanvas (workedTiles)', sorte: 'overlay' },
    { id: 'overlay:ping', categorie: 'overlays', nom: 'Ping d’artefact (R-155)', source: 'code — GameCanvas (artifactPings)', sorte: 'overlay' },
    { id: 'overlay:lueurRendement', categorie: 'overlays', nom: 'Lueur « actif allumé » des glyphes (rendement réel)', source: 'code — render3d/rendement.ts + world3d', sorte: 'overlay' },
    { id: 'overlay:brouillard', categorie: 'overlays', nom: 'Brouillard de guerre 3 états (R-70)', source: 'code — world3d (FOG_DIM)', sorte: 'overlay' },
  ];
}

/** Index complet, ordonné par catégorie puis id (ordre stable, testé). */
export function construireCatalogue(): AssetAtelier[] {
  return [
    ...terrains3d(),
    ...structures3d(),
    ...unitesGlb(),
    ...cartesRessources(),
    ...sprites2d(),
    ...dirigeants(),
    ...overlays(),
  ];
}

export const CATALOGUE: AssetAtelier[] = construireCatalogue();

/** Stems PNG attendus dans `public/art` pour un asset sprite (base + accent). */
export function stemsDe(asset: AssetAtelier): { base: string; accent: string | null } {
  if (!asset.sprite) return { base: '', accent: null };
  const accent = asset.sprite.endsWith('#');
  const stem = accent ? asset.sprite.slice(0, -1) : asset.sprite;
  return { base: stem, accent: accent ? `${stem}_accent` : null };
}

/** Filtre de la grille (barre de catégories + recherche insensible à la casse
 *  sur id exact et nom FR) — pur, testé sans DOM. */
export function filtrerCatalogue(
  catalogue: AssetAtelier[],
  categorie: CategorieAtelier | 'toutes',
  recherche: string,
): AssetAtelier[] {
  const q = recherche.trim().toLowerCase();
  return catalogue.filter(
    (a) =>
      (categorie === 'toutes' || a.categorie === categorie) &&
      (q === '' || a.id.toLowerCase().includes(q) || a.nom.toLowerCase().includes(q)),
  );
}
