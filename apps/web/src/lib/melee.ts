/**
 * PLACEMENT-MELEE (demande d'Erik du 20/09, décisions D1..D7) — mémoires
 * client du placement en mêlée : côté d'entrée par unité + stabilisée à la
 * création de la mêlée. Zéro changement moteur/serveur (D5) : tout est dérivé
 * des événements `Move` (et pseudos-Move) du tour + de l'état pré-résolution,
 * même prisme que REPLAY-RESOLUTION.
 *
 * Politique de purge (miroir `replayPair`) : remplacé/complété à chaque
 * `TurnResult`, purgé au `Snapshot` (reconnexion → mémoire perdue, repli sur
 * l'ancien remplissage par zones — D1). Jamais d'état du store muté.
 *
 * Les fonctions sont PURES (testées dans melee.test.ts) ; le store et le
 * câblage WS vivent dans gameClient.ts. La géométrie de pose
 * (`dispositionMelee`) vit dans render/interaction.ts.
 */
import { writable } from 'svelte/store';
import { tileKeyOf } from '@game/rules';
import type { Hex, ProgramPreview } from '@game/rules';
import type { GameEvent, GameState, ServerToClientMessage, UnitId } from '@game/shared';

/** Les 6 côtés d'un hexagone pointy-top, nommés par direction d'entrée. */
export type Cote = 'O' | 'E' | 'NO' | 'NE' | 'SO' | 'SE';

/** Table direction axiale (from → to, voisins) → côté d'ENTRÉE (pointy-top) :
 *  le côté visé est celui FACE au voisin `from` — entrer depuis l'ouest
 *  (delta de déplacement +1,0 = vers l'est) pose sur le côté OUEST. */
const COTE_PAR_DELTA: Record<string, Cote> = {
  '1,0': 'O',
  '-1,0': 'E',
  '1,-1': 'SO',
  '0,-1': 'SE',
  '0,1': 'NO',
  '-1,1': 'NE',
};

/** Côté d'entrée géométrique d'un mouvement `from → to` (voisins axiaux). */
export function coteDepuisMouvement(from: { q: number; r: number }, to: { q: number; r: number }): Cote | null {
  return COTE_PAR_DELTA[`${to.q - from.q},${to.r - from.r}`] ?? null;
}

/** Mémoire du côté d'entrée d'une unité (D1 : dernier côté connu, persistant). */
export interface EntreeUnite {
  cote: Cote;
  /** Seq de l'événement d'entrée — ordre d'arrivée intra-section (D2). */
  ordre: number;
}

/** Contexte de mêlée consommé par `dispositionMelee` (render/interaction.ts). */
export interface ContexteMelee {
  coteParUnite: Map<UnitId, EntreeUnite>;
  /** Case (tileKey) → unité stabilisée à la CRÉATION de la mêlée (centre). */
  stabiliseeParCase: Map<string, UnitId>;
}

export const contexteMeleeVide: ContexteMelee = { coteParUnite: new Map(), stabiliseeParCase: new Map() };

/** Store client (L2) : alimenté au fil des messages WS, purgé au Snapshot. */
export const contexteMelee = writable<ContexteMelee>(contexteMeleeVide);

/** Événements porteurs d'une entrée de case (from → to). */
function estMouvement(ev: GameEvent): ev is Extract<GameEvent, { type: 'Move' | 'Retreat' | 'UnitExpelled' | 'UnitDispersed' }> {
  return ev.type === 'Move' || ev.type === 'Retreat' || ev.type === 'UnitExpelled' || ev.type === 'UnitDispersed';
}

/** Nations (propriétaires) des unités NON embarquées posées sur une case. */
function nationsSurCase(state: GameState, key: string): Set<string> {
  const nations = new Set<string>();
  for (const u of Object.values(state.units)) {
    if (u.aboard) continue;
    if (tileKeyOf(u) === key) nations.add(u.owner);
  }
  return nations;
}

/**
 * Réducteur PUR du contexte (miroir `reducePaireReplay`) :
 * - `Snapshot` → contexte VIDE (reconnexion : repli zones, D1) ;
 * - `TurnResult` → compléter `coteParUnite` depuis les mouvements du tour
 *   (seq = ordre d'arrivée), purger les unités détruites, puis détecter les
 *   mêlées NOUVELLES : case multi-nations au post-état dont le pré-état ne
 *   comptait QU'UNE unité stabilisée → elle va AU CENTRE. RÉV. 21/09
 *   (décision d'Erik) : l'entrée de centre PERSISTE après la fin de la mêlée
 *   — les survivantes gardent leur place de mêlée (centre compris) tant que
 *   l'unité vit et reste sur la case ; elle sort de la mémoire si elle meurt
 *   (centre vide, D3), s'embarque ou quitte la case.
 */
