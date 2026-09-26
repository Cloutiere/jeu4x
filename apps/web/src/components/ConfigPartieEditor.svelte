<script lang="ts">
  /**
   * LOBBY-5 — éditeur de la ConfigPartie (5 sièges) partagé par l'écran de
   * création et la salle d'attente. Type de siège (Humain/Bot), nuancier des
   * 7 palettes 4 tons (prises grisées + nom du preneur — D2), civ par siège
   * (désactivée si « Civilisations aléatoires » — D3), topographie (D4 —
   * l'existant du progen, liste data-driven TOPOGRAPHIES).
   * Édition LOCALE : le parent valide/seralise via onchange ; l'unicité est
   * de toute façon GARANTIE PAR LE SERVEUR.
   */
  import { CIVILIZATIONS, TOPOGRAPHIES } from '@game/rules';
  import type { ConfigPartie } from '@game/shared';
  import { nomPalette4, resoutConflitsPalettes } from '@game/shared';
  import Nuancier from './Nuancier.svelte';

  interface Props {
    config: ConfigPartie;
    /** i → nom de l'occupant du siège i (salle d'attente — réel). */
    occupants?: Record<number, string | undefined>;
    editable?: boolean;
    onchange: (config: ConfigPartie) => void;
  }
  const { config, occupants = {}, editable = true, onchange }: Props = $props();

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

<div class="editor">
  <div class="entetes">
    <span>Siège</span><span>Type</span><span>Couleur</span><span>Civilisation</span>
  </div>
  {#each config.sieges as siege, i (i)}
    <div class="rangee">
      <span class="num">{i + 1}</span>
      <label class="type">
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
      <label class="civ">
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
      </label>
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
  .editor { display: flex; flex-direction: column; gap: 0.55rem; }
  .entetes, .rangee {
    display: grid; grid-template-columns: 2.2rem 6.5rem minmax(16rem, 1fr) minmax(11rem, 14rem);
    gap: 0.7rem; align-items: center;
  }
  .entetes { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9db8a6; }
  .rangee { border: 1px solid #3a4a3e; border-radius: 6px; padding: 0.45rem 0.6rem; background: #1b2620; }
  .num { font-weight: 700; color: #ffd54f; text-align: center; }
  .couleur { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .nomPalette { font-size: 0.74rem; color: #bfe8cc; }
  .parametres { display: flex; gap: 1.2rem; flex-wrap: wrap; margin-top: 0.3rem; align-items: center; }
  label { display: flex; gap: 0.45rem; align-items: center; font-size: 0.86rem; }
  .check { flex: 1 1 100%; }
  select, option { background: #14201a; color: #e8e8e8; border: 1px solid #3c7a52; border-radius: 4px; padding: 0.2rem 0.35rem; font: inherit; }
  select:disabled { opacity: 0.55; }
</style>
