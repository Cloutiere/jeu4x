/**
 * GODMODE-BOUTON (Erik 04/11) — bouton god mode dans la barre DEV + chord
 * Ctrl+J→G (l'ancien W ferme l'onglet en navigateur, il n'est PLUS écouté).
 * Helpers purs (lib/godmode.ts) + câblage Game.svelte (canon ui-jeu-t3).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { actionGodMode, autreHumainPresent, GODMODE_FENETRE_MS } from '../src/lib/godmode.js';

describe('GODMODE-BOUTON · garde de visibilité (D3 — miroir du refus serveur)', () => {
  const moi = { id: 'p1', bot: false };
  const bot = { id: 'b1', bot: true };

  it('solo (aucun autre joueur) → pas d’autre humain', () => {
    expect(autreHumainPresent([], 'p1')).toBe(false);
    expect(autreHumainPresent([moi], 'p1')).toBe(false);
  });

  it('solo/bots (adversaires bots) → pas d’autre humain', () => {
    expect(autreHumainPresent([moi, bot], 'p1')).toBe(false);
  });

  it('multi humain → gardé (bouton caché, chord sans effet UI)', () => {
    const autre = { id: 'p2', bot: false };
    expect(autreHumainPresent([moi, autre], 'p1')).toBe(true);
    expect(autreHumainPresent([moi, autre, bot], 'p1')).toBe(true);
  });

  it('joueur non identifié (playerId null) → pas d’autre humain (garde serveur tranche)', () => {
    expect(autreHumainPresent([bot], null)).toBe(false);
  });
});

describe('GODMODE-BOUTON · chord Ctrl+J→G (D2)', () => {
  const T0 = 1_000_000;

  it('Ctrl+J arme le chord', () => {
    expect(actionGodMode('j', true, false, false, 0, T0)).toBe('armer');
    // Alt/Meta (autre raccourci) n’arment PAS.
    expect(actionGodMode('j', true, true, false, 0, T0)).toBeNull();
    expect(actionGodMode('j', true, false, true, 0, T0)).toBeNull();
    expect(actionGodMode('j', false, false, false, 0, T0)).toBeNull();
  });

  it('G dans la fenêtre → bascule', () => {
    expect(actionGodMode('g', false, false, false, T0, T0 + GODMODE_FENETRE_MS - 1)).toBe('basculer');
  });

  it('G hors fenêtre, ou sans chord armé → rien', () => {
    expect(actionGodMode('g', false, false, false, T0, T0 + GODMODE_FENETRE_MS + 1)).toBeNull();
    expect(actionGodMode('g', false, false, false, 0, T0)).toBeNull();
  });

  it('D2 — W n’est PLUS écouté (Ctrl+W ferme l’onglet en navigateur)', () => {
    expect(actionGodMode('w', false, false, false, T0, T0 + 10)).toBeNull();
    expect(actionGodMode('w', true, false, false, T0, T0 + 10)).toBeNull();
  });
});

describe('GODMODE-BOUTON · câblage Game.svelte', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/pages/Game.svelte'), 'utf8');
  const barreDev = src.slice(src.indexOf('{#if $calqueDev}'), src.indexOf('{/if}', src.indexOf('<HudPerf />')));

  it('D1 — le bouton « God mode » est dans la barre DEV et appelle la MÊME bascule que le chord', () => {
    expect(barreDev).toContain('God mode');
    expect(barreDev).toContain('onclick={basculerGodMode}');
    // Une seule fonction de bascule : chord ET bouton passent par elle.
    expect(src.match(/basculerGodMode/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('client.toggleGodMode(!v.godMode)');
  });

  it('D3 — bouton visible solo/bots uniquement (garde autreHumainPresent, partie active requise)', () => {
    expect(barreDev).toContain('{#if $view.state && !autreHumainPresent($view.players, $view.playerId)}');
  });

  it('D1 — bouton à état (actif quand le serveur confirme godMode)', () => {
    expect(barreDev).toContain('class:active-toggle={$view.godMode}');
  });

  it('D2 — le handler ne capte plus W ; les autres raccourcis F/H/S/Z/B/Espace intacts', () => {
    const handler = src.slice(src.indexOf('function raccourciGodMode'), src.indexOf('const client: GameClient'));
    expect(handler).not.toMatch(/'w'/);
    expect(handler).toContain("action === 'basculer'");
    const ordres = src.slice(src.indexOf('function raccourciOrdreUnite'), src.indexOf('// GOD-MODE'));
    expect(ordres).toContain("'f', 'h', 's', 'z', ' ', 'b'");
  });
});
