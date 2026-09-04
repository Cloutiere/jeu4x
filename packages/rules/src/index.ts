/** Point d'entrée public du moteur de règles pur (@game/rules). */
export * from './constants.js';
export * from './state.js';
export * from './events.js';
export * from './types.js';
export * from './hex.js';
export * from './rng.js';
export * from './combat.js';
export * from './army.js';
export * from './data.js';
export * from './resources.js';
export * from './techs.js';
export * from './firstDiscovery.js';
export * from './research.js';
export * from './conversion.js';
export * from './culture.js';
export * from './governments.js';
export * from './naval.js';
export * from './economy.js';
export * from './growth.js';
/** 7l — Or & trésorerie (R-134..R-137, economy.json). */
export * from './economyOr.js';
/** 7m — Nucléaire & espionnage jeu de base (R-138..R-144, espionnage.json). */
export * from './espionnage.js';
/** 7n — Civilisations & traits (R-145..R-150, civilizations.json / eras.json). */
export * from './civilizations.js';
/** 7o — Artefacts / reliques (R-151..R-156, artefacts.json). */
export * from './artefacts.js';
export * from './barbares.js';
export * from './map.js';
export * from './fog.js';
export * from './turn.js';
export * from './forfeit.js';
export * from './fixtures.js';
/** Phase 6b — générateur procédural de cartes (pur, seedé, sans IO). */
export * from './progen/index.js';
