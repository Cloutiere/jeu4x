/**
 * LOBBY-5 — ConfigPartie : la configuration structurée d'une partie à 5 sièges
 * (demande d'Erik du 24/09, HANDOFF-LOBBY-5.md §1-2).
 *
 * Portée : META lobby/GameDO uniquement — AUCUN champ GameState (D8 : zéro
 * migration moteur). Elle traverse `GameCreationSettings.config` (champ
 * ADDITIF : les parties créées avant la mission n'en portent pas et suivent
 * le flux historique — testé). La source des palettes est l'unique
 * `apps/web/src/lib/render/accents.json` (§factions4, D2) — importé ici pour
 * que le serveur valide sans duplication ; la topographie est la liste
 * data-driven `TOPOGRAPHIES` de @game/rules (D4 : l'existant, rien de neuf).
 */
import { CIVILIZATIONS } from '@game/rules';
import { TOPOGRAPHIES } from '@game/rules';
import accentsBrut from '../../../apps/web/src/lib/render/accents.json';

/** Les 7 palettes 4 tons (clés de `factions4`) — l'ordre suit le JSON. */
export const CLES_PALETTES4: string[] = Object.keys(accentsBrut.factions4);

/** Ordre officiel des palettes pour les joueurs (J1..J7 — `ordre_joueurs4`). */
export const ORDRE_PALETTES4: string[] = accentsBrut.ordre_joueurs4;

export const nomPalette4 = (id: string): string =>
  (accentsBrut.factions4 as Record<string, { nom: string } | undefined>)[id]?.nom ?? id;

/** Table complète (nom + 4 tons) pour les nuanciers de l'UI. */
export const PALETTES4 = accentsBrut.factions4;

/** Nombre de sièges d'une partie nouvelle forme — réglable ici (un seul
 *  endroit ; D1 : UNE SEULE voie de création, 5 sièges par défaut). */
export const SIEGES_PAR_PARTIE = 5;

/** Un siège de la config : humain ou bot, sa palette d'accent (D2), sa civ
 *  (mode manuel uniquement — ignorée et remplacée par le tirage seedé si
 *  `civsAleatoires`, D3). */
export interface SiegeConfig {
  type: 'humain' | 'bot';
  paletteId: string;
  /** Absent/null = à choisir (humains à la jointure, créateur pour les bots). */
  civId?: string | null;
}

export interface ConfigPartie {
  sieges: SiegeConfig[];
  /** Toggle global du créateur (D3) : tirage seedé de 16 civs distinctes. */
  civsAleatoires: boolean;
  /** Topographie du créateur (D4) : un id de `TOPOGRAPHIES` (progen). */
  topographie: string;
}

/**
 * Validateur dédié (L1) — AVANT les handlers : toute forme invalide est
 * refusée avec un message clair et actionnable. Retourne null si valide.
 */
export function configPartieErreur(config: unknown): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return 'config de partie invalide (objet attendu)';
  }
  const c = config as Partial<ConfigPartie>;
  if (!Array.isArray(c.sieges)) return 'config de partie invalide (sieges attendus)';
  if (c.sieges.length !== SIEGES_PAR_PARTIE) {
    return `une partie porte exactement ${SIEGES_PAR_PARTIE} sièges (reçu : ${c.sieges.length})`;
  }
  if (typeof c.civsAleatoires !== 'boolean') return 'civsAleatoires doit être un booléen';
  if (typeof c.topographie !== 'string' || !TOPOGRAPHIES.some((t) => t.id === c.topographie)) {
    return `topographie inconnue (${String(c.topographie)}) — choisir : ${TOPOGRAPHIES.map((t) => t.id).join(', ')}`;
  }
  const vuesPalettes = new Set<string>();
  const vuesCivs = new Set<string>();
  let humains = 0;
  for (let i = 0; i < c.sieges.length; i++) {
    const s = c.sieges[i]!;
    if (!s || typeof s !== 'object' || (s.type !== 'humain' && s.type !== 'bot')) {
      return `siège ${i + 1} : type invalide (humain ou bot)`;
    }
    if (s.type === 'humain') humains++;
    if (typeof s.paletteId !== 'string' || !CLES_PALETTES4.includes(s.paletteId)) {
      return `siège ${i + 1} : couleur inconnue (${String(s.paletteId)})`;
    }
    if (vuesPalettes.has(s.paletteId)) {
      return `siège ${i + 1} : couleur déjà prise (deux joueurs ne peuvent pas partager la même)`;
    }
    vuesPalettes.add(s.paletteId);
    if (c.civsAleatoires !== true && s.civId) {
      if (typeof s.civId !== 'string' || !CIVILIZATIONS.civs[s.civId]) {
        return `siège ${i + 1} : civilisation inconnue (${String(s.civId)})`;
      }
      if (vuesCivs.has(s.civId)) {
        return `siège ${i + 1} : civilisation déjà prise par un autre siège`;
      }
      vuesCivs.add(s.civId);
    }
  }
  if (humains < 1) return 'au moins un siège doit être occupé par un humain';
  return null;
}

/** Première palette non prise — priorité à l'ordre officiel des joueurs
 *  (`ordre_joueurs4`), puis les autres. Null si tout est pris (impossible à
 *  5 sièges sur 7 palettes). */
export function premierePaletteLibre(prises: Iterable<string>): string | null {
  const vues = prises instanceof Set ? prises : new Set(prises);
  for (const p of [...ORDRE_PALETTES4, ...CLES_PALETTES4]) {
    if (!vues.has(p)) return p;
  }
  return null;
}

/**
 * LOBBY-5 (retour Erik du 25/09) — règle des couleurs HUMAIN vs BOT :
 * un humain peut toujours prendre la couleur d'un bot (jamais celle d'un
 * autre humain) ; le bot dépossédé (ou tout bot en doublon) se choisit
 * AUTOMATIQUEMENT la première palette libre. Les humains gardent leur choix
 * (priorité dans l'ordre des sièges) ; les bots se partagent le reste.
 * Pure — utilisée par l'éditeur de config (client) ET par le StartGame
 * (serveur, quand un humain a joint avec la palette configurée d'un bot).
 */
export function resoutConflitsPalettes(config: ConfigPartie): ConfigPartie {
  const copie: ConfigPartie = { ...config, sieges: config.sieges.map((s) => ({ ...s })) };
  const vues = new Set<string>();
  for (const s of copie.sieges) {
    if (s.type === 'humain') vues.add(s.paletteId);
  }
  for (const s of copie.sieges) {
    if (s.type !== 'bot') continue;
    if (vues.has(s.paletteId)) {
      const libre = premierePaletteLibre(vues);
      if (libre === null) break; // 7 palettes pour 5 sièges : inaccessible
      s.paletteId = libre;
    }
    vues.add(s.paletteId);
  }
  return copie;
}

/** Config par défaut de l'écran de création : siège 1 = l'hôte (humain),
 *  les 4 suivants en bots, palettes dans l'ORDRE OFFICIEL des joueurs
 *  (`ordre_joueurs4` — J1 Bleu Saphir, J2 Rouge Royal, …), topographie par
 *  défaut = archipel (défaut de génération depuis la Phase 6c). */
export function configPartieDefaut(civHebergeur?: string | null): ConfigPartie {
  return {
    sieges: ORDRE_PALETTES4.slice(0, SIEGES_PAR_PARTIE).map((paletteId, i) => ({
      type: i === 0 ? ('humain' as const) : ('bot' as const),
      paletteId,
      ...(i === 0 && civHebergeur ? { civId: civHebergeur } : {}),
    })),
    civsAleatoires: false,
    topographie: 'archipel',
  };
}
