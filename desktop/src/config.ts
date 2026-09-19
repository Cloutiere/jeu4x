/**
 * Résolution de la configuration d'environnement (M1.3) — PUR, testé.
 *
 * Règle du handoff : l'URL serveur n'est JAMAIS codée en dur dans le code.
 * Elle vit dans un fichier de configuration par environnement (config/prod.json,
 * config/dev.json), lu au démarrage, avec deux moyens de sélection/surcharge :
 *  - le choix d'environnement : `--env=dev|prod` (CLI) > GAME4X_ENV > défaut « prod » ;
 *  - la surcharge ponctuelle : variable d'environnement GAME_SERVER_URL
 *    (prod / serveur local 5174 / staging futur).
 */
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface EnvConfig {
  /** Nom de l'environnement (informatif, repris du fichier). */
  env: string;
  /** URL de base du serveur de jeu (client + API + WebSocket). */
  gameServerUrl: string;
  /** Titre de la fenêtre (metadata visible, calibrable sans code). */
  windowTitle: string;
  /** Hôtes de navigation autorisés en plus du serveur de jeu (fournisseurs OAuth). */
  oauthHosts: string[];
  /** Injection d'une CSP sur les documents du serveur de jeu (prod : oui, dev : non — HMR). */
  csp: boolean;
  /** DevTools ouverts au lancement (debug local uniquement). */
  devtools: boolean;
}

export interface ResolveConfigInput {
  /** `--env=…` de la ligne de commande (sans le préfixe `--env=`). */
  cliEnv?: string;
  /** Process.env.GAME4X_ENV. */
  envVar?: string;
  /** Process.env.GAME_SERVER_URL (surcharge ponctuelle de l'URL). */
  serverUrlOverride?: string;
  /** Répertoire des fichiers de configuration. */
  configDir: string;
}

export class ConfigError extends Error {}

/** Nom d'environnement demandé, priorité CLI > variable > défaut « prod ». */
export function selectedEnv(input: Pick<ResolveConfigInput, 'cliEnv' | 'envVar'>): string {
  const requested = input.cliEnv ?? input.envVar ?? 'prod';
  if (!/^[a-z][a-z0-9_-]*$/i.test(requested)) {
    throw new ConfigError(`Nom d'environnement invalide : « ${requested} »`);
  }
  return requested.toLowerCase();
}

/** Lit et valide config/<env>.json, applique la surcharge GAME_SERVER_URL. */
export function resolveConfig(input: ResolveConfigInput): EnvConfig {
  const env = selectedEnv(input);
  const file = path.join(input.configDir, `${env}.json`);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    throw new ConfigError(`Fichier de configuration introuvable : ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(`Configuration ${file} illisible (JSON invalide) : ${e instanceof Error ? e.message : e}`);
  }
  return validateConfig(parsed, env, input.serverUrlOverride);
}

/** Validation pure d'un contenu de fichier + surcharge d'URL (testée sans disque). */
export function validateConfig(parsed: unknown, env: string, serverUrlOverride?: string): EnvConfig {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ConfigError(`Configuration « ${env} » : objet JSON attendu`);
  }
  const c = parsed as Record<string, unknown>;
  const gameServerUrl = typeof serverUrlOverride === 'string' && serverUrlOverride.trim() !== ''
    ? serverUrlOverride.trim()
    : c.gameServerUrl;
  if (typeof gameServerUrl !== 'string' || gameServerUrl.trim() === '') {
    throw new ConfigError(`Configuration « ${env} » : gameServerUrl manquant`);
  }
  const parsedUrl = new URL(gameServerUrl);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new ConfigError(`Configuration « ${env} » : gameServerUrl doit être http(s)`);
  }
  if (env !== 'dev' && parsedUrl.protocol !== 'https:') {
    throw new ConfigError(`Configuration « ${env} » : https exigé hors dev (reçu ${parsedUrl.protocol})`);
  }
  if (!Array.isArray(c.oauthHosts) || c.oauthHosts.some((h) => typeof h !== 'string')) {
    throw new ConfigError(`Configuration « ${env} » : oauthHosts doit être un tableau de chaînes`);
  }
  return {
    env,
    gameServerUrl: gameServerUrl.replace(/\/+$/, ''),
    windowTitle: typeof c.windowTitle === 'string' && c.windowTitle !== '' ? c.windowTitle : '4X multijoueur asynchrone',
    oauthHosts: (c.oauthHosts as string[]).map((h) => h.toLowerCase()),
    csp: c.csp === true,
    devtools: c.devtools === true,
  };
}

/**
 * Répertoire des fichiers de configuration : `resources/config` dans l'app
 * packagée (extraResources electron-builder), `desktop/config` en dev.
 */
export function configDirOf(resourcesPath: string, appDir: string, packaged: boolean): string {
  return packaged ? path.join(resourcesPath, 'config') : path.join(appDir, 'config');
}
