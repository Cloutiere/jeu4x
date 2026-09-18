/**
 * HANDOFF-TRACE-RESOLUTION — la trace de résolution dans le VRAI jeu :
 * chaque résolution du GameDO collecte une trace (instrumentation passive),
 * consultable via l'endpoint admin `/admin/game/:code/trace` (même protection
 * ADMIN_TOKEN que le dump). Verrous : disponibilité après résolution, JSON
 * complet (phases A/B/C/E + rolls), rendu lisible, zéro impact gameplay
 * (la résolution elle-même est verrouillée bit à bit par les tests moteur).
 */
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, Snapshot, TurnResult } from '@game/shared';
import { ADMIN_TOKEN, createGame, gameNamespace, joinGame, makeToken, openGameSocket } from './helpers.js';

const NO_TIMER: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: true };
const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

async function tourResolu() {
  const code = await createGame(ALICE, NO_TIMER);
  await joinGame(BOB, code);
  const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
  const bob = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
  await alice.waitFor('Snapshot');
  await bob.waitFor('Snapshot');
  alice.send({ type: 'EndTurn' });
  bob.send({ type: 'EndTurn' });
  const resultat = (await alice.waitFor('TurnResult')) as TurnResult;
  await bob.close();
  return { code, resultat, stub: gameNamespace.get(gameNamespace.idFromName(code)) };
}

function traceFetch(code: string, query = ''): Promise<Response> {
  // Via SELF (même chaîne que adminDump — cf. helpers) : le Worker route
  // /admin/game/:code/trace vers le DO avec la protection ADMIN_TOKEN.
  return fetchTrace(`/admin/game/${code}/trace${query}`);
}

// helpers.ts n'expose pas SELF : on passe par l'import vitest-poolworkers.
import { SELF } from 'cloudflare:test';
function fetchTrace(path: string): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

describe('TRACE · trace de résolution du vrai jeu (GameDO)', () => {
  it('après une résolution, l’endpoint admin liste le tour et sert la trace complète', async () => {
    const { code, stub } = await tourResolu();

    // Index : le tour résolu (tour 0 du moteur) est disponible.
    const resIndex = await traceFetch(code);
    expect(resIndex.status).toBe(200);
    const index = (await resIndex.json()) as { tours: number[] };
    expect(index.tours).toContain(0);

    // Trace complète : phases A/B/C/E, décisions, rolls, rendu lisible.
    const resTrace = await traceFetch(code, '?turn=0');
    expect(resTrace.status).toBe(200);
    const rep = (await resTrace.json()) as {
      tours: number[];
      trace: { tour: number; seed: number; phases: Array<{ phase: string; entree: unknown[]; sortie: unknown[]; decisions: unknown[] }>; rolls: Array<{ index: number; valeur: number; usage: string }> };
      lisible: string[];
    };
    expect(rep.trace.tour).toBe(0);
    expect(rep.trace.phases.map((p) => p.phase)).toEqual(['A', 'B', 'C', 'E']);
    expect(rep.trace.phases[0]!.entree.length).toBeGreaterThan(0);
    expect(rep.lisible.some((l) => l.includes('Phase A'))).toBe(true);
    // La graine de la trace est celle du motif de résolution (rejouable).
    expect(typeof rep.trace.seed).toBe('number');
    void stub;
  });

  it('sans résolution, l’index est vide ; un tour inconnu répond 404', async () => {
    const code = await createGame(ALICE, NO_TIMER);
    await joinGame(BOB, code);
    const resIndex = await traceFetch(code);
    const index = (await resIndex.json()) as { tours: number[] };
    expect(index.tours).toEqual([]);

    const res404 = await traceFetch(code, '?turn=99');
    expect(res404.status).toBe(404);
  });

  it('l’endpoint est protégé par ADMIN_TOKEN', async () => {
    const code = await createGame(ALICE, NO_TIMER);
    const res = await SELF.fetch(`https://example.com/admin/game/${code}/trace`);
    expect(res.status).toBe(401);
  });
});
