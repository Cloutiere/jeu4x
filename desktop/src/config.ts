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
import type { ResolutionBase } from './letterbox';

/** Valeurs par défaut de la résolution logique (décision d'Erik du 18/09). */
export const RESOLUTION_DEFAUT: ResolutionBase = { largeur: 1280, hauteur: 720 };

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
  /** Résolution logique fixe (M1) : tout le monde voit la même vue globale. */
  resolutionBase: ResolutionBase;
  /** Mode d'affichage au lancement : « fenetre » (défaut) ou « pleine-ecran » (letterbox). */
  modeDefaut: 'fenetre' | 'pleine-ecran';
  /** DPR forcé (neutralisation du facteur d'échelle Windows) ; null = suivre le système. */
  deviceScaleFactor: number | null;
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
    resolutionBase: parseResolutionBase(c.resolutionBase, env),
    modeDefaut: parseModeDefaut(c.modeDefaut, env),
    deviceScaleFactor: parseDeviceScaleFactor(c.deviceScaleFactor, env),
  };
}

/** Lit/valide `resolutionBase` — défaut 1280×720, valeurs invalides refusées. */
function parseResolutionBase(v: unknown, env: string): ResolutionBase {
  if (v === undefined) return { ...RESOLUTION_DEFAUT };
  if (typeof v !== 'object' || v === null) {
    throw new ConfigError(`Configuration « ${env} » : resolutionBase doit être un objet {largeur, hauteur}`);
  }
  const r = v as Record<string, unknown>;
  for (const clé of ['largeur', 'hauteur'] as const) {
    const n = r[clé];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 320 || n > 8192) {
      throw new ConfigError(
        `Configuration « ${env} » : resolutionBase.${clé} doit être un entier entre 320 et 8192 (reçu ${String(n)})`,
      );
    }
  }
  return { largeur: r.largeur as number, hauteur: r.hauteur as number };
}

/** Lit/valide `modeDefaut` — défaut « fenetre ». */
function parseModeDefaut(v: unknown, env: string): 'fenetre' | 'pleine-ecran' {
  if (v === undefined) return 'fenetre';
  if (v !== 'fenetre' && v !== 'pleine-ecran') {
    throw new ConfigError(`Configuration « ${env} » : modeDefaut doit être « fenetre » ou « pleine-ecran » (reçu ${String(v)})`);
  }
  return v;
}

/** Lit/valide `deviceScaleFactor` — défaut 1 (rendu identique au pixel partout). */
function parseDeviceScaleFactor(v: unknown, env: string): number | null {
  if (v === undefined) return 1;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new ConfigError(`Configuration « ${env} » : deviceScaleFactor doit être un nombre > 0 ou null`);
  }
  return v;
}

/**
 * Répertoire des fichiers de configuration : `resources/config` dans l'app
 * packagée (extraResources electron-builder), `desktop/config` en dev.
 */
export function configDirOf(resourcesPath: string, appDir: string, packaged: boolean): string {
  return packaged ? path.join(resourcesPath, 'config') : path.join(appDir, 'config');
}
