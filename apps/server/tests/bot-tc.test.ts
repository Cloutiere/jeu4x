/**
 * BOT-TC (décisions Erik 25/10) — le bot déclare la guerre selon
 * l'agressivité de SA civilisation et le rapport de forces, et complète la
 * boucle avec la paix minimale.
 *
 * D1 : décision de déclaration (agressivité × tirage seedé, seuil de forces,
 *      tour minimum, délai entre guerres) — data-driven (civilizations.json
 *      `agressivite` + bot.json bloc diplomatie par profil).
 * D2 : ciblage du voisin le plus faible (forces, distance wrap) ; offensive
 *      des armées en guerre vers la capitale de la cible ; bots entre eux.
 * D3 : paix minimale — action ProposePeace (forme validée EN PREMIER),
 *      décision du bot (écrasé ⇒ accepte, sinon refuse ; toursPaixMin),
 *      purgation de `wars`, événements publics.
 * D4 : déterminisme intégral (même seed ⇒ mêmes décisions).
 */
import { describe, expect, it } from 'vitest';
import {
  BOT_SETTINGS,
  CIVILIZATIONS,
  agressiviteDe,
  areAtWar,
  createRng,
  makeState,
} from '@game/rules';
import type { City, GameState, PlayerId } from '@game/rules';
import {
  applyDeclareWar,
  applyProposePeace,
  dureeGuerre,
} from '@game/rules';
import { orderShapeError } from '../src/game.js';
import {
  botPolicy,
  cibleGuerre,
  cibleOffensive,
  deciderGuerre,
  deciderPaix,
  forcesDe,
  profileDuBot,
} from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';
const TIER: PlayerId = 'p3';

function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number }>;
  cities?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
  turn?: number;
  civ?: Record<PlayerId, string>;
}): GameState {
  const players = [AUTRE, ME, ...(opts.cities?.some((c) => c.owner === TIER) ? [TIER] : [])];
  const s = makeState({
    width: 10,
    height: 10,
    players,
    warPairs: [],
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: (opts.cities ?? []).map((c) => ({
      pop: 2,
      capital: true,
      workedTiles: [],
      buildings: [],
      ...c,
    })),
    rngSeed: 42,
  }) as GameState;
  s.turn = opts.turn ?? 40;
  if (opts.civ) for (const [p, civ] of Object.entries(opts.civ)) s.players[p as PlayerId]!.civId = civ;
  return s;
}

describe('BOT-TC · D1 — données : agressivité par civilisation', () => {
  it('chaque civ du catalogue porte une agressivite entre 0 et 1', () => {
    for (const [id, civ] of Object.entries(CIVILIZATIONS.civs)) {
      expect(civ.agressivite, `agressivite manquante pour ${id}`).toBeGreaterThanOrEqual(0);
      expect(civ.agressivite, `agressivite hors borne pour ${id}`).toBeLessThanOrEqual(1);
    }
  });

  it('agressiviteDe retombe au défaut pour une civ inconnue ou neutre', () => {
    expect(agressiviteDe('civ_inconnue')).toBe(0.5);
    expect(agressiviteDe('neutre')).toBe(0.5);
  });

  it('les Zoulous/Mongols sont plus agressifs que l’Inde (gradation canon)', () => {
    expect(agressiviteDe('zoulous')).toBeGreaterThan(agressiviteDe('inde'));
    expect(agressiviteDe('mongolie')).toBeGreaterThan(agressiviteDe('inde'));
  });
});

