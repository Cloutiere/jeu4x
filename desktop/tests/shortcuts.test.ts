import { describe, expect, it } from 'vitest';
import { shortcutDecision, type KeyEvent } from '../src/shortcuts';

const PROD = { devtoolsAllowed: false };
const DEV = { devtoolsAllowed: true };

function key(partial: Partial<KeyEvent>): KeyEvent {
  return { key: '', control: false, shift: false, alt: false, meta: false, ...partial };
}

describe('shortcutDecision', () => {
  it('bloque le rechargement navigateur', () => {
    expect(shortcutDecision(key({ key: 'r', control: true }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: 'R', control: true, shift: true }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: 'F5' }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: 'r', meta: true }), PROD)).toBe('block'); // Cmd+R si portage macOS
  });

  it('bloque le zoom clavier (le canvas PixiJS a son propre zoom)', () => {
    expect(shortcutDecision(key({ key: '=', control: true }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: '+', control: true }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: '-', control: true }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: '0', control: true }), PROD)).toBe('block');
  });

  it('F11 bascule le plein écran, Échap le quitte (letterbox)', () => {
    expect(shortcutDecision(key({ key: 'F11' }), PROD)).toBe('fullscreen-toggle');
    expect(shortcutDecision(key({ key: 'F11', control: true }), PROD)).toBe('allow');
    expect(shortcutDecision(key({ key: 'Escape' }), PROD)).toBe('fullscreen-exit');
  });

  it('bloque les DevTools en prod, les laisse en dev', () => {
    expect(shortcutDecision(key({ key: 'F12' }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: 'I', control: true, shift: true }), PROD)).toBe('block');
    expect(shortcutDecision(key({ key: 'F12' }), DEV)).toBe('allow');
    expect(shortcutDecision(key({ key: 'I', control: true, shift: true }), DEV)).toBe('allow');
  });

  it("laisse passer les touches du jeu", () => {
    expect(shortcutDecision(key({ key: 'a' }), PROD)).toBe('allow');
    expect(shortcutDecision(key({ key: 'ArrowLeft' }), PROD)).toBe('allow');
    expect(shortcutDecision(key({ key: 'Enter', shift: true }), PROD)).toBe('allow');
    expect(shortcutDecision(key({ key: 'c', control: true }), PROD)).toBe('allow'); // copie locale OK
  });
});
