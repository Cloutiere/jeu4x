/**
 * HANDOFF-RESOLUTION-DEPLACEMENTS §4 — historique d'événements persistant.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { EVENT_HISTORY_MAX, eventHistory, pushHistory, resetHistory } from '../src/lib/eventHistory.js';

describe('historique d\'événements (menu de droite)', () => {
  beforeEach(() => resetHistory());

  it('accumule les entrées chronologiquement avec horodatage de tour', () => {
    pushHistory('Ordre non exécuté (u1) : Déplacement impossible', 'bad', 3);
    pushHistory(' Une hutte a été ouverte : +50 or', 'good', 4);
    const list = get(eventHistory);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ turn: 3, kind: 'bad' });
    expect(list[1]).toMatchObject({ turn: 4, kind: 'good' });
  });

  it('plafonne l\'historique (FIFO — les plus anciennes entrées sont éjectées)', () => {
    for (let i = 0; i < EVENT_HISTORY_MAX + 10; i++) pushHistory(`événement ${i}`, 'info', i);
    const list = get(eventHistory);
    expect(list).toHaveLength(EVENT_HISTORY_MAX);
    expect(list[0]!.text).toBe(`événement ${10}`);
    expect(list.at(-1)!.text).toBe(`événement ${EVENT_HISTORY_MAX + 9}`);
  });
});