export function reduceContexteMelee(
  current: ContexteMelee,
  message: ServerToClientMessage,
  preState: GameState | null,
  postState: GameState | null,
): ContexteMelee {
  if (message.type === 'Snapshot') return contexteMeleeVide;
  if (message.type !== 'TurnResult' || !preState || !postState) return current;

  const coteParUnite = new Map(current.coteParUnite);
  const stabiliseeParCase = new Map(current.stabiliseeParCase);

  // 1. Côtés d'entrée : dernier mouvement connu gagne (D1), seq = ordre (D2).
  for (const ev of message.events) {
    if (!estMouvement(ev)) continue;
    const cote = coteDepuisMouvement(ev.from, ev.to);
    if (cote) coteParUnite.set(ev.unitId, { cote, ordre: ev.seq });
  }
  // 2. Purge des mortes (détruites ou capturées-détruites).
  for (const ev of message.events) {
    if (ev.type === 'UnitDestroyed' || (ev.type === 'Captured' && ev.outcome === 'destroyed')) {
      coteParUnite.delete(ev.unitId);
      for (const [key, id] of stabiliseeParCase) if (id === ev.unitId) stabiliseeParCase.delete(key);
    }
  }
  // 3. Place du centre (rév. 21/09, décision d'Erik) : l'entrée PERSISTE
  //    après la fin de la mêlée — les survivantes gardent leur place de
  //    mêlée (centre compris). Elle ne sort de la mémoire que si l'unité
  //    meurt, s'embarque ou quitte la case. Détection des NOUVELLES mêlées
  //    inchangée : case multi-nations au post dont le pré-état ne comptait
  //    qu'une unité stabilisée.
  const enMelee = new Set<string>();
  for (const u of Object.values(postState.units)) {
    if (u.aboard) continue;
    const key = tileKeyOf(u);
    if (nationsSurCase(postState, key).size >= 2) enMelee.add(key);
  }
  for (const key of [...stabiliseeParCase.keys()]) {
    const id = stabiliseeParCase.get(key)!;
    const u = postState.units[id];
    if (!u || u.aboard || tileKeyOf(u) !== key) stabiliseeParCase.delete(key);
  }
  for (const key of enMelee) {
    if (stabiliseeParCase.has(key)) continue;
    const pre = occupantes(preState, key);
    if (pre.length === 1 && pre[0]!.stabilized) stabiliseeParCase.set(key, pre[0]!.id);
  }
  return { coteParUnite, stabiliseeParCase };
}

/** Unités NON embarquées posées sur une case (ordre d'insertion du state). */
function occupantes(state: GameState, key: string): Array<{ id: UnitId; stabilized: boolean }> {
  const out: Array<{ id: UnitId; stabilized: boolean }> = [];
  for (const u of Object.values(state.units)) {
    if (u.aboard) continue;
    if (tileKeyOf(u) === key) out.push({ id: u.id, stabilized: u.stabilized });
  }
  return out;
}

/**
 * RETOUR ERIK 30/09 (session debug visuel) — contexte de PROGRAMMATION :
 * la mêlée réelle n'existe pas encore (la mémoire persistante n'est
 * alimentée qu'à la résolution, `reduceContexteMelee`), mais l'aperçu de
 * programmation affiche déjà la cohabitation à destination. Règle d'Erik :
 * l'unité qui OCCUPAIT DÉJÀ la tuile reste AU CENTRE (cran intermédiaire),
 * chaque unité programmée pour y pénétrer se pose sur l'ARÊTE face à sa
 * tuile de provenance — la même règle qu'après la résolution.
 *
 * Fonction PURE : fusionne le contexte persistant avec une synthèse dérivée
 * des aperçus (`previewPrograms`) — pour chaque destination occupée :
 *  - l'occupante NON partante devient le centre (la stabilisée mémorisée
 *    reste si elle vit, est sur la case et ne part pas) ;
 *  - chaque unité programmée reçoit son côté d'entrée (dernier pas du
 *    chemin → destination, `coteDepuisMouvement`), ordre = chronologie de
 *    programmation (miroir R-159).
 * Consommé par le rendu (GameCanvas) à la place du contexte brut — la
 * mémoire persistante seule ne voit JAMAIS les cohabitations programmées.
 */
export function contexteProgrammation(
  state: GameState,
  previews: ProgramPreview[],
  persistant: ContexteMelee | null,
): ContexteMelee {
  const coteParUnite = new Map(persistant?.coteParUnite ?? []);
  const stabiliseeParCase = new Map(persistant?.stabiliseeParCase ?? []);
  const partantes = new Set<UnitId>();
  interface Arrivee { dest: Hex; cote: Cote; }
  const arrivees = new Map<UnitId, Arrivee>();
  previews.forEach((p) => {
    if (!p.destination) return;
    partantes.add(p.unitId);
    // Côté d'entrée : le dernier pas du chemin (la provenance au sens
    // géométrique) ; chemin d'un pas = la case de départ de l'unité.
    const provenance =
      p.path.length >= 2 ? p.path[p.path.length - 2]! : state.units[p.unitId] ?? p.path[0];
    if (!provenance) return;
    const cote = coteDepuisMouvement(provenance, p.destination);
    if (cote) arrivees.set(p.unitId, { dest: p.destination, cote });
  });
  for (const [unitId, arrivee] of arrivees) {
    const key = tileKeyOf(arrivee.dest);
    const occupantes = Object.values(state.units).filter(
      (u) => !u.aboard && u.id !== unitId && tileKeyOf(u) === key,
    );
    if (occupantes.length === 0) continue; // case vide : pas de cohabitation
    // Centre : la stabilisée mémorisée reste SI elle vit sur la case et ne
    // part pas ; sinon la première occupante non partante (ordre du state),
    // repli première occupante.
    const actuelle = stabiliseeParCase.get(key);
    const actuelleValide = (() => {
      if (!actuelle) return false;
      const u = state.units[actuelle];
      return !!u && !u.aboard && tileKeyOf(u) === key && !partantes.has(actuelle);
    })();
    if (!actuelleValide) {
      const surPlace = occupantes.find((u) => !partantes.has(u.id));
      stabiliseeParCase.set(key, (surPlace ?? occupantes[0]!).id);
    }
    coteParUnite.set(unitId, { cote: arrivee.cote, ordre: arrivees.size });
  }
  return { coteParUnite, stabiliseeParCase };
}