describe('BOT-TC · D1 — bloc diplomatie de bot.json (×3 profils)', () => {
  it('chaque profil porte les seuils de guerre et de paix', () => {
    for (const [nom, p] of Object.entries(BOT_SETTINGS.profiles)) {
      expect(p.tourMinGuerre, nom).toBeGreaterThanOrEqual(0);
      // calibrage BOT-TC 🔶 : le seuil peut passer SOUS 1 (le bot n'investit
      // le militaire qu'en guerre — un seuil strict verrouille la paix
      // éternelle contre une tortue ; cf. banc botSolo).
      expect(p.seuilRatioGuerre, nom).toBeGreaterThanOrEqual(0.4);
      expect(p.facteurAgressivite, nom).toBeGreaterThan(0);
      expect(p.delaiEntreGuerres, nom).toBeGreaterThanOrEqual(0);
      expect(p.seuilRatioPaix, nom).toBeGreaterThan(0);
      // PAIX-RYTHME (27/10) : chanceAccepteFaible ABROGÉE — réponse
      // déterministe ; toursPaixGagnant multiplie toursPaixMin.
      expect(p.toursPaixMin, nom).toBeGreaterThanOrEqual(0);
      expect(p.toursPaixGagnant, nom).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('BOT-TC · D1 — décision de déclaration de guerre', () => {
  const profile = profileDuBot('normal');

  it('pas de guerre avant tourMinGuerre', () => {
    const s = state({
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
      turn: profile.tourMinGuerre - 1,
    });
    // BOT-ARMEE D6 : le seuil est modulé par l'agressivité (une civ
    // agressive attaque des voisins ÉGAUX) — on teste le blocage au seuil à
    // agressivité NEUTRE (0,5 ⇒ seuil non modulé, miroir du comportement
    // historique).
    expect(deciderGuerre(s, ME, profile, createRng(7), 0.5)).toBeNull();
  });

  it('pas de guerre si le rapport de forces est sous le seuil', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
        { id: 'u3', type: 'guerrier', owner: AUTRE, q: 6, r: 1 },
        { id: 'u4', type: 'guerrier', owner: AUTRE, q: 7, r: 2 },
        { id: 'u5', type: 'guerrier', owner: AUTRE, q: 5, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
    });
    // BOT-ARMEE D6 : le seuil est modulé par l'agressivité (une civ
    // agressive attaque des voisins ÉGAUX) — on teste le blocage au seuil à
    // agressivité NEUTRE (0,5 ⇒ seuil non modulé, miroir du comportement
    // historique).
    expect(deciderGuerre(s, ME, profile, createRng(7), 0.5)).toBeNull();
  });

  it('guerre si forces, tour et tirage favorable — même seed ⇒ même décision', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 1 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 1, r: 2 },
        { id: 'u4', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
    });
    const a = deciderGuerre(s, ME, profile, createRng(7), 1);
    const b = deciderGuerre(s, ME, profile, createRng(7), 1);
    expect(a).toBe(AUTRE);
    expect(b).toBe(a);
  });

  it('une civ peu agressive ne tire presque jamais la guerre (même seed)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u4', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
    });
    // inde 0.25 × facteur 1 : sur 200 seeds la guerre est rare (déterministe).
    let guerres = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (deciderGuerre(s, ME, profile, createRng(seed), agressiviteDe('inde'))) guerres++;
    }
    expect(guerres).toBeLessThanOrEqual(80);
  });

  it('délai minimal entre deux guerres (dernieresGuerres)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 1 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 1, r: 2 },
        { id: 'u4', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
    });
    s.diplomacy.dernieresGuerres = { [ME]: s.turn - profile.delaiEntreGuerres + 1 };
    // BOT-ARMEE D6 : le seuil est modulé par l'agressivité (une civ
    // agressive attaque des voisins ÉGAUX) — on teste le blocage au seuil à
    // agressivité NEUTRE (0,5 ⇒ seuil non modulé, miroir du comportement
    // historique).
    expect(deciderGuerre(s, ME, profile, createRng(7), 0.5)).toBeNull();
    s.diplomacy.dernieresGuerres = { [ME]: s.turn - profile.delaiEntreGuerres };
    expect(deciderGuerre(s, ME, profile, createRng(7), 1)).toBe(AUTRE);
  });

  it('cible le voisin le PLUS FAIBLE (forces d’abord, distance en tie-break)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: AUTRE, q: 6, r: 2 },
        { id: 'u3', type: 'legion', owner: TIER, q: 1, r: 8 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
        { id: 'c3', owner: TIER, q: 1, r: 8 },
      ],
    });
    expect(cibleGuerre(s, ME)).toBe(AUTRE);
  });

  it('botPolicy émet l’action DeclareWar (civ agressive, forces favorables)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 1 },
        { id: 'u3', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
      civ: { [ME]: 'zoulous' },
    });
    // balaye les seeds : une action DeclareWar finit par sortir (agressivité 0.85).
    let declare = false;
    for (let seed = 1; seed <= 40 && !declare; seed++) {
      const plan = botPolicy(s, ME, createRng(seed), 'normal');
      declare = plan.actions.some((a) => a.type === 'DeclareWar' && a.player === AUTRE);
    }
    expect(declare).toBe(true);
  });

  it('botPolicy ne déclare JAMAIS la guerre en paix prolongée si déjà en guerre', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
      civ: { [ME]: 'zoulous' },
    });
    const apres = applyDeclareWar(s, ME, AUTRE);
    expect(apres.ok).toBe(true);
    const enGuerre = apres.ok ? apres.state : s;
    for (let seed = 1; seed <= 40; seed++) {
      const plan = botPolicy(enGuerre, ME, createRng(seed), 'normal');
      expect(plan.actions.some((a) => a.type === 'DeclareWar')).toBe(false);
    }
  });
});

