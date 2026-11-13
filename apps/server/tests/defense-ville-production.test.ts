/**
 * DEFENSE-VILLE-B (canon Erik 13/11, handoff HANDOFF-DEFENSE-VILLE-B) — tests
 * FIRST du VETO PRODUCTION DÉFENSIVE (L3, dernière tranche du plan défense).
 *
 * Canon « survivre d'abord » : une ville avec menace visible à ≤ 2 tours de
 * MARCHE (rayon L5 — seuilQuestionDef) ET déficit de garnison (menacesVille +
 * garnisonDeficit de la tranche A — ZÉRO nouveau calcul) NE PRODUIT PAS
 * d'item expansif : colon/bâtiment/merveille refusés au profit de GUERRIER
 * (pivot mécanique, miroir du veto escort). Le cas déclencheur du
 * diagnostic : p04 capitale — 5 colons produits en 50 tours de guerre, 0
 * militaire ; p03 — colon produit t34 pendant le siège (mort avec la ville).
 *
 * Branché aux DEUX endroits canon : `arbitrerProduction` (botPolicy partagé
 * — bot classique ET Jev via fusionnerPlan) + harnais/port (miroir exact
 * `appliquerVetoProduction`). `schemaVersion` 28 intacte.
 *
 * Géométrie des fixtures (pièges évités) : la ville pop 4 au seuil colon
 * subit DEJA le pivot escort (deciderProductionColon) quand un barbare est
 * proche du site par défaut — les cas ROUGES avant fix sont pop 1 + `poterie`
 * (③ bâtiment = grenier expansif en zone de siège), qui isolent le veto du
 * comportement escort préexistant.
 */
import { describe, expect, it } from 'vitest';
import { BOT_SETTINGS, UNIT_TYPES, canSetProduction, makeState } from '@game/rules';
import type { GameState, ProductionItem } from '@game/rules';
import { arbitrerProduction, vetoProductionDefensif } from '../src/botPolicy.js';
import { appliquerVetoProduction } from '../src/jev/joueur.js';

const ME = 'p1';
const ADV = 'p2';
const BAR = 'barbarien';
const ECO = BOT_SETTINGS.economie;

/** Ville SANS combattant sur la tuile, sans colon dans l'empire, techs
 * injectables. Le barbare b1 approche (défaut : adjacent — sous le rayon 2). */
function etatSiege(opts?: {
  barbare?: { q: number; r: number } | null;
  garnison?: boolean;
  pop?: number;
  techs?: string[];
}): GameState {
  const b = opts?.barbare === undefined ? { q: 7, r: 6 } : opts.barbare;
  const units: Array<{ id: string; type: string; owner: string; q: number; r: number }> = [];
  if (b) units.push({ id: 'b1', type: 'guerrier', owner: BAR, q: b.q, r: b.r });
  if (opts?.garnison) units.push({ id: 'g1', type: 'guerrier', owner: ME, q: 7, r: 7 });
  const s = makeState({
    width: 14,
    height: 14,
    players: [ME, ADV],
    rngSeed: 42,
    cities: [{ id: 'c1', q: 7, r: 7, owner: ME, pop: opts?.pop ?? 4, capital: true }],
    units,
  }) as GameState;
  if (opts?.techs) s.players[ME]!.techsUnlocked = [...opts.techs];
  return s;
}

function arbitre(s: GameState, opts?: { enGuerre?: boolean; menace?: boolean }): ProductionItem | null {
  return arbitrerProduction(s.cities['c1']!, s.players[ME]!, [s.cities['c1']!], s, ECO, opts?.enGuerre ?? false, opts?.menace ?? false);
}

