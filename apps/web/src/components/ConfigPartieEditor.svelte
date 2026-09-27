<script lang="ts">
  /**
   * LOBBY-5 — éditeur de la ConfigPartie (5 sièges) partagé par l'écran de
   * création et la salle d'attente. Type de siège (Humain/Bot), nuancier des
   * 6 palettes 4 tons (prises grisées + nom du preneur — D2), civ par siège
   * (désactivée si « Civilisations aléatoires » — D3), topographie (D4 —
   * l'existant du progen, liste data-driven TOPOGRAPHIES).
   * Édition LOCALE : le parent valide/seralise via onchange ; l'unicité est
   * de toute façon GARANTIE PAR LE SERVEUR.
   * LOBBY-PREMIUM : refonte PRÉSENTATION seule (grille or-sur-sombre du
   * mockup gpt_V2) — logique intacte ; `banderoles` (lobby) affiche la
   * banderole de la nation choisie à droite de chaque rangée (D3 : bandeau
   * neutre tant qu'aucun choix).
   */
  import { CIVILIZATIONS, TOPOGRAPHIES } from '@game/rules';
  import type { ConfigPartie } from '@game/shared';
  import { nomPalette4, resoutConflitsPalettes } from '@game/shared';
  import Nuancier from './Nuancier.svelte';
  import { nationDe } from '../lib/nations.js';

  interface Props {
    config: ConfigPartie;
    /** i → nom de l'occupant du siège i (salle d'attente — réel). */
    occupants?: Record<number, string | undefined>;
    editable?: boolean;
    /** Affiche la banderole de nation à droite de chaque rangée (lobby). */
    banderoles?: boolean;
    onchange: (config: ConfigPartie) => void;
  }
  const { config, occupants = {}, editable = true, banderoles = false, onchange }: Props = $props();

  const CIV_IDS = Object.keys(CIVILIZATIONS.civs).sort((a, b) =>
    CIVILIZATIONS.civs[a]!.name.localeCompare(CIVILIZATIONS.civs[b]!.name, 'fr'),
  );

  function maj(mutateur: (cfg: ConfigPartie) => void): void {
    const copie: ConfigPartie = { ...config, sieges: config.sieges.map((s) => ({ ...s })) };
    mutateur(copie);
    // Règle Erik 25/09 : un humain peut prendre la couleur d'un bot — le bot
    // dépossédé (et tout doublon) reçoit automatiquement une palette libre.
    onchange(resoutConflitsPalettes(copie));
  }

  const civPrisePar = $derived.by(() => {
    const map: Record<string, string | undefined> = {};
    config.sieges.forEach((s, i) => {
      if (s.civId) map[s.civId] = occupants[i];
    });
    return map;
  });

  /** Palettes BLOQUÉES pour le siège i : celles des humains (et des
   *  occupants réels) toujours ; celles des autres bots uniquement quand le
   *  siège édité est lui-même un bot. Un HUMAIN peut donc prendre la couleur
   *  d'un bot — le bot sera réaffecté automatiquement (resoutConflitsPalettes). */
  function prisesPour(i: number): Record<string, string | undefined> {
    const map: Record<string, string | undefined> = {};
    const jeSuisBot = config.sieges[i]?.type === 'bot';
    config.sieges.forEach((s, j) => {
      if (j === i) return;
      const bloque = s.type === 'humain' || occupants[j] !== undefined || jeSuisBot;
      if (bloque) map[s.paletteId] = occupants[j] ?? (s.type === 'humain' ? 'humain' : 'bot');
    });
    return map;
  }
</script>