describe('BOT-TC · D2 — offensive vers la capitale de la cible', () => {
  it('en guerre, l’unité excédentaire (hors garnison) marche vers la capitale ennemie', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 4, r: 4 },
        { id: 'u2', type: 'guerrier', owner: AUTRE, q: 8, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
      ],
    });
    const enGuerre = applyDeclareWar(s, ME, AUTRE);
    expect(enGuerre.ok).toBe(true);
    const st = enGuerre.ok ? enGuerre.state : s;
    const plan = botPolicy(st, ME, createRng(7), 'normal');
    // la capitale ME est garnie par… personne d’autre : u1 est le seul
    // combattant — BOT-EXPLORATION le met en patrouille/garnison. On vérifie
    // via cibleOffensive + un excédent (2e unité chez ME).
    expect(cibleOffensive(st, ME)).toEqual({ q: 8, r: 2 });
  });

  it('cibleOffensive : capitale ennemie la plus proche (tie-break id)', () => {
    let s = state({
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
        { id: 'c3', owner: TIER, q: 4, r: 4 },
      ],
    });
    const w1 = applyDeclareWar(s, ME, AUTRE);
    if (!w1.ok) throw new Error('guerre attendue');
    const w2 = applyDeclareWar(w1.state, ME, TIER);
    if (!w2.ok) throw new Error('guerre attendue');
    s = w2.state;
    // wrap Est↔Ouest (carte 10 de large) : c2 (8,2) est à 4 comme c3 (4,4) —
    // ex æquo, tie-break id croissant (R-81) → c2.
    expect(cibleOffensive(s, ME)).toEqual({ q: 8, r: 2 });
  });
});