describe('DEFENSE-VILLE-B · L3 — veto production défensive (arbitrerProduction)', () => {
  it('vetoProductionDefensif : menace d≤2 + déficit → ACTIF (rouge avant fix — symbole absent)', () => {
    const s = etatSiege();
    expect(vetoProductionDefensif(s, s.cities['c1']!, ME)).toBe(true);
  });

  it('BÂTIMENT refusé sous le siège : pop 1 + grenier dispo → guerrier (ROUGE avant fix — cas p03/p04 : production expansive pendant la guerre)', () => {
    const s = etatSiege({ pop: 1, techs: ['poterie'] });
    const item = arbitre(s);
    expect(item).toEqual({ kind: 'unit', id: 'guerrier' }); // avant fix : grenier (expansif)
  });

  it('ville menacée d≤2 au seuil colon → guerrier (cohérent avec le pivot escort préexistant)', () => {
    const s = etatSiege();
    const item = arbitre(s);
    expect(item).toEqual({ kind: 'unit', id: 'guerrier' });
    expect(UNIT_TYPES[item!.id]?.canAttack ?? false).toBe(true);
  });

  it('ville menacée MAIS garnison complète → production LIBRE (grenier passe — pas de veto)', () => {
    const s = etatSiege({ pop: 1, techs: ['poterie'], garnison: true });
    expect(vetoProductionDefensif(s, s.cities['c1']!, ME)).toBe(false);
    expect(arbitre(s)).toEqual({ kind: 'building', id: 'grenier' });
  });

  it('ville NON menacée → production libre bit-à-bit (colon au seuil pop 4)', () => {
    const s = etatSiege({ barbare: null });
    expect(vetoProductionDefensif(s, s.cities['c1']!, ME)).toBe(false);
    expect(arbitre(s)).toEqual({ kind: 'unit', id: 'colon' });
  });

  it('menace à d=3+ → PAS de veto (le rayon L5 est 2, le veto L3 suit le MÊME rayon canon)', () => {
    const s = etatSiege({ pop: 1, techs: ['poterie'], barbare: { q: 7, r: 4 } }); // 3 hex de MARCHE — hors portée 2
    expect(vetoProductionDefensif(s, s.cities['c1']!, ME)).toBe(false);
    expect(arbitre(s)).toEqual({ kind: 'building', id: 'grenier' });
  });

  it('MERVEILLE refusée au même titre que le colon (techs verrouillées : seule stonehenge restait — jamais expansive)', () => {
    const s = etatSiege({ pop: 1, garnison: true }); // déficit 0 → ④ merveille autrefois atteinte ; ici garnison → pas de veto
    const item = arbitre(s);
    // hors veto : le comportement préexistant est inchangé — l'assertion
    // porte sur la COHÉRENCE : sous veto, aucune merveille ne sort jamais.
    const sVeto = etatSiege({ pop: 1 }); // déficit → veto
    const itemVeto = arbitre(sVeto);
    expect(itemVeto?.kind).not.toBe('wonder');
    expect(itemVeto?.kind).not.toBe('building');
    expect(itemVeto).toEqual({ kind: 'unit', id: 'guerrier' });
    expect(item).toBeDefined();
  });

  it('sous veto, JAMAIS d\u2019item expansif quelle que soit la branche (30 seeds)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = etatSiege();
      s.rngSeed = seed;
      const item = arbitre(s);
      if (!item) continue;
      const expansif =
        item.kind === 'building' ||
        item.kind === 'wonder' ||
        (item.kind === 'unit' && (item.id === 'colon' || !(UNIT_TYPES[item.id]?.canAttack ?? false)));
      expect(expansif).toBe(false);
    }
  });

  it('déterminisme intégral (30 seeds) : même état de siège → même arbitrage', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = etatSiege();
      s.rngSeed = seed;
      expect(arbitre(s)).toEqual(arbitre(s));
    }
  });

  it('non-régression escortColon : hors siège, le chemin ② colon reste le chemin canon', () => {
    const s = etatSiege({ barbare: null });
    s.units['x1'] = { id: 'x1', type: 'colon', owner: ME, q: 9, r: 9, aboard: null, cargo: null } as never;
    // un colon VIVANT dans l'empire → ② ne re-produit PAS (condition existante,
    // intouchée par le veto) — le verdict doit rester hors colon.
    expect(arbitre(s)).not.toEqual({ kind: 'unit', id: 'colon' });
    // et sans colon vivant (fixture sans barbare) → colon (bit-à-bit).
    const s2 = etatSiege({ barbare: null });
    expect(arbitre(s2)).toEqual({ kind: 'unit', id: 'colon' });
  });

  it('le pivot respecte canSetProduction du moteur (guerrier productible sur la fixture)', () => {
    const s = etatSiege();
    const me = s.players[ME]!;
    expect(canSetProduction({ kind: 'unit', id: 'guerrier' } as ProductionItem, me.techsUnlocked ?? [], s.cities['c1']!.buildings ?? [], me.civId)).toBe(true);
  });
});

