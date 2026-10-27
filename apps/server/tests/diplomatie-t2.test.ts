/**
 * DIPLOMATIE-T2 (décisions Erik 28/10, HANDOFF-DIPLOMATIE-T2) — L1.
 *
 * D1 : négociation PRIVÉE — les événements (PeaceCompensated,
 *      PeaceOfferRefused, TechTraded, TechTradeRefused) ne parviennent qu'aux
 *      DEUX parties (filterEventsForPlayer) ; le FAIT de la paix reste public.
 * D2 : paix avec compensation — goldOffer validé (trésorerie), or transféré
 *      À L'ACCEPTATION, rien ne bouge au refus.
 * D3 : TradeTechs — échange 1:1, tech contre or, validations (déjà connue,
 *      en guerre, anarchie, contrepartie unique), atomique.
 * D4 : décisions du bot seedées — accepte l'offre généreuse, refuse
 *      l'insulte, contre-propose en zone grise ; DÉTERMINISTE par graine.
 * Formes : orderShapeError EN PREMIER (leçon 7f).
 */
import { describe, expect, it } from 'vitest';
import {
  applyDeclareWar,
  applyProposePeace,
  applyTradeTechs,
  createRng,
  filterEventsForPlayer,
  makeState,
  TECHS,
} from '@game/rules';
import type { City, GameState, PlayerId, SeededRng } from '@game/rules';
import { orderShapeError } from '../src/game.js';
import {
  deciderEchangeTechs,
  deciderPaixNegociee,
  negociationDuBot,
  prixPaixDuBot,
  profileDuBot,
} from '../src/botPolicy.js';

const MOI: PlayerId = 'p1';
const BOT: PlayerId = 'p2';
const TIERS: PlayerId = 'p3';

function state(opts: {
  wars?: Array<[PlayerId, PlayerId]>;
  treasury?: Record<PlayerId, number>;
  techs?: Record<PlayerId, string[]>;
  units?: Record<PlayerId, number>;
  anarchie?: PlayerId;
  joueurs?: PlayerId[];
}): GameState {
  const joueurs = opts.joueurs ?? [MOI, BOT, TIERS];
  const s = makeState({
    width: 30,
    height: 12,
    players: joueurs,
    warPairs: opts.wars ?? [],
    units: joueurs.flatMap((p) =>
      Array.from({ length: opts.units?.[p] ?? 2 }, (_, i) => ({
        id: `u-${p}-${i}`,
        type: 'guerrier',
        owner: p,
        q: 2 + i,
        r: p === MOI ? 2 : p === BOT ? 4 : 8,
        aboard: null,
        cargo: null,
      })),
    ),
    cities: joueurs.map((p, i) => ({
      id: `v-${p}`,
      owner: p,
      q: 2 + i * 6,
      r: 5,
      pop: 2,
      capital: true,
      workedTiles: [],
      buildings: [],
    })) as unknown as City[],
    rngSeed: 42,
  }) as GameState;
  s.turn = 40;
  for (const [p, or] of Object.entries(opts.treasury ?? {})) {
    s.players[p as PlayerId]!.treasury = or;
  }
  for (const [p, techs] of Object.entries(opts.techs ?? {})) {
    s.players[p as PlayerId]!.techsUnlocked = [...techs];
  }
  if (opts.anarchie) {
    s.players[opts.anarchie]!.anarchyUntil = s.turn + 5;
  }
  return s;
}

const NORMAL = profileDuBot('normal');
const NEGOC = negociationDuBot();
const rngFaux = (): SeededRng => ({ next: () => 0.99, nextInt: (n: number) => n - 1, state: 0 }) as SeededRng;

// ---------------------------------------------------------------------------
// Formes — orderShapeError EN PREMIER (leçon 7f)
// ---------------------------------------------------------------------------