<div class="editor" class:avecBanderoles={banderoles}>
  <div class="entetes">
    <span>#</span><span>Type</span><span>Couleur</span><span class:civ={banderoles}>Civilisation</span>
    {#if banderoles}<span class="banderole-col"></span>{/if}
  </div>
  {#each config.sieges as siege, i (i)}
    {@const nation = nationDe(siege.civId)}
    <div class="rangee">
      <span class="num">{i + 1}</span>
      <label class="type">
        <span class="icone" class:bot={siege.type === 'bot'} aria-hidden="true">{siege.type === 'bot' ? '🤖' : '👤'}</span>
        <select
          value={siege.type}
          disabled={!editable || (occupants[i] !== undefined && siege.type === 'humain') || i === 0}
          onchange={(e) => maj((c) => { c.sieges[i]!.type = (e.currentTarget as HTMLSelectElement).value as 'humain' | 'bot'; })}
        >
          <option value="humain">Humain</option>
          <option value="bot">Bot</option>
        </select>
      </label>
      <div class="couleur">
        <Nuancier
          value={siege.paletteId}
          prises={prisesPour(i)}
          ignore={siege.paletteId}
          onchange={(paletteId) => maj((c) => { c.sieges[i]!.paletteId = paletteId; })}
        />
        <span class="nomPalette">{nomPalette4(siege.paletteId)}{occupants[i] ? ` — ${occupants[i]}` : ''}</span>
      </div>
      <div class="civ">
        {#if nation?.logo}
          <img class="logo" src={nation.logo} alt="" />
        {/if}
        <select
          value={siege.civId ?? ''}
          disabled={!editable || config.civsAleatoires}
          onchange={(e) => maj((c) => { const v = (e.currentTarget as HTMLSelectElement).value; c.sieges[i]!.civId = v || null; })}
        >
          <option value="">— Choisir —</option>
          {#each CIV_IDS as id (id)}
            {@const priseParAutre = civPrisePar[id] && config.sieges[i]?.civId !== id}
            <option value={id} disabled={!!priseParAutre}>
              {CIVILIZATIONS.civs[id]!.name}{priseParAutre ? ` (${civPrisePar[id]})` : ''}
            </option>
          {/each}
        </select>
      </div>
      {#if banderoles}
        <div class="banderole" class:neutre={!nation}>
          {#if nation}
            <img src={nation.banderole} alt="" />
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  <div class="parametres">
    <label class="check">
      <input
        type="checkbox"
        checked={config.civsAleatoires}
        disabled={!editable}
        onchange={(e) => maj((c) => { c.civsAleatoires = (e.currentTarget as HTMLInputElement).checked; })}
      />
      Civilisations aléatoires (tirage seedé — 16 distinctes, révélées au démarrage)
    </label>
    <label>
      Topographie
      <select
        value={config.topographie}
        disabled={!editable}
        onchange={(e) => maj((c) => { c.topographie = (e.currentTarget as HTMLSelectElement).value; })}
      >
        {#each TOPOGRAPHIES as t (t.id)}
          <option value={t.id}>{t.nom}</option>
        {/each}
      </select>
    </label>
  </div>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 0.55rem; color: var(--texte); }
  .entetes, .rangee {
    display: grid;
    grid-template-columns: 2.2rem 7.5rem minmax(14rem, 1fr) minmax(11rem, 13rem);
    gap: 0.7rem; align-items: center;
  }
  .avecBanderoles .entetes, .avecBanderoles .rangee {
    grid-template-columns: 2.2rem 8.5rem minmax(13rem, 1fr) minmax(12rem, 14rem) minmax(13rem, 15rem);
  }
  /* Lobby : le type de siège a déjà sa colonne — les marqueurs « humain/bot »
     sous les pastilles du nuancier ne sont que du bruit visuel (mockup). */
  .avecBanderoles :global(.pastille .nom) { display: none; }
  .entetes {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--texte-doux); padding: 0 0.6rem;
  }
  .rangee {
    border: 1px solid var(--panneau-bord-doux); border-radius: 8px; padding: 0.5rem 0.7rem;
    background: var(--rangee);
  }
  .rangee:hover { border-color: var(--panneau-bord); }
  .num {
    font-weight: 700; color: var(--or-clair); text-align: center;
    font-family: var(--serif-or); font-size: 1.05rem;
  }
  .type { display: flex; gap: 0.45rem; align-items: center; }
  .icone { font-size: 1rem; opacity: 0.9; }
  .couleur { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .nomPalette { font-size: 0.74rem; color: var(--texte-doux); }
  .civ { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
  .logo { width: 2rem; height: 2rem; object-fit: contain; filter: drop-shadow(0 0 3px rgba(201, 162, 39, 0.5)); flex: none; }
  /* D3 — bandeau neutre sombre tant qu'aucune nation n'est choisie. */
  .banderole {
    height: 3.4rem; border-radius: 6px; overflow: hidden; border: 1px solid var(--panneau-bord-doux);
    background:
      repeating-linear-gradient(135deg, rgba(201, 162, 39, 0.05) 0 6px, transparent 6px 14px),
      linear-gradient(180deg, #131c2c, #0d1420);
  }
  .banderole img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .parametres { display: flex; gap: 1.2rem; flex-wrap: wrap; margin-top: 0.3rem; align-items: center; }
  label { display: flex; gap: 0.45rem; align-items: center; font-size: 0.86rem; }
  .check { flex: 1 1 100%; }
  select, option {
    background: rgba(10, 16, 27, 0.95); color: var(--texte);
    border: 1px solid var(--panneau-bord-doux); border-radius: 5px; padding: 0.25rem 0.4rem; font: inherit;
  }
  select:hover:not(:disabled) { border-color: var(--panneau-bord); }
  select:disabled { opacity: 0.55; }
</style>
