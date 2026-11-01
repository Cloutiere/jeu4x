/**
 * T3 · HANDOFF-T3-ONU (décisions Erik 31/10) — la Grande Muraille IMPPOSE LA
 * PAIX (D2), tant qu'elle est debout (jusqu'à `obsoleteBy: ingenierie`) :
 *  - (a) DeclareWar REFUSÉ contre son propriétaire (raison explicite
 *    `grande_muraille`, style AttackRefused reason:'paix') ;
 *  - (b) paix RÉTROACTIVE à l'achèvement : chaque guerre en cours contre le
 *    propriétaire prend fin immédiatement — paix imposée, non négociée,
 *    gratuite ; événement PUBLIC PeaceAccepted motif 'grande_muraille'
 *    (même canal que la paix canon — PUBLIC_EVENTS) ;
 *  - (c) barbares non concernés (jamais dans diplomacy.war — la gate
 *    d'ATTAQUE blocksEnemyAttacks reste telle quelle, eux compris) ;
 *  - (d) à Ingénierie (union des techs — R-128), la protection disparaît.
 * Intouchés : ONU jalons + victoire immédiate (veto D1 — R-116 TELLE QUELLE),
 * Banque mondiale 20 000 (R-137), science, domination, gate d'attaque
 * R-132/wonderBlocksEnemyAttacks (inchangée), schemaVersion 28.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { applyDeclareWar, applyProposePeace } from '../src/diplomatie.js';
import { allKnownTechs } from '../src/state.js';
import { grandeMurailleImposantLaPaix, wonderBlocksEnemyAttacks } from '../src/culture.js';
import { filterEventsForPlayer } from '../src/fog.js';
import type { GameEvent } from '../src/events.js';
import type { GameState } from '../src/state.js';

function evts(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((e) => e.type === type);
}

/** p1 (0,0) / p2 (9,0) / p3 (18,0) en Paix — une ville chacun. */
function etatTrois(opts: Partial<Parameters<typeof makeState>[0]> = {}): GameState {
  return makeState({
    width: 20,
    height: 8,
    players: ['p1', 'p2', 'p3'],
    warPairs: [],
    units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }],
    cities: [
      { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true },
      { id: 'c2', owner: 'p2', q: 9, r: 0, capital: true },
      { id: 'c3', owner: 'p3', q: 18, r: 0, capital: true },
    ],
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// (a) — le refus de déclaration
// ---------------------------------------------------------------------------

describe('(a) · DeclareWar refusé contre le propriétaire de la Muraille', () => {
  it('p2 possède la Muraille debout → refus raison grande_muraille, zéro WarDeclared', () => {
    const st = etatTrois();
    st.cities['c2']!.wonders = ['grande_muraille'];
    const r = applyDeclareWar(st, 'p1', 'p2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('grande_muraille');
    // état intact : pas de guerre, pas d'événement.
    expect(st.diplomacy.war).toHaveLength(0);
  });

  it('le PROPRIÉTAIRE, lui, peut déclarer (la protection protège, elle ne ferme pas)', () => {
    const st = etatTrois();
    st.cities['c1']!.wonders = ['grande_muraille'];
    const r = applyDeclareWar(st, 'p1', 'p2');
    expect(r.ok).toBe(true);
  });

  it('sans Muraille, la déclaration passe (miroir historique inchangé)', () => {
    const st = etatTrois();
    expect(applyDeclareWar(st, 'p1', 'p2').ok).toBe(true);
  });

  it('(d) Ingénierie connue de QUI SOLDER que ce soit (union des techs R-128) → déclaration possible', () => {
    const st = etatTrois();
    st.cities['c2']!.wonders = ['grande_muraille'];
    st.players['p3']!.techsUnlocked = ['ingenierie']; // tiers — union suffit
    const r = applyDeclareWar(st, 'p1', 'p2');
    expect(r.ok).toBe(true);
  });

  it('helper : grandeMurailleImposantLaPaix suit exactement l\'obsolescence globale', () => {
    const st = etatTrois();
    st.cities['c2']!.wonders = ['grande_muraille'];
    expect(grandeMurailleImposantLaPaix(Object.values(st.cities), 'p2', allKnownTechs(st))).toBe(true);
    st.players['p1']!.techsUnlocked = ['ingenierie'];
    expect(grandeMurailleImposantLaPaix(Object.values(st.cities), 'p2', allKnownTechs(st))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (b) — la paix rétroactive à l'achèvement
// ---------------------------------------------------------------------------

/** Muraille presque achevée dans c1 (progress ≥ coût — complétion à cette résolution). */
function etatMurailleEnChantier(warPairs: Array<[string, string]>, techs?: string[]): GameState {
  const st = etatTrois({ warPairs });
  st.cities['c1']!.production = { item: { kind: 'wonder', id: 'grande_muraille' }, progress: 200 };
  if (techs) st.players['p1']!.techsUnlocked = techs;
  return st;
}

describe('(b) · paix rétroactive à l\'achèvement de la Muraille', () => {
  it('guerre p1-p2 en cours + Muraille achevée par p1 → paire purgée, paix publique motif grande_muraille', () => {
    const st = etatMurailleEnChantier([['p1', 'p2']]);
    st.diplomacy.warsDepuis = { 'p1,p2': 3 };
    st.diplomacy.batailles = { 'p1,p2': 5 };
    const r = resolveTurn(st, {}, 301);
    // la merveille est bien achevée...
    expect(evts(r.events, 'WonderCompleted')).toHaveLength(1);
    // ...et la guerre a pris fin.
    expect(r.newState.diplomacy.war).toHaveLength(0);
    expect(r.newState.diplomacy.warsDepuis?.['p1,p2']).toBeUndefined();
    expect(r.newState.diplomacy.batailles?.['p1,p2']).toBeUndefined();
    expect(r.newState.diplomacy.dernieresGuerres?.p1).toBeDefined();
    expect(r.newState.diplomacy.dernieresGuerres?.p2).toBeDefined();
    const paix = evts(r.events, 'PeaceAccepted') as Array<Extract<GameEvent, { type: 'PeaceAccepted' }>>;
    expect(paix).toHaveLength(1);
    expect(paix[0]!.motif).toBe('grande_muraille');
    expect(paix[0]!.from).toBe('p1'); // le propriétaire IMPOSE
    expect(paix[0]!.on).toBe('p2');
  });

  it('la paix imposée est PUBLIQUE (lue par un tiers, même canal que PeaceAccepted)', () => {
    const st = etatMurailleEnChantier([['p1', 'p2']]);
    const r = resolveTurn(st, {}, 302);
    const paix = evts(r.events, 'PeaceAccepted')[0]!;
    expect(filterEventsForPlayer(r.newState, 'p3', [paix])).toHaveLength(1); // tiers
    expect(filterEventsForPlayer(r.newState, 'p1', [paix])).toHaveLength(1);
    expect(filterEventsForPlayer(r.newState, 'p2', [paix])).toHaveLength(1);
  });

  it('guerre entre DEUX TIERS (p2-p3) + Muraille achevée par p1 → rien pour eux', () => {
    const st = etatMurailleEnChantier([['p2', 'p3']]);
    const r = resolveTurn(st, {}, 303);
    expect(evts(r.events, 'WonderCompleted')).toHaveLength(1);
    expect(r.newState.diplomacy.war).toEqual([['p2', 'p3']]);
    expect(evts(r.events, 'PeaceAccepted')).toHaveLength(0);
  });

  it('(d) Ingénierie déjà dans l\'union à l\'achèvement → AUCUNE paix imposée', () => {
    const st = etatMurailleEnChantier([['p1', 'p2']], ['ingenierie']);
    const r = resolveTurn(st, {}, 304);
    expect(evts(r.events, 'WonderCompleted')).toHaveLength(1);
    expect(r.newState.diplomacy.war).toEqual([['p1', 'p2']]);
    expect(evts(r.events, 'PeaceAccepted')).toHaveLength(0);
  });

  it('UNE AUTRE merveille achevée en guerre n\'impose rien (périmètre : la Muraille seule)', () => {
    const st = etatMurailleEnChantier([['p1', 'p2']]);
    st.cities['c1']!.production = { item: { kind: 'wonder', id: 'stonehenge' }, progress: 200 };
    const r = resolveTurn(st, {}, 305);
    expect(evts(r.events, 'WonderCompleted')).toHaveLength(1);
    expect(r.newState.diplomacy.war).toEqual([['p1', 'p2']]);
    expect(evts(r.events, 'PeaceAccepted')).toHaveLength(0);
  });

  it('deux guerres contre le propriétaire (p1-p2 ET p1-p3) → LES DEUX paires prennent fin', () => {
    const st = etatMurailleEnChantier([
      ['p1', 'p2'],
      ['p1', 'p3'],
    ]);
    const r = resolveTurn(st, {}, 306);
    expect(r.newState.diplomacy.war).toHaveLength(0);
    expect(evts(r.events, 'PeaceAccepted')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Intouchés — non-régression
// ---------------------------------------------------------------------------

describe('intouchés', () => {
  it('la paix CANON (ProposePeace) n\'emporte pas de motif (le champ reste optionnel)', () => {
    const st = etatTrois({ warPairs: [['p1', 'p2']] });
    const r = applyProposePeace(st, 'p1', 'p2', true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const paix = r.events.find((e) => e.type === 'PeaceAccepted') as
        | Extract<GameEvent, { type: 'PeaceAccepted' }>
        | undefined;
      expect(paix).toBeDefined();
      expect(paix!.motif).toBeUndefined();
    }
  });

  it('(c) la gate d\'ATTAQUE blocksEnemyAttacks reste INTACTE (miroir wonderBlocksEnemyAttacks)', () => {
    const st = etatTrois();
    st.cities['c2']!.wonders = ['grande_muraille'];
    expect(wonderBlocksEnemyAttacks(Object.values(st.cities), 'p2', allKnownTechs(st))).toBe(true);
    st.players['p3']!.techsUnlocked = ['ingenierie'];
    expect(wonderBlocksEnemyAttacks(Object.values(st.cities), 'p2', allKnownTechs(st))).toBe(false);
  });

  it('(c) les barbares n\'ont jamais de paire dans diplomacy.war — la paix rétroactive ne les concerne pas', () => {
    const st = etatMurailleEnChantier([['p1', 'p2']]);
    const r = resolveTurn(st, {}, 307);
    // aucune paire impliquant le barbare n'a jamais existé ici ; l'état final
    // ne peut pas en créer une (la paix imposée ne fait que PURGER).
    for (const [a, b] of r.newState.diplomacy.war) {
      expect(a).not.toBe('barbarien');
      expect(b).not.toBe('barbarien');
    }
  });

  it('ONU/Banque intouchés : l\'achèvement de la Muraille ne touche aucun compteur de victoire', () => {
    const st = etatMurailleEnChantier([['p1', 'p2']]);
    st.players['p1']!.cultureMilestones = 19;
    const r = resolveTurn(st, {}, 308);
    // R-131 : la merveille compte 1 jalon (19→20) — mais PAS de victoire
    // culture (la Muraille n'est pas l'ONU — veto D1 : R-116 telle quelle).
    expect(r.newState.players['p1']!.cultureMilestones).toBe(20);
    expect(evts(r.events, 'Victory')).toHaveLength(0);
    expect(r.newState.winner).toBeNull();
  });
});
