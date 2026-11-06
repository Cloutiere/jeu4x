/**
 * FLUIDITE-SELECTION (Erik 05/11, tranche 1 · D-A/D-B/D-C) — la machine à
 * états EXPLICITE de l'interaction de sélection (document d'Erik « Architecture
 * des Contrôles et Programmation de l'Interaction dans les Jeux 4X », §2-3).
 *
 * C'est un REFACTOR : l'UiState actuel (`ui.ts`) porte déjà les drapeaux
 * (`nukeArmed`, `armyDraft`, `draft`, `selectedUnitId`) — ce module les
 * RÉ-ATTACHE à des états nommés et documentés SANS changer un seul
 * comportement observable (non-régression verrouillée par interaction.test.ts
 * et les tests existants, qui restent verts). Les transitions nommées
 * documentent les gestes légaux ; les guards `clickAction` lisent désormais
 * l'état dérivé au lieu des drapeaux bruts.
 *
 * Le §4 tactile (tranche 2, backlog Steam) et le Command Pattern/Undo sont
 * HORS périmètre.
 */
import type { UnitId } from '@game/shared';
import type { GameView } from '../gameClient.js';
import type { UiState } from './ui.js';

/** Les cinq états documentés du document d'Erik (§3 FSM de sélection). */
export const ETATS_INTERACTION = [
  'inactif',
  'uniteSelectionnee',
  'previsualisation',
  'formationArmee',
  'nukeArmed',
] as const;

export type EtatInteraction = (typeof ETATS_INTERACTION)[number];

/**
 * Lecture PURE de l'état courant d'après l'UiState — miroir EXACT de l'ordre
 * des guards historiques de `clickAction` (nukeArmed écrase tout, puis
 * armyDraft, puis le brouillon de chemin, puis l'unité sélectionnée) :
 * - `nukeArmed` : tout clic carte devient une sélection de cible (R-139) ;
 * - `formationArmee` : le geste d'armée est armé — clics réservés aux
 *   candidats et au rendez-vous (GESTE-ARMEE) ;
 * - `previsualisation` : un chemin est en construction (clic droit maintenu) ;
 * - `uniteSelectionnee` : une unité amie/ennemie visible est pilotée (ou lue) ;
 * - `inactif` : rien de piloté. Une VILLE sélectionnée ne pilote aucune
 *   unité — l'état reste `inactif` (le document d'Erik ne décrit pas d'état
 *   ville ; consigné, comportement inchangé).
 */
export function etatInteraction(ui: UiState): EtatInteraction {
  if (ui.nukeArmed) return 'nukeArmed';
  if (ui.armyDraft) return 'formationArmee';
  if (ui.draft) return 'previsualisation';
  if (ui.selectedUnitId) return 'uniteSelectionnee';
  return 'inactif';
}

/**
 * Transitions nommées (table du document d'Erik) : les gestes légaux.
 * Tout état se VIDE vers `inactif` (désélection, Échap) ; depuis `inactif`
 * et `uniteSelectionnee`, chaque mode peut s'armer. Les sauts entre modes
 * distincts sans repasser par la sélection (prévisualisation → nukeArmed,
 * nukeArmed → formationArmee…) ne sont pas des gestes du jeu : refusés.
 */
const TRANSITIONS: Readonly<Record<EtatInteraction, readonly EtatInteraction[]>> = {
  inactif: ['inactif', 'uniteSelectionnee', 'previsualisation', 'formationArmee', 'nukeArmed'],
  uniteSelectionnee: ['inactif', 'uniteSelectionnee', 'previsualisation', 'formationArmee', 'nukeArmed'],
  previsualisation: ['inactif', 'previsualisation', 'uniteSelectionnee'],
  formationArmee: ['inactif', 'formationArmee', 'uniteSelectionnee'],
  nukeArmed: ['inactif', 'nukeArmed', 'uniteSelectionnee'],
};

export function transitionValide(de: EtatInteraction, vers: EtatInteraction): boolean {
  return TRANSITIONS[de].includes(vers);
}

/** FLUIDITE-SELECTION — calibrages data-driven (au labo à l'œil Erik). */
export const SEUILS_FLUIDITE = {
  /** Durée du glissement de caméra lors d'un cyclage (ms). */
  cameraLerpMs: 400,
} as const;

export interface OptionsCyclage {
  /** true = cyclage manuel (touche N — rebouclage) ; false = auto (fin de
   *  file = null, retour à l'état inactif — pas de rebouclage vertigineux). */
  boucler: boolean;
}

/**
 * D-B/D-C — les unités du joueur local DISPONIBLES pour le cyclage : PM
 * restantes, sans AUCUN ordre (ni brouillon soumis, ni chemin gelé, ni
 * fortification R-33 — miroir exact de `unitsWithoutOrders`), pas à bord
 * (une cargaison n'a pas d'ordre à donner). Ordre STABLE par id.
 * Pur, testé.
 */
export function unitesDisponibles(view: GameView): UnitId[] {
  const state = view.state;
  const mine = view.players.find((p) => p.id === view.playerId)?.engineId ?? null;
  if (!state || !mine) return [];
  return Object.keys(state.units)
    .sort()
    .filter((id) => {
      const u = state.units[id]!;
      if (u.owner !== mine) return false;
      if (u.aboard) return false;
      if (u.order) return false;
      if (u.fortified) return false;
      if (u.mp <= 0) return false; // PM épuisées : rien à ordonner ce tour
      return !view.orders.some((o) => 'unitId' in o && o.unitId === id);
    });
}

/**
 * D-B/D-C — la PROCHAINE unité à cycler après `courante` (id, ou null = la
 * première disponible). Ordre stable par id ; `boucler` (manuel N) reboucle,
 * sinon fin de file = null (l'appelant retourne à l'état inactif).
 */
export function prochaineUniteDisponible(view: GameView, courante: UnitId | null, opts: OptionsCyclage): UnitId | null {
  const ids = unitesDisponibles(view);
  if (ids.length === 0) return null;
  if (!courante) return ids[0]!;
  const idx = ids.indexOf(courante);
  if (idx === -1) {
    // La courante n'est pas candidate (déjà ordonnée/passive) : la suivante
    // est la première candidate D'ID SUPÉRIEUR, sinon fin de file.
    return ids.find((id) => id > courante) ?? null;
  }
  const reste = ids.slice(idx + 1);
  if (reste.length > 0) return reste[0]!;
  return opts.boucler ? ids[0]! : null;
}

/**
 * D-B — easing du glissement de caméra (easeInOutCubic) : démarre doux,
 * arrive doux — la sensation AAA du document d'Erik (§2 Auto-Unit Cycling
 * avec Camera Lerp). Pur, testé.
 */
export function easingGlissement(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
