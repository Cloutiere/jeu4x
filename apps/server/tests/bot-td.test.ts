/**
 * BOT-TD (décisions Erik 24/10) — difficulté du bot :
 *  - normalisation (L1) : valeur absente/inconnue ⇒ repli « normal » ;
 *  - profil appliqué (D2) : profileDuBot(difficulté) lit bot.json, et
 *    botPolicy TRIE la difficulté (recherche orientée + garnisons) ;
 *  - lobby → meta → GameDO (D1) : la difficulté choisie à la création est
 *    stockée (solo ET config 5 sièges), exposée au Welcome (bandeau
 *    « Bot 🤖 · Difficile »), inconnue ⇒ repli normal ;
 *  - banc déterministe (D3) : même corpus ⇒ mêmes chiffres bit à bit.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTES_BOT, normaliseDifficulteBot } from '@game/shared';
import type { GameCreationSettings } from '@game/shared';
import { BOT_SETTINGS, createRng, makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import { adminDump, createGame, makeToken, openGameSocket } from './helpers.js';
import { assignerObjectifs, botPolicy, prochaineTech, profileDuBot } from '../src/botPolicy.js';
import { simulerPartie } from '../src/bancBotTd.js';

const SOLO: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true };

describe('BOT-TD · L1 — normalisation de la difficulté', () => {
  it('les trois valeurs du domaine passent telles quelles', () => {
    expect([...DIFFICULTES_BOT]).toEqual(['facile', 'normal', 'difficile']);
    expect(normaliseDifficulteBot('facile')).toBe('facile');
    expect(normaliseDifficulteBot('normal')).toBe('normal');
    expect(normaliseDifficulteBot('difficile')).toBe('difficile');
  });
  it('toute valeur absente ou inconnue retombe sur « normal »', () => {
    expect(normaliseDifficulteBot(undefined)).toBe('normal');
    expect(normaliseDifficulteBot(null)).toBe('normal');
    expect(normaliseDifficulteBot('')).toBe('normal');
    expect(normaliseDifficulteBot('impossible')).toBe('normal');
    expect(normaliseDifficulteBot(42)).toBe('normal');
  });
});

describe('BOT-TD · D2 — profil appliqué (bot.json)', () => {
  it('profileDuBot lit le profil demandé ; sans argument = profil global (normal)', () => {
    expect(profileDuBot('facile')).toEqual(BOT_SETTINGS.profiles.facile);
    expect(profileDuBot('difficile')).toEqual(BOT_SETTINGS.profiles.difficile);
    expect(profileDuBot()).toEqual(BOT_SETTINGS.profiles[BOT_SETTINGS.profil]);
    expect(profileDuBot('inconnu')).toEqual(BOT_SETTINGS.profiles[BOT_SETTINGS.profil]);
  });

  it('la difficulté TRIE la recherche : difficile (militaire) ne choisit pas comme normal (auto)', () => {
    const etat: GameState = makeState({ width: 8, height: 8, players: ['p1', 'p2'] });
    const recherche = (difficulte: string): string | null =>
      botPolicy(etat, 'p1', createRng(1), difficulte).actions.find((a) => a.type === 'SetResearch')?.techId ?? null;
    const normal = recherche('normal');
    const difficile = recherche('difficile');
    expect(normal).not.toBeNull();
    expect(difficile).not.toBeNull();
    // Chaîne « militaire » : le choix correspond exactement à l'arbitre D3
    // (prochaineTech) alimenté par le profil difficile.
    expect(difficile).toBe(prochaineTech(etat.players.p1!, profileDuBot('difficile'), BOT_SETTINGS.economie));
    // Les objectifs de recherche des profils DIFFÈRENT (auto ≠ militaire).
    expect(normal).not.toBe(difficile);
  });

  it('la difficulté TRIE les garnisons : capitale tenue plus fermement en difficile', () => {
    const etat: GameState = makeState({
      width: 8,
      height: 8,
      players: ['p1', 'p2'],
      units: [
        { id: 'g1', type: 'guerrier', owner: 'p1', q: 2, r: 2, aboard: null, cargo: null },
        { id: 'g2', type: 'guerrier', owner: 'p1', q: 2, r: 2, aboard: null, cargo: null },
        { id: 'g3', type: 'guerrier', owner: 'p1', q: 2, r: 2, aboard: null, cargo: null },
        // BOT-MARCHE D3 : la conscription exige l'urgence capitale (menace).
        { id: 'x1', type: 'guerrier', owner: 'barbarien', q: 2, r: 5, aboard: null, cargo: null },
      ],
      cities: [{ id: 'c1', owner: 'p1', q: 2, r: 2, capital: true }],
      warPairs: [], // BOT-MARCHE D3 : conscription de garnison = urgence paix
    });
    const enGarnison = (difficulte: string): number => {
      const objectifs = assignerObjectifs(etat, 'p1', profileDuBot(difficulte));
      return [...objectifs.values()].filter((o) => o.kind === 'garnison').length;
    };
    // 2 défenseurs présents : quota normal (2) comblé, quota difficile (3) non.
    expect(enGarnison('normal')).toBe(0);
    expect(enGarnison('difficile')).toBe(1);
  });
});

describe('BOT-TD · D1 — difficulté au lobby → meta → Welcome', () => {
  it('le choix « difficile » d\u2019une partie solo traverse lobby et GameDO, exposé au Welcome', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, { ...SOLO, botDifficulte: 'difficile' });
    const dump = await adminDump(code);
    expect(dump.meta?.settings?.botDifficulte).toBe('difficile');
    const token = await makeToken('dev:alice', 'Alice');
    const ws = await openGameSocket(code, token);
    const welcome = await ws.waitFor('Welcome');
    if (welcome.type !== 'Welcome') return;
    expect(welcome.botDifficulte).toBe('difficile');
    ws.close();
  });

  it('une difficulté inconnue est stockée « normal » (repli — reprise cohérente)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, {
      ...SOLO,
      botDifficulte: 'strategique',
    } as unknown as GameCreationSettings);
    const dump = await adminDump(code);
    expect(dump.meta?.settings?.botDifficulte).toBe('normal');
  });

  it('sans choix, la meta ne porte pas de difficulté et le Welcome répond « normal »', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const dump = await adminDump(code);
    expect(dump.meta?.settings?.botDifficulte).toBeUndefined();
    const token = await makeToken('dev:alice', 'Alice');
    const ws = await openGameSocket(code, token);
    const welcome = await ws.waitFor('Welcome');
    if (welcome.type !== 'Welcome') return;
    expect(welcome.botDifficulte).toBe('normal');
    ws.close();
  });

  it('la voie structurée (5 sièges) porte aussi la difficulté du créateur', async () => {
    const config = {
      sieges: ['bleu-saphir', 'rouge-royal', 'vert-emeraude', 'jaune-dor', 'cuivre-ardent'].map((paletteId, i) => ({
        type: i === 0 ? ('humain' as const) : ('bot' as const),
        paletteId,
      })),
      civsAleatoires: true,
      topographie: 'archipel',
    };
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, {
      mapId: 'procedural-40',
      turnTimerMinutes: null,
      isPublic: false,
      config,
      botDifficulte: 'facile',
    });
    const dump = await adminDump(code);
    expect(dump.meta?.settings?.botDifficulte).toBe('facile');
  });
});

describe('BOT-TD · D3 — banc déterministe', () => {
  it('même (difficulté, seed, tours) ⇒ mesures identiques bit à bit', () => {
    const a = simulerPartie('normal', 20261025, 4);
    const b = simulerPartie('normal', 20261025, 4);
    expect(b).toEqual(a);
  });
  it('les trois difficultés produisent des mesures complètes (parties courtes)', () => {
    for (const d of ['facile', 'normal', 'difficile'] as const) {
      const m = simulerPartie(d, 20261026, 3);
      expect(m.tours).toBeGreaterThan(0);
      expect(m.villes).toBeGreaterThan(0);
      expect(m.techs).toBeGreaterThanOrEqual(0);
    }
  });
});
