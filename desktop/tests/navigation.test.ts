import { describe, expect, it } from 'vitest';
import { estEnPartie, hashOfUrl, navigationDecision } from '../src/navigation';

const REGLES = {
  gameServerUrl: 'https://game-4x-server-prod.erik-ai-studio.workers.dev',
  oauthHosts: ['accounts.google.com', 'discord.com'],
};

describe('navigationDecision', () => {
  it('autorise le serveur de jeu (toute page, tout hash)', () => {
    expect(navigationDecision('https://game-4x-server-prod.erik-ai-studio.workers.dev/', REGLES)).toBe('allow');
    expect(
      navigationDecision('https://game-4x-server-prod.erik-ai-studio.workers.dev/auth/google?next=%23%2Flobby', REGLES),
    ).toBe('allow');
    expect(navigationDecision('https://game-4x-server-prod.erik-ai-studio.workers.dev/#/game/AB12CD', REGLES)).toBe(
      'allow',
    );
  });

  it('autorise les fournisseurs OAuth déclarés (flux plein page)', () => {
    expect(navigationDecision('https://accounts.google.com/o/oauth2/v2/auth?client_id=x', REGLES)).toBe('allow');
    expect(navigationDecision('https://discord.com/api/oauth2/authorize?client_id=x', REGLES)).toBe('allow');
  });

  it('refuse tout autre hôte et protocole', () => {
    expect(navigationDecision('https://exemple.com', REGLES)).toBe('deny');
    expect(navigationDecision('file:///C:/Windows/system32', REGLES)).toBe('deny');
    expect(navigationDecision('javascript:alert(1)', REGLES)).toBe('deny');
    expect(navigationDecision('data:text/html,<h1>hi</h1>', REGLES)).toBe('deny');
    expect(navigationDecision('chrome://settings', REGLES)).toBe('deny');
    expect(navigationDecision('pas une url', REGLES)).toBe('deny');
  });

  it('http réservé au local (dev)', () => {
    expect(navigationDecision('http://localhost:5174/', REGLES)).toBe('allow');
    expect(navigationDecision('http://127.0.0.1:5174/#/lobby', REGLES)).toBe('allow');
    expect(navigationDecision('http://exemple.com/', REGLES)).toBe('deny');
  });

  it("rejette les ressemblances de host (sous-domaine adversaire)", () => {
    expect(navigationDecision('https://evil-accounts.google.com/', REGLES)).toBe('deny');
    expect(navigationDecision('https://accounts.google.com.evil.dev/', REGLES)).toBe('deny');
    expect(navigationDecision('https://jeu.evil.dev/game-4x-server-prod.erik-ai-studio.workers.dev', REGLES)).toBe(
      'deny',
    );
  });
});

describe('estEnPartie (confirmation de sortie M2)', () => {
  it('détecte le hash #/game/<code>', () => {
    expect(estEnPartie('https://serveur.dev/#/game/AB12CD')).toBe(true);
    expect(estEnPartie('https://serveur.dev/auth/x#/game/ZZ99ZZ')).toBe(true);
    expect(estEnPartie('https://serveur.dev/#/lobby')).toBe(false);
    expect(estEnPartie('https://serveur.dev/#/login')).toBe(false);
    expect(estEnPartie('https://serveur.dev/')).toBe(false);
  });

  it('hashOfUrl extrait le hash brut', () => {
    expect(hashOfUrl('https://serveur.dev/#/game/AB12CD')).toBe('/game/AB12CD');
    expect(hashOfUrl('https://serveur.dev/')).toBe('');
  });

  it('les codes minuscules ou courts ne comptent pas comme partie', () => {
    expect(estEnPartie('https://serveur.dev/#/game/ab12cd')).toBe(false);
    expect(estEnPartie('https://serveur.dev/#/game/AB12')).toBe(false);
  });
});
