import { describe, expect, it } from 'vitest';
import { ConfigError, resolveConfig, selectedEnv, validateConfig } from '../src/config';

const PROD_VALIDE = {
  env: 'prod',
  gameServerUrl: 'https://game-4x-server-prod.erik-ai-studio.workers.dev',
  windowTitle: '4X multijoueur asynchrone',
  oauthHosts: ['accounts.google.com', 'discord.com'],
  csp: true,
  devtools: false,
};

describe('selectedEnv', () => {
  it('priorité CLI > variable > défaut prod', () => {
    expect(selectedEnv({})).toBe('prod');
    expect(selectedEnv({ envVar: 'dev' })).toBe('dev');
    expect(selectedEnv({ cliEnv: 'staging', envVar: 'dev' })).toBe('staging');
  });

  it('rejette un nom invalide', () => {
    expect(() => selectedEnv({ cliEnv: '../etc' })).toThrow(ConfigError);
    expect(() => selectedEnv({ envVar: 'a b' })).toThrow(ConfigError);
  });
});

describe('validateConfig', () => {
  it('valide une config prod', () => {
    const c = validateConfig(PROD_VALIDE, 'prod');
    expect(c.env).toBe('prod');
    expect(c.gameServerUrl).toBe('https://game-4x-server-prod.erik-ai-studio.workers.dev');
    expect(c.csp).toBe(true);
    expect(c.devtools).toBe(false);
  });

  it("supprime le slash final de l'URL", () => {
    expect(validateConfig({ ...PROD_VALIDE, gameServerUrl: 'https://exemple.dev/' }, 'prod').gameServerUrl).toBe(
      'https://exemple.dev',
    );
  });

  it('exige https hors dev', () => {
    expect(() => validateConfig({ ...PROD_VALIDE, gameServerUrl: 'http://exemple.dev' }, 'prod')).toThrow(ConfigError);
    expect(validateConfig({ ...PROD_VALIDE, gameServerUrl: 'http://localhost:5174' }, 'dev').gameServerUrl).toBe(
      'http://localhost:5174',
    );
  });

  it('refuse un gameServerUrl manquant ou exotique', () => {
    expect(() => validateConfig({ ...PROD_VALIDE, gameServerUrl: undefined }, 'prod')).toThrow(ConfigError);
    expect(() => validateConfig({ ...PROD_VALIDE, gameServerUrl: 'ftp://x' }, 'dev')).toThrow(ConfigError);
    expect(() => validateConfig({ ...PROD_VALIDE, gameServerUrl: '' }, 'dev')).toThrow(ConfigError);
  });

  it('surcharge GAME_SERVER_URL', () => {
    const c = validateConfig(PROD_VALIDE, 'prod', 'https://staging.exemple.dev');
    expect(c.gameServerUrl).toBe('https://staging.exemple.dev');
  });

  it('refuse oauthHosts non tableau', () => {
    expect(() => validateConfig({ ...PROD_VALIDE, oauthHosts: 'google' }, 'dev')).toThrow(ConfigError);
  });

  it('défaut de titre si absent', () => {
    expect(validateConfig({ gameServerUrl: 'http://localhost:5174', oauthHosts: [] }, 'dev').windowTitle).toBe(
      '4X multijoueur asynchrone',
    );
  });
});

describe('resolveConfig', () => {
  it("lit le fichier de l'environnement demandé", () => {
    const dir = mkdirWith({ prod: PROD_VALIDE, dev: { ...PROD_VALIDE, gameServerUrl: 'http://localhost:5174' } });
    try {
      const prod = resolveConfig({ configDir: dir });
      expect(prod.gameServerUrl).toContain('workers.dev');
      const dev = resolveConfig({ configDir: dir, cliEnv: 'dev' });
      expect(dev.gameServerUrl).toBe('http://localhost:5174');
      const surVarEnv = resolveConfig({ configDir: dir, envVar: 'dev' });
      expect(surVarEnv.gameServerUrl).toBe('http://localhost:5174');
    } finally {
      cleanup(dir);
    }
  });

  it('surcharge GAME_SERVER_URL par-dessus le fichier', () => {
    const dir = mkdirWith({ prod: PROD_VALIDE });
    try {
      const c = resolveConfig({ configDir: dir, serverUrlOverride: 'https://staging.exemple.dev' });
      expect(c.gameServerUrl).toBe('https://staging.exemple.dev');
    } finally {
      cleanup(dir);
    }
  });

  it('échoue clairement si le fichier manque ou est corrompu', () => {
    expect(() => resolveConfig({ configDir: 'Z:/nexiste-pas', cliEnv: 'prod' })).toThrow(ConfigError);
    const dir = mkdirWith({ prod: '{ json cassé' });
    try {
      expect(() => resolveConfig({ configDir: dir })).toThrow(ConfigError);
    } finally {
      cleanup(dir);
    }
  });
});

// --- helpers (fichiers réels dans un répertoire temporaire) ---
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function mkdirWith(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game4x-config-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
