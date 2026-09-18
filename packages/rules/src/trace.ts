/**
 * HANDOFF-TRACE-RESOLUTION · Collecteur de trace de résolution (instrumentation
 * PASSIVE — zéro gameplay).
 *
 * Un récolteur optionnel passé à `resolveTurn` (4e paramètre, défaut absent =
 * zéro coût) qui observe la résolution sans l'influencer :
 *  - SNAPSHOTS PAR PHASE : entrée ET sortie de chaque phase (A mouvements →
 *    B combats/entrées retenues → C économie → E mêlée/dispersion/stabilité),
 *    pour chaque unité : position, PV, PM, stabilité, fortification,
 *    propriétaire (type inclus pour la lisibilité) ;
 *  - LES DÉCISIONS : chaque choix moteur avec ses ENTRÉES calculées et la
 *    RÈGLE citée (R-xx — codification REPORT-COMBAT-COMPORTEMENTS) ;
 *  - LE COMPTE DE SEED : chaque roll consommé (index, valeur, usage).
 *
 * Sortie : structure JSON déterministe (même résolution + même seed = même
 * trace bit à bit — verrouillé par test). Aucune consultation du RNG ajoutée :
 * les rolls consommés sont RAPPORTÉS, jamais ajoutés.
 */
import type { GameState, PlayerId, Unit, UnitId } from './state.js';

export type TracePhaseId = 'A' | 'B' | 'C' | 'E';

/** Snapshot d'une unité à une frontière de phase. */
export interface TraceUnitSnapshot {
  id: UnitId;
  type: string;
  owner: PlayerId;
  q: number;
  r: number;
  hp: number;
  mp: number;
  /** ENGAGEMENT · R-173 : stabilisée (seule occupante de sa case). */
  stabilized: boolean;
  /** ENGAGEMENT · R-175 : fortifiée (acquise par l'ordre Fortify). */
  fortified: boolean;
}

/** Une décision du moteur : règle citée, résumé humain, valeurs brutes. */
export interface TraceDecision {
  phase: TracePhaseId;
  /** Clé de décision (ex. 'mêlée', 'entrée-retenue', 'dispersion'…). */
  kind: string;
  /** Règle citée (ex. 'R-180', 'R-159 rév. B'). */
  rule: string;
  /** Résumé humain construit au point d'émission (les valeurs y sont connues). */
  ligne: string;
  /** Valeurs brutes (formules) pour l'analyse par IA. */
  detail: Record<string, unknown>;
}

/** Un roll RNG consommé par la résolution (R-80) — rapporté, jamais ajouté. */
export interface TraceRoll {
  index: number;
  valeur: number;
  /** Usage déclaré au moment du tirage (étiquette du site d'appel). */
  usage: string;
}

/** Une phase tracée : snapshots d'entrée/sortie + décisions. */
export interface TracePhase {
  phase: TracePhaseId;
  entree: TraceUnitSnapshot[];
  sortie: TraceUnitSnapshot[];
  decisions: TraceDecision[];
}

/** Trace complète d'une résolution de tour — sérialisable JSON déterministe. */
export interface ResolutionTrace {
  tour: number;
  seed: number;
  phases: TracePhase[];
  /** Tous les rolls consommés, dans l'ordre (compte de seed). */
  rolls: TraceRoll[];
}

/**
 * Récolteur passif. L'objet est rempli PAR le moteur pendant la résolution ;
 * après `resolveTurn`, lire `collector.trace` (ou `toJSON()`).
 */
export class TraceCollector {
  readonly trace: ResolutionTrace;
  private phaseCourante: TracePhase | null = null;

  constructor(state: GameState) {
    this.trace = { tour: state.turn, seed: state.rngSeed, phases: [], rolls: [] };
  }

  /** Les phases A et C sont traitées en une passe dans resolveTurn : début de
   *  phase = snapshot d'entrée, fin = snapshot de sortie. */
  phaseIn(phase: TracePhaseId, st: GameState): void {
    this.phaseCourante = { phase, entree: snapshotUnits(st), sortie: [], decisions: [] };
    this.trace.phases.push(this.phaseCourante);
  }

