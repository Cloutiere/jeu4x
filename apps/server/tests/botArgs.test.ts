import { describe, expect, it } from 'vitest';
import { parseBotArgs } from '../src/botArgs.mjs';

describe('L2 · parseBotArgs (régression `pnpm bot --`)', () => {
  it('filtre le `--` transmis littéralement par pnpm', () => {
    expect(parseBotArgs(['--', 'ABC123', 'Bot'])).toEqual({ code: 'ABC123', valid: true, name: 'Bot' });
  });

  it('fonctionne aussi sans `--` (appel direct node)', () => {
    expect(parseBotArgs(['ABC123'])).toEqual({ code: 'ABC123', valid: true, name: 'Bot' });
  });

  it('rejette un code invalide ou absent', () => {
    expect(parseBotArgs(['--', 'NOPE']).valid).toBe(false);
    expect(parseBotArgs(['--']).valid).toBe(false);
    expect(parseBotArgs([]).valid).toBe(false);
  });

  it('nom par défaut : Bot', () => {
    expect(parseBotArgs(['--', 'ABC123']).name).toBe('Bot');
  });
});
