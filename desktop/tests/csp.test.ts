import { describe, expect, it } from 'vitest';
import { cspPolicyFor } from '../src/csp';

describe('cspPolicyFor', () => {
  it('autorise la WebSocket wss vers le serveur de jeu en prod', () => {
    const p = cspPolicyFor('https://game-4x-server-prod.erik-ai-studio.workers.dev');
    expect(p).toContain("connect-src 'self' wss://game-4x-server-prod.erik-ai-studio.workers.dev");
    expect(p).toContain("default-src 'self'");
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
  });

  it("passer en ws:// pour un serveur de dev http (l'inline script du client exige unsafe-inline)", () => {
    const p = cspPolicyFor('http://localhost:5174');
    expect(p).toContain('ws://localhost:5174');
    expect(p).not.toContain('wss:');
    expect(p).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(p).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("unsafe-eval présent : PixiJS 8 génère ses shaders via new Function (sans lui, carte noire)", () => {
    const p = cspPolicyFor('https://game-4x-server-prod.erik-ai-studio.workers.dev');
    expect(p).toContain("'unsafe-eval'");
  });

  it("ne fuite pas vers d'autres hôtes", () => {
    const p = cspPolicyFor('https://game-4x-server-prod.erik-ai-studio.workers.dev');
    expect(p).not.toContain('google');
    expect(p).not.toContain('discord');
  });
});