  phaseOut(phase: TracePhaseId, st: GameState): void {
    const p = this.phaseCourante;
    if (!p || p.phase !== phase) return;
    p.sortie = snapshotUnits(st);
    this.phaseCourante = null;
  }

  decide(phase: TracePhaseId, kind: string, rule: string, ligne: string, detail: Record<string, unknown> = {}): void {
    const p = this.phaseCourante;
    const cible = p && p.phase === phase ? p : this.dernierePhase(phase);
    if (!cible) return;
    cible.decisions.push({ phase, kind, rule, ligne, detail });
  }

  /** Index du prochain roll (pour rattacher un tirage à ses rolls). */
  marque(): number {
    return this.trace.rolls.length;
  }

  /** Rapporte un roll consommé (appelé par le RNG tracé du moteur). */
  roll(valeur: number, usage: string): void {
    this.trace.rolls.push({ index: this.trace.rolls.length, valeur, usage });
  }

  private dernierePhase(phase: TracePhaseId): TracePhase | null {
    for (let i = this.trace.phases.length - 1; i >= 0; i--) {
      const p = this.trace.phases[i]!;
      if (p.phase === phase) return p;
    }
    return null;
  }
}

/** Crée un récolteur pour la résolution de `state` (4e paramètre de resolveTurn). */
export function createTraceCollector(state: GameState): TraceCollector {
  return new TraceCollector(state);
}

function snapshotUnits(st: GameState): TraceUnitSnapshot[] {
  const out: TraceUnitSnapshot[] = [];
  for (const id of Object.keys(st.units).sort()) {
    const u: Unit = st.units[id]!;
    out.push({
      id: u.id,
      type: u.type,
      owner: u.owner,
      q: u.q,
      r: u.r,
      hp: u.hp,
      mp: u.mp,
      stabilized: u.stabilized,
      fortified: u.fortified,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Journal lisible (M2) — la trace rendue en texte humain, groupé par phase.
// ---------------------------------------------------------------------------

const NOM_PHASES: Record<TracePhaseId, string> = {
  A: 'Phase A — Mouvements',
  B: 'Phase B — Combats & entrées retenues',
  C: 'Phase C — Économie',
  E: 'Phase E — Mêlée, dispersion & stabilité',
};

function ligneSnapshot(u: TraceUnitSnapshot): string {
  const etat = [u.stabilized ? 'stabilisée' : 'instable', u.fortified ? 'fortifiée' : null]
    .filter(Boolean)
    .join(', ');
  return `  • ${u.id} (${u.type}, ${u.owner}) (${u.q},${u.r}) PV ${u.hp} PM ${u.mp}${etat ? ` — ${etat}` : ''}`;
}

/**
 * Rend la trace en lignes de texte humain groupées par phase — pour le
 * journal enrichi du labo (M2.1 du handoff).
 */
export function formaterTrace(trace: ResolutionTrace): string[] {
  const lignes: string[] = [`Tour ${trace.tour + 1} — seed ${trace.seed} — trace de résolution`];
  for (const p of trace.phases) {
    lignes.push(`— ${NOM_PHASES[p.phase]} —`);
    lignes.push(`Entrée : ${p.entree.length} unité(s)`);
    for (const u of p.entree) lignes.push(ligneSnapshot(u));
    for (const d of p.decisions) lignes.push(`  ▸ [${d.rule}] ${d.ligne}`);
    lignes.push(`Sortie : ${p.sortie.length} unité(s)`);
    for (const u of p.sortie) lignes.push(ligneSnapshot(u));
  }
  if (trace.rolls.length > 0) {
    lignes.push(`— Rolls consommés (${trace.rolls.length}) —`);
    for (const r of trace.rolls) {
      lignes.push(`  #${r.index} = ${r.valeur.toFixed(6)} — ${r.usage}`);
    }
  }
  return lignes;
}