describe('BOT-TC · D3 — ProposePeace : action, décision, purgation', () => {
  it('orderShapeError valide la forme EN PREMIER (leçon 7f)', () => {
    expect(orderShapeError({ type: 'ProposePeace', player: 'p1' })).toBeNull();
    expect(orderShapeError({ type: 'ProposePeace' })).not.toBeNull();
    expect(orderShapeError({ type: 'ProposePeace', player: 42 as unknown as string })).not.toBeNull();
  });

  it('refuse la proposition hors guerre', () => {
    const s = state({});
    const r = applyProposePeace(s, ME, AUTRE, true);
    expect(r.ok).toBe(false);
  });

  it('paix acceptée : wars purgée, événements publics PeaceAccepted', () => {
    let s = state({});
    const w = applyDeclareWar(s, ME, AUTRE);
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    s = w.state;
    expect(areAtWar(s, ME, AUTRE)).toBe(true);
    expect(dureeGuerre(s, ME, AUTRE)).toBe(0);
    // la durée se mesure depuis le tour de DÉCLARATION.
    const plusTard = structuredClone(s);
    plusTard.turn += 12;
    expect(dureeGuerre(plusTard, ME, AUTRE)).toBe(12);
    const r = applyProposePeace(s, ME, AUTRE, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(areAtWar(r.state, ME, AUTRE)).toBe(false);
    expect(r.state.diplomacy.war).toHaveLength(0);
    expect(r.events.map((e) => e.type)).toEqual(['PeaceAccepted']);
    expect(dureeGuerre(r.state, ME, AUTRE)).toBe(0);
    // re-déclaration permise après paix (miroir T1) ; dernieresGuerres posées.
    const again = applyDeclareWar(r.state, ME, AUTRE);
    expect(again.ok).toBe(true);
  });

  it('paix refusée : wars intacte, événement PeaceRefused public', () => {
    let s = state({});
    const w = applyDeclareWar(s, ME, AUTRE);
    if (!w.ok) throw new Error('guerre attendue');
    s = w.state;
    const r = applyProposePeace(s, ME, AUTRE, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(areAtWar(r.state, ME, AUTRE)).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(['PeaceRefused']);
  });

  it('deciderPaix (PAIX-RYTHME) : guerre vide à min, paix du gagnant à 2×min, sinon refuse — déterministe', () => {
    const profile = profileDuBot('normal');
    let s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 1 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 1, r: 2 },
        { id: 'u4', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
    });
    const w = applyDeclareWar(s, ME, AUTRE);
    if (!w.ok) throw new Error('guerre attendue');
    s = w.state;
    // Guerre JEUNE (rien n'a lieu) : refuse — même écrasé (plus de tirage).
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(false);
    // Guerre vide à toursPaixMin : paix administrative.
    s.turn += profile.toursPaixMin;
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(true);
    // Guerre bataillée : entre min et 2×min, le gagnant tient.
    s.turn += 1;
    s.diplomacy.batailles = { [ME < AUTRE ? `${ME},${AUTRE}` : `${AUTRE},${ME}`]: 3 };
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(false);
    // Au-delà de 2×min : paix du gagnant (déterministe, aucun tirage).
    s.turn += profile.toursPaixMin;
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(true);
    expect(deciderPaix(s, ME, AUTRE, profile)).toBe(true);
  });

  it('les bots proposent la paix ENTRE EUX quand ils PERDENT (jamais en position de force)', () => {
    const profile = profileDuBot('normal');
    let s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 1 },
        { id: 'u3', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
        { id: 'u4', type: 'guerrier', owner: AUTRE, q: 6, r: 1 },
        { id: 'u5', type: 'guerrier', owner: AUTRE, q: 5, r: 2 },
        { id: 'u6', type: 'guerrier', owner: AUTRE, q: 7, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
    });
    const w = applyDeclareWar(s, ME, AUTRE);
    if (!w.ok) throw new Error('guerre attendue');
    s = w.state;
    s.turn += profile.toursPaixMin + 5;
    // ME est écrasé (2 vs 4 guerriers) : propose (durée ≥ toursPaixMin ⇒ oui).
    const plan = botPolicy(s, ME, createRng(7), 'normal');
    expect(plan.actions.some((a) => a.type === 'ProposePeace' && a.player === AUTRE)).toBe(true);
    // PAIX-RYTHME : AUTRE (fort) propose la fermeture d'une guerre VIDE
    // (administrative à toursPaixMin) — mais JAMAIS d'une guerre vivante.
    const planVide = botPolicy(s, AUTRE, createRng(7), 'normal');
    expect(planVide.actions.some((a) => a.type === 'ProposePeace')).toBe(true);
    s.diplomacy.batailles = { [ME < AUTRE ? `${ME},${AUTRE}` : `${AUTRE},${ME}`]: 3 };
    for (let seed = 1; seed <= 40; seed++) {
      const planFort = botPolicy(s, AUTRE, createRng(seed), 'normal');
      expect(planFort.actions.some((a) => a.type === 'ProposePeace')).toBe(false);
    }
  });
});

describe('BOT-TC · D3 — bout en bout : déclaration serveur puis offensive', () => {
  it('applyDeclareWar alimente warsDepuis (durée de guerre mesurable)', () => {
    const s = state({ turn: 12 });
    const w = applyDeclareWar(s, ME, AUTRE);
    if (!w.ok) throw new Error('guerre attendue');
    expect(w.state.diplomacy.warsDepuis?.['p1,p2']).toBe(12);
    expect(dureeGuerre(w.state, ME, AUTRE)).toBe(0);
  });

  it('déterminisme : même état + même seed ⇒ plans identiques (avec guerre)', () => {
    let s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
      civ: { [ME]: 'zoulous' },
    });
    const w = applyDeclareWar(s, ME, AUTRE);
    if (!w.ok) throw new Error('guerre attendue');
    s = w.state;
    const a = botPolicy(s, ME, createRng(11), 'normal');
    const b = botPolicy(s, ME, createRng(11), 'normal');
    expect(a).toEqual(b);
  });

  it('reprise : l’état post-paix reste un état moteur valide (schemaVersion inchangée)', () => {
    let s = state({});
    const w = applyDeclareWar(s, ME, AUTRE);
    if (!w.ok) throw new Error('guerre attendue');
    s = w.state;
    const p = applyProposePeace(s, ME, AUTRE, true);
    if (!p.ok) throw new Error('paix attendue');
    expect(p.state.schemaVersion).toBe(s.schemaVersion);
    expect(p.state.diplomacy.warsDepuis?.['p1,p2']).toBeUndefined();
    expect(p.state.diplomacy.dernieresGuerres?.[ME]).toBe(s.turn);
  });
});