describe('DIPLOMATIE-T2 · formes (EN PREMIER)', () => {
  it('ProposePeace : goldOffer non entier ou négatif → refus de forme', () => {
    expect(orderShapeError({ type: 'ProposePeace', player: 'p2', goldOffer: 1.5 })).not.toBeNull();
    expect(orderShapeError({ type: 'ProposePeace', player: 'p2', goldOffer: -5 })).not.toBeNull();
    expect(orderShapeError({ type: 'ProposePeace', player: 'p2', goldOffer: 0 })).toBeNull();
    expect(orderShapeError({ type: 'ProposePeace', player: 'p2', goldOffer: 50 })).toBeNull();
    expect(orderShapeError({ type: 'ProposePeace', player: 'p2' })).toBeNull();
    expect(orderShapeError({ type: 'ProposePeace' })).not.toBeNull();
  });

  it('TradeTechs : cible/tech/contrepartie — exactement UNE', () => {
    expect(orderShapeError({ type: 'TradeTechs', target: 'p2', techOfferte: 'poterie' })).not.toBeNull();
    expect(
      orderShapeError({ type: 'TradeTechs', target: 'p2', techOfferte: 'poterie', techDemandee: 'ecriture', goldDemande: 30 }),
    ).not.toBeNull();
    expect(orderShapeError({ type: 'TradeTechs', target: 'p2', techOfferte: 'poterie', goldDemande: -1 })).not.toBeNull();
    expect(orderShapeError({ type: 'TradeTechs', target: 'p2', techOfferte: 'poterie', goldDemande: 30 })).toBeNull();
    expect(orderShapeError({ type: 'TradeTechs', target: 'p2', techOfferte: 'poterie', techDemandee: 'ecriture' })).toBeNull();
    expect(orderShapeError({ type: 'TradeTechs', techOfferte: 'poterie', goldDemande: 30 })).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D2 — paix avec compensation
// ---------------------------------------------------------------------------

describe('DIPLOMATIE-T2 · D2 — paix compensée', () => {
  it('acceptation : l’or passe, la guerre est purgée, PeaceAccepted public + PeaceCompensated privé', () => {
    const s = state({ wars: [[MOI, BOT]], treasury: { [MOI]: 100, [BOT]: 0 } });
    const r = applyProposePeace(s, MOI, BOT, true, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[MOI]!.treasury).toBe(50);
    expect(r.state.players[BOT]!.treasury).toBe(50);
    expect(r.state.diplomacy.war).toHaveLength(0);
    expect(r.events.map((e) => e.type)).toEqual(['PeaceAccepted', 'PeaceCompensated']);
    const compense = r.events[1]!;
    if (compense.type !== 'PeaceCompensated') throw new Error('type attendu');
    expect(compense.gold).toBe(50);
  });

  it('refus : RIEN ne bouge (trésoreries, guerre), événement PRIVÉ PeaceOfferRefused', () => {
    const s = state({ wars: [[MOI, BOT]], treasury: { [MOI]: 100, [BOT]: 0 } });
    const r = applyProposePeace(s, MOI, BOT, false, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[MOI]!.treasury).toBe(100);
    expect(r.state.players[BOT]!.treasury).toBe(0);
    expect(r.state.diplomacy.war).toHaveLength(1);
    expect(r.events.map((e) => e.type)).toEqual(['PeaceOfferRefused']);
  });

  it('trésorerie insuffisante → refus métier (l’or ne peut pas passer)', () => {
    const s = state({ wars: [[MOI, BOT]], treasury: { [MOI]: 10 } });
    const r = applyProposePeace(s, MOI, BOT, true, 50);
    expect(r.ok).toBe(false);
  });

  it('paix sèche SANS compensation : comportement T1 inchangé (PeaceRefused public au refus)', () => {
    const s = state({ wars: [[MOI, BOT]] });
    const r = applyProposePeace(s, MOI, BOT, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => e.type)).toEqual(['PeaceRefused']);
  });
});

// ---------------------------------------------------------------------------
// D3 — TradeTechs
// ---------------------------------------------------------------------------

describe('DIPLOMATIE-T2 · D3 — échange de technologies', () => {
  const T_OFFERTE = 'poterie'; // connue de MOI, inconnue de BOT (coût faible)
  const T_DEMANDEE = 'ecriture';

  it('échange 1:1 accepté : ATOMIQUE (les deux techs basculent), TechTraded privé', () => {
    const s = state({ techs: { [MOI]: [T_OFFERTE], [BOT]: [T_DEMANDEE] } });
    const r = applyTradeTechs(s, MOI, BOT, { techOfferte: T_OFFERTE, techDemandee: T_DEMANDEE }, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[MOI]!.techsUnlocked).toContain(T_DEMANDEE);
    expect(r.state.players[BOT]!.techsUnlocked).toContain(T_OFFERTE);
    expect(r.state.players[MOI]!.treasury).toBe(s.players[MOI]!.treasury);
    expect(r.events.map((e) => e.type)).toEqual(['TechTraded']);
  });

  it('tech contre or accepté : tech + or basculent ensemble', () => {
    const s = state({ techs: { [MOI]: [T_OFFERTE], [BOT]: [] }, treasury: { [BOT]: 80 } });
    const r = applyTradeTechs(s, MOI, BOT, { techOfferte: T_OFFERTE, goldDemande: 30 }, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[BOT]!.techsUnlocked).toContain(T_OFFERTE);
    expect(r.state.players[BOT]!.treasury).toBe(50);
    expect(r.state.players[MOI]!.treasury).toBe(30);
    const ev = r.events[0]!;
    if (ev.type !== 'TechTraded') throw new Error('type attendu');
    expect(ev.gold).toBe(30);
    expect(ev.techDonnee).toBeUndefined();
  });

  it('refus du bot : rien ne bouge, TechTradeRefused privé', () => {
    const s = state({ techs: { [MOI]: [T_OFFERTE], [BOT]: [] }, treasury: { [BOT]: 80 } });
    const r = applyTradeTechs(s, MOI, BOT, { techOfferte: T_OFFERTE, goldDemande: 30 }, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[BOT]!.techsUnlocked).not.toContain(T_OFFERTE);
    expect(r.state.players[MOI]!.treasury).toBe(0);
    expect(r.events.map((e) => e.type)).toEqual(['TechTradeRefused']);
  });

  it('validations : déjà connue du receveur, inconnue du donneur, guerre, anarchie', () => {
    const base = state({ techs: { [MOI]: [T_OFFERTE], [BOT]: [] } });
    expect(applyTradeTechs(base, MOI, BOT, { techOfferte: T_OFFERTE, goldDemande: 10 }, true).ok).toBe(false); // BOT connaît déjà
    const base2 = state({ techs: { [MOI]: [], [BOT]: [] } });
    expect(applyTradeTechs(base2, MOI, BOT, { techOfferte: T_OFFERTE, goldDemande: 10 }, true).ok).toBe(false); // je ne la connais pas
    expect(applyTradeTechs(base2, MOI, BOT, { techOfferte: 'inconnue_totale', goldDemande: 10 }, true).ok).toBe(false);
    expect(applyTradeTechs(base2, MOI, BOT, { techOfferte: T_OFFERTE, techDemandee: T_DEMANDEE }, true).ok).toBe(false); // BOT ne la connaît pas
    const enGuerre = state({ wars: [[MOI, BOT]], techs: { [MOI]: [T_OFFERTE], [BOT]: [T_DEMANDEE] } });
    expect(applyTradeTechs(enGuerre, MOI, BOT, { techOfferte: T_OFFERTE, techDemandee: T_DEMANDEE }, true).ok).toBe(false);
    const anarchie = state({ techs: { [MOI]: [T_OFFERTE], [BOT]: [] }, anarchie: BOT });
    expect(applyTradeTechs(anarchie, MOI, BOT, { techOfferte: T_OFFERTE, goldDemande: 10 }, true).ok).toBe(false);
  });

  it('D1 — PRIVACITÉ : TechTraded ne parvient qu’aux DEUX parties, jamais au tiers', () => {
    const s = state({ techs: { [MOI]: [T_OFFERTE], [BOT]: [T_DEMANDEE] } });
    const r = applyTradeTechs(s, MOI, BOT, { techOfferte: T_OFFERTE, techDemandee: T_DEMANDEE }, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const lecteur of [MOI, BOT]) {
      expect(filterEventsForPlayer(r.state, lecteur, r.events)).toHaveLength(1);
    }
    expect(filterEventsForPlayer(r.state, TIERS, r.events)).toHaveLength(0);
  });

  it('D1 — PRIVACITÉ : PeaceCompensated privé, PeaceAccepted PUBLIC (le fait de la paix)', () => {
    const s = state({ wars: [[MOI, BOT]], treasury: { [MOI]: 100 } });
    const r = applyProposePeace(s, MOI, BOT, true, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const filtres = filterEventsForPlayer(r.state, TIERS, r.events);
    expect(filtres.map((e) => e.type)).toEqual(['PeaceAccepted']); // pas le montant
    expect(filterEventsForPlayer(r.state, MOI, r.events)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// D4 — décisions du bot (seedées)
// ---------------------------------------------------------------------------

describe('DIPLOMATIE-T2 · D4 — la grille de négociation du bot', () => {
  it('prix de la paix : fierté (agressivité) et rapport de forces', () => {
    const s = state({ units: { [BOT]: 5, [MOI]: 1 } }); // bot fort
    const prixFort = prixPaixDuBot(s, BOT, MOI, NEGOC, 0.5);
    const sFaible = state({ units: { [BOT]: 1, [MOI]: 5 } });
    const prixFaible = prixPaixDuBot(sFaible, BOT, MOI, NEGOC, 0.5);
    expect(prixFaible).toBeLessThan(prixFort);
    // fierté : agressivité 0,9 exige plus que 0,1 (même état)
    expect(prixPaixDuBot(s, BOT, MOI, NEGOC, 0.9)).toBeGreaterThan(prixPaixDuBot(s, BOT, MOI, NEGOC, 0.1));
  });

  it('offre généreuse → accepte ; insulte → refuse', () => {
    const s = state({ units: { [BOT]: 5, [MOI]: 1 } });
    const prix = prixPaixDuBot(s, BOT, MOI, NEGOC, 0.5);
    expect(deciderPaixNegociee(s, BOT, MOI, prix + 10, NORMAL, NEGOC, rngFaux(), 0.5)).toBe('accepte');
    expect(deciderPaixNegociee(s, BOT, MOI, Math.floor(prix * NEGOC.zoneGrise) - 1, NORMAL, NEGOC, rngFaux(), 0.5)).toBe('refuse');
  });

  it('zone grise → contre-proposition (le prix exigé), DÉTERMINISTE par graine', () => {
    const s = state({ units: { [BOT]: 5, [MOI]: 1 } });
    const prix = prixPaixDuBot(s, BOT, MOI, NEGOC, 0.5);
    const grise = Math.ceil(prix * NEGOC.zoneGrise);
    const rng1 = createRng(777);
    const rng2 = createRng(777);
    const r1 = deciderPaixNegociee(s, BOT, MOI, grise, NORMAL, NEGOC, rng1, 0.5);
    const r2 = deciderPaixNegociee(s, BOT, MOI, grise, NORMAL, NEGOC, rng2, 0.5);
    expect(r1).toEqual(r2);
    // la contre-proposition nomme un prix STRICTEMENT supérieur à l'offre
    if (typeof r1 === 'object') expect(r1.contreOr).toBeGreaterThan(grise);
  });

  it('échange de techs : généreux → accepte, insulte → refuse', () => {
    const s = state({});
    const coutPoterie = TECHS['poterie']!.cost;
    // je demande 0 or pour ma tech → généreux, accepte
    expect(deciderEchangeTechs(s, BOT, MOI, { techOfferte: 'poterie', goldDemande: 0 }, NORMAL, NEGOC, rngFaux(), 0.5)).toBe('accepte');
    // je demande BEAUCOUP d'or pour une tech minable → insulte
    expect(deciderEchangeTechs(s, BOT, MOI, { techOfferte: 'poterie', goldDemande: coutPoterie * 10 }, NORMAL, NEGOC, rngFaux(), 0.5)).toBe('refuse');
  });

  it('échange 1:1 : généreux (ma tech plus chère) → accepte ; déséquilibré contre MOI → refus ou contre-proposition', () => {
    const s = state({});
    const chere = Object.values(TECHS).find((t) => t.cost > TECHS['poterie']!.cost * (1 + NEGOC.margeTech))!;
    // le bot REÇOIT la tech chère et DONNE poterie → généreux, accepte
    expect(deciderEchangeTechs(s, BOT, MOI, { techOfferte: chere.id, techDemandee: 'poterie' }, NORMAL, NEGOC, rngFaux(), 0.5)).toBe('accepte');
    // le bot reçoit poterie et DONNE la tech chère → insulte
    const r = deciderEchangeTechs(s, BOT, MOI, { techOfferte: 'poterie', techDemandee: chere.id }, NORMAL, NEGOC, rngFaux(), 0.5);
    expect(r === 'refuse' || typeof r === 'object').toBe(true);
  });

  it('une offre IDENTIQUE reçoit TOUJOURS la même réponse (aucune usure — miroir PAIX-RYTHME)', () => {
    const s = state({ units: { [BOT]: 5, [MOI]: 1 } });
    const prix = prixPaixDuBot(s, BOT, MOI, NEGOC, 0.5);
    const grise = Math.ceil(prix * NEGOC.zoneGrise);
    const reponses = new Set(
      Array.from({ length: 5 }, () => JSON.stringify(deciderPaixNegociee(s, BOT, MOI, grise, NORMAL, NEGOC, createRng(1234), 0.5))),
    );
    expect(reponses.size).toBe(1);
  });
});
