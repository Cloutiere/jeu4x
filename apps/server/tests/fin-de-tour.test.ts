/**
 * FIN-DE-TOUR-PRODUCTION (spécification d'Erik du 18/09) — le serveur REJETTE
 * le EndTurn tant qu'une ville à marteaux (production/tour > 0 ou réserve C7)
 * n'a pas de production sélectionnée (état OU brouillon SetProduction — les
 * ordres ne sont appliqués qu'à la résolution), ou que la science / le
 * résiduel `scienceStored` attend sans recherche sélectionnée (R-134
 * confirmée : le surplus de complétion reste converti en or — le résiduel
 * vient des points SANS recherche, ex. bonus de hutte). Le prédicat pur est
 * testé côté moteur (packages/rules/tests/fin-de-tour.test.ts) ; ici : le
 * refus bout en bout.
 */
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, Order, Snapshot, TurnResult } from '@game/shared';
import { adminDump, createGame, joinGame, makeToken, openGameSocket, type TestSocket } from './helpers.js';

const NO_TIMER: GameCreationSettings = { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: true };

const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

type Socket = Awaited<ReturnType<typeof openGameSocket>>;

/** Soumet un ordre et consomme son accusé (rejet inattendu → erreur claire). */
async function soumettre(sock: TestSocket, order: Order): Promise<void> {
  sock.send({ type: 'SubmitOrder', order });
  const ack = (await sock.waitFor('OrderAck')) as { accepted: boolean; reason: string | null };
  if (!ack.accepted) throw new Error(`ordre ${order.type} rejeté : ${ack.reason}`);
}

/** Résout le tour courant (EndTurn des deux joueurs, accusés consommés). */
async function resoudre(alice: Socket, bob: Socket): Promise<TurnResult> {
  alice.send({ type: 'EndTurn' });
  const ackA = (await alice.waitFor('OrderAck')) as { accepted: boolean; reason: string | null };
  if (!ackA.accepted) throw new Error(`EndTurn alice inattendu rejeté : ${ackA.reason}`);
  bob.send({ type: 'EndTurn' });
  const ackB = (await bob.waitFor('OrderAck')) as { accepted: boolean; reason: string | null };
  if (!ackB.accepted) throw new Error(`EndTurn bob inattendu rejeté : ${ackB.reason}`);
  const result = (await alice.waitFor('TurnResult')) as TurnResult;
  await bob.waitFor('TurnResult');
  return result;
}

describe('FIN-DE-TOUR-PRODUCTION · EndTurn rejeté puis débloqué', () => {
  it('ville à marteaux sans production → rejet ; après SetProduction (brouillon) + SetResearch → résolution', async () => {
    const code = await createGame(ALICE, { ...NO_TIMER });
    await joinGame(BOB, code);
    const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
    const bob = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
    await alice.waitFor('Welcome');
    const snapA = (await alice.waitFor('Snapshot')) as Snapshot;
    await bob.waitFor('Welcome');
    const snapB = (await bob.waitFor('Snapshot')) as Snapshot;
    // Fog : chaque socket ne voit que ses propres unités.
    const colonA = Object.values(snapA.state.units).find((u) => u.type === 'colon')!;
    const colonB = Object.values(snapB.state.units).find((u) => u.type === 'colon')!;

    // Tour 1 : fondation des capitales (pop 2, deux citoyens auto-assignés
    // aux cases de nourriture → production 0 au départ).
    await soumettre(alice, { type: 'FoundCity', unitId: colonA.id });
    await soumettre(bob, { type: 'FoundCity', unitId: colonB.id });
    let result = await resoudre(alice, bob);
    const dump0 = await adminDump(code);
    expect(Object.keys(dump0.state?.cities ?? {}).length).toBe(2); // fondations OK
    const cityId = 'c1'; // p1 a fondé en premier (ordre des cityIds R-81)
    const city = result.state.cities[cityId]!;
    expect(city.owner).toBe('p1');

    // Tour 2 : alice désassigne un citoyen (le dernier assigné part, sans
    // re-remplissage — règle d'Erik). À la résolution, ce citoyen devient
    // INTÉRIEUR (tranche Ouvrier : +1 marteau/tour) — la ville produit
    // désormais des marteaux de façon persistée.
    await soumettre(alice, { type: 'SetWorkedTile', cityId, tile: null });
    result = await resoudre(alice, bob);
    expect(result.state.cities[cityId]!.workedTiles.length).toBe(1);
    expect(result.state.cities[cityId]!.production).toBeNull();

    // Tour 4 : la ville produit des marteaux SANS production sélectionnée →
    // le EndTurn est rejeté avec la liste des blocages, le joueur n'est PAS
    // verrouillé et peut encore passer des ordres.
    alice.send({ type: 'EndTurn' });
    const refus = (await alice.waitFor('OrderAck')) as { type: string; accepted: boolean; reason: string | null };
    expect(refus.accepted).toBe(false);
    expect(refus.reason).toContain('fin de tour bloquée');
    expect(refus.reason).toContain('sélectionnez une production');
    const dump1 = await adminDump(code);
    expect(dump1.locked['p1']).toBe(false);

    // Déblocage : production sélectionnée (brouillon SetProduction suffit —
    // même source que l'aperçu UI) + recherche sélectionnée.
    await soumettre(alice, { type: 'SetProduction', cityId, item: { kind: 'unit', id: 'guerrier' } });
    alice.send({ type: 'SetResearch', techId: 'alphabet' });
    const ackRech = (await alice.waitFor('OrderAck')) as { accepted: boolean };
    expect(ackRech.accepted).toBe(true);
    result = await resoudre(alice, bob);
    expect(result.events.some((e) => e.type === 'TurnResolved')).toBe(true);
  });

  it('partie fraîche (aucune ville propre à marteaux) : EndTurn accepté — pas de régression', async () => {
    const code = await createGame(ALICE, { ...NO_TIMER });
    await joinGame(BOB, code);
    const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
    const bob = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
    await alice.waitFor('Welcome');
    await alice.waitFor('Snapshot');
    await bob.waitFor('Welcome');
    await bob.waitFor('Snapshot');
    const result = await resoudre(alice, bob);
    expect(result.events.some((e) => e.type === 'TurnResolved')).toBe(true);
  });
});
