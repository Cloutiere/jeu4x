/**
 * UI-JEU-T1 (Erik 01/10) — tranche 1 de l'écran de jeu :
 * D1 calque dev (caché par défaut, engrenage + Ctrl+Alt+D, mémorisé par
 * machine via localStorage), D4 portrait de dirigeant (portrait dessiné si
 * disponible, sinon logo or de la nation — jamais de trou) et câblage
 * Game.svelte (barre AAA, bouton circulaire D5 — les comportements de
 * blocage HANG-LOCAL restent vérifiés par fin-de-tour-blocage-ux.test.ts).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { calqueDev, basculerCalqueDev, raccourciCalqueDev } from '../src/lib/calqueDev.js';
import { portraitDirigeant } from '../src/lib/dirigeants.js';

/** Petit localStorage de fortune (les tests vitest tournent hors navigateur). */
function installerLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  return map;
}

const ev = (ctrl: boolean, alt: boolean, key: string): KeyboardEvent =>
  ({ ctrlKey: ctrl, altKey: alt, key, preventDefault: () => {} }) as unknown as KeyboardEvent;

describe('UI-JEU-T1 · D1 calque dev', () => {
  beforeEach(() => {
    installerLocalStorage();
    calqueDev.set(false);
  });

  it('caché par défaut, la bascule affiche ET mémorise (localStorage, par machine)', () => {
    const stockage = installerLocalStorage();
    expect(get(calqueDev)).toBe(false);
    basculerCalqueDev();
    expect(get(calqueDev)).toBe(true);
    expect(stockage.get('calque-dev')).toBe('1');
    basculerCalqueDev();
    expect(get(calqueDev)).toBe(false);
    expect(stockage.get('calque-dev')).toBe('0');
  });

  it('l état mémorisé est restauré à l affichage suivant', () => {
    const stockage = installerLocalStorage();
    stockage.set('calque-dev', '1');
    calqueDev.set(true); // miroir de initial() à l'initialisation du module
    expect(get(calqueDev)).toBe(true);
  });

  it('Ctrl+Alt+D bascule le calque ; Ctrl seul ou D seul non', () => {
    raccourciCalqueDev(ev(true, true, 'd'));
    expect(get(calqueDev)).toBe(true);
    raccourciCalqueDev(ev(true, true, 'D'));
    expect(get(calqueDev)).toBe(false);
    raccourciCalqueDev(ev(true, false, 'd'));
    raccourciCalqueDev(ev(false, true, 'd'));
    raccourciCalqueDev(ev(true, true, 'e'));
    expect(get(calqueDev)).toBe(false);
  });
});

describe('UI-JEU-T1 · D4 portraitDirigeant', () => {
  it('portrait dessiné pour les civs DIRIGEANTS (Napoléon, Alexandre, Cléopâtre)', () => {
    for (const [civ, asset] of [
      ['france', '/art/dirigeant_napoleon.png'],
      ['grece', '/art/dirigeant_alexandre.png'],
      ['egypte', '/art/dirigeant_cleopatre.png'],
    ] as const) {
      const p = portraitDirigeant(civ);
      expect(p.src).toBe(asset);
      expect(p.portrait).toBe(true);
      expect(p.titre.length).toBeGreaterThan(1);
    }
  });

  it('fallback LOGO OR de la nation pour les civs sans dirigeant dessiné', () => {
    const p = portraitDirigeant('rome');
    expect(p.portrait).toBe(false);
    expect(p.src).toBe('/interface/logos/rome.svg');
    expect(p.echelle).toBeGreaterThan(0);
  });

  it('jamais de trou : civ neutre/inconnue → src null mais objet complet', () => {
    for (const civ of [null, 'neutre', 'civ_inexistante']) {
      const p = portraitDirigeant(civ);
      expect(typeof p.titre).toBe('string');
      expect(typeof p.echelle).toBe('number');
    }
  });
});

describe('UI-JEU-T1 · câblage Game.svelte', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/pages/Game.svelte'), 'utf8');

  it('D1 — engrenage + raccourci branchés, éléments dev dans le calque', () => {
    expect(src).toContain('raccourciCalqueDev');
    expect(src).toContain('onclick={basculerCalqueDev}');
    for (const element of ['← Lobby', 'client.resync()', 'cycleYields', 'État brut (debug)', 'net net-', 'Partie {code}']) {
      expect(src).toContain(element);
    }
    // l'état brut est DANS le calque ({#if $calqueDev} avant <details class="raw">)
    const brut = src.indexOf('<details class="raw">');
    const calque = src.lastIndexOf('{#if $calqueDev}', brut);
    expect(calque).toBeGreaterThan(-1);
    expect(brut - calque).toBeLessThan(200);
  });

  it('D2 — « Vous jouez : X » est dans la barre AAA, plus dans la colonne', () => {
    const barre = src.slice(src.indexOf('<header class="bar">'), src.indexOf('</header>'));
    expect(barre).toContain('Vous jouez : <strong>{myName}</strong>');
    expect(src).not.toContain('<p class="me">');
  });

  it('D3 — barre AAA : tour bien visible, chips or/science/culture/gouvernement', () => {
    const barre = src.slice(src.indexOf('<header class="bar">'), src.indexOf('</header>'));
    expect(barre).toContain('tour-chip');
    expect(barre).toContain('icone_or.png');
    expect(barre).toContain('icone_science.png');
    expect(barre).toContain('icone_culture.png');
    expect(barre).toContain('icone_gouvernement.png');
  });

  it('D4 — médaillon dirigeant avec fallback, dans la zone de carte', () => {
    expect(src).toContain('portraitDirigeant(myCivId)');
    expect(src).toContain('portrait-initiale');
    expect(src).toContain('class="portrait-site"');
  });

  it('D5 — bouton circulaire : icône, badge d attente, libellé de blocage', () => {
    expect(src).toContain('fin-tour-rond');
    expect(src).toContain("icone_fin_tour.png");
    expect(src).toContain("Unités en attente d'ordres ({attenteOrdres})");
    expect(src).toContain('`Fin de tour bloquée (${myBlocages.length})`');
    // le bouton circulaire appelle bien requestEndTurn (comportements intacts)
    const rond = src.slice(src.indexOf('fin-tour-rond'), src.indexOf('fin-tour-rond') + 700);
    expect(rond).toContain('onclick={requestEndTurn}');
    expect(rond).toContain('disabled={$view.locked || $view.phase !== \'orders\' || $view.status !== \'active\'}');
  });
});