describe('DEFENSE-VILLE-B · L3 — miroir harnais/port `appliquerVetoProduction`', () => {
  it('un SetProduction expansif sur ville menacée-déficiente devient guerrier (miroir p03 : colon t34 pendant le siège)', () => {
    const s = etatSiege();
    const ordres = [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'colon' } }];
    const { ordres: vete } = appliquerVetoProduction(ordres as never, s, ME);
    expect(vete).toEqual([{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }]);
  });

  it('un BÂTIMENT expansif est vetoé au même titre que le colon', () => {
    const s = etatSiege();
    const ordres = [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'grenier' } }];
    const { ordres: vete } = appliquerVetoProduction(ordres as never, s, ME);
    expect(vete).toEqual([{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }]);
  });

  it('une MERVEILLE expansive est vetoée au même titre que le colon', () => {
    const s = etatSiege();
    const ordres = [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'stonehenge' } }];
    const { ordres: vete } = appliquerVetoProduction(ordres as never, s, ME);
    expect(vete).toEqual([{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }]);
  });

  it('item MILITAIRE conservé tel quel (la poussée finPartie ne passe pas par le veto)', () => {
    const s = etatSiege();
    const ordres = [
      { type: 'Move', unitId: 'u9', path: [{ q: 8, r: 7 }] },
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } },
    ];
    const { ordres: vete } = appliquerVetoProduction(ordres as never, s, ME);
    expect(vete).toEqual(ordres);
  });

  it('ville NON menacée → ordres intacts bit-à-bit (plusieurs SetProduction conservés)', () => {
    const s = etatSiege({ barbare: null });
    const ordres = [
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'colon' } },
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'grenier' } },
    ];
    const { ordres: vete } = appliquerVetoProduction(ordres as never, s, ME);
    expect(vete).toEqual(ordres);
  });

  it('composition L5 : produireGuerrier Jev + veto = MÊME ordre, JAMAIS double (dernier gagne sur la ville vetoée)', () => {
    const s = etatSiege();
    const ordres = [
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'colon' } }, // question produire
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }, // L5 produireGuerrier
    ];
    const { ordres: vete } = appliquerVetoProduction(ordres as never, s, ME);
    expect(vete.length).toBe(1);
    expect(vete[0]).toEqual({ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } });
  });

  it('attentes alignées : une attente de production remplacée suit le pivot (audit cohérent)', () => {
    const s = etatSiege();
    const ordres = [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'colon' } }];
    const attentes = [{ genre: 'production', cityId: 'c1', item: 'unit:colon' }];
    const res = appliquerVetoProduction(ordres as never, s, ME, attentes as never);
    expect(res.attentes).toEqual([{ genre: 'production', cityId: 'c1', item: 'unit:guerrier' }]);
    expect(res.ordres).toEqual([{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }]);
  });

  it('ville d\u2019un AUTRE joueur → ordre intact (le veto ne juge que MES villes)', () => {
    const s = etatSiege();
    const ordres = [{ type: 'SetProduction', cityId: 'cX', item: { kind: 'unit', id: 'colon' } }];
    const { ordres: vete } = appliquerVetoProduction(ordres as never, s, ME);
    expect(vete).toEqual(ordres);
  });
});
