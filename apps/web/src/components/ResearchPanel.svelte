<script lang="ts">
  /**
   * Menu de choix technologique (Phase 7a L3 — RULES.md §8.1, R-85/R-86/R-87).
   * Liste des techs disponibles (prérequis satisfaits) avec coût, progression
   * (barre) et débloquages listés ; techs verrouillées = grises avec leurs
   * prérequis manquants. Sélection = SetResearch (action immédiate) ;
   * changement libre, progression conservée par technologie.
   */
  import { TECHS, WONDERS, UNIT_TYPES, BUILDINGS, availableTechs, lockedTechs, ERA_ORDER, ERA_NAMES } from '@game/rules';
  import type { TechData, TechEra } from '@game/rules';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId } from '../lib/render/interaction.js';

  interface Props {
    view: GameView;
    client: GameClient;
    onClose(): void;
  }

  let { view, client, onClose }: Props = $props();

  const engineId = $derived(myEngineId(view));
  const player = $derived(view.state && engineId ? view.state.players[engineId] ?? null : null);
  const editable = $derived(view.status === 'active' && view.phase === 'orders');

  const currentTech = $derived(player?.researching ? TECHS[player.researching] ?? null : null);
  const currentProgress = $derived(
    player && player.researching ? player.scienceProgress[player.researching] ?? 0 : 0,
  );
  const currentRatio = $derived(currentTech ? Math.min(1, currentProgress / currentTech.cost) : 0);

  const available = $derived(player ? availableTechs(player) : []);
  const locked = $derived(player ? lockedTechs(player) : []);

  /** 7e : techs disponibles regroupées PAR ÈRE (Arbre Ancienne → Moderne). */
  const availableByEra = $derived.by(() => {
    const map = new Map<TechEra, TechData[]>();
    for (const era of ERA_ORDER) map.set(era, []);
    for (const t of available) map.get(t.era)!.push(t);
    return map;
  });

  function ratio(t: TechData): number {
    if (!player) return 0;
    return Math.min(1, (player.scienceProgress[t.id] ?? 0) / t.cost);
  }

  /** Libellé des débloquages d'une tech (unités / bâtiments / merveilles). */
  function unlocksLabel(t: TechData): string {
    const parts: string[] = [];
    for (const id of t.unlocks.units) {
      const u = UNIT_TYPES[id];
      const suffix = u?.implemented === false ? ' (données — Phase 7)' : '';
      parts.push(`${u?.name ?? id}${suffix}`);
    }
    for (const id of t.unlocks.buildings) parts.push(BUILDINGS[id]?.name ?? id);
    for (const id of t.unlocks.wonders) parts.push(`Merveille : ${WONDERS[id]?.name ?? id}`);
    const label = parts.join(' · ');
    // 7e : la récompense de Premier découvrir est affichée avec la tech.
    return t.firstToDiscover ? `${label} — 🏅 ${t.firstToDiscover.label}` : label;
  }

  /** 7e : obsolescences déclenchées par la tech (unités / merveilles). */
  function obsoleteLabel(t: TechData): string {
    const parts: string[] = [];
    for (const id of t.obsoleteUnits ?? []) parts.push(`${UNIT_TYPES[id]?.name ?? id} obsolète`);
    for (const id of t.obsoleteWonders ?? []) parts.push(`${WONDERS[id]?.name ?? id} obsolète`);
    return parts.join(' · ');
  }

  /** Prérequis manquants d'une tech verrouillée. */
  function missingPrereqs(t: TechData): string {
    return t.prereqs
      .filter((p) => !player?.techsUnlocked.includes(p))
      .map((p) => TECHS[p]?.name ?? p)
      .join(', ');
  }

  function select(id: string): void {
    if (!editable) return;
    client.setResearch(id);
  }
</script>

<div class="overlay" role="dialog" aria-label="Choix technologique">
  <div class="panel">
    <header>
      <h2>Recherche</h2>
      <button type="button" class="close" onclick={onClose}>✕</button>
    </header>

    {#if !player}
      <p class="hint">État non chargé.</p>
    {:else}
      {#if currentTech}
        <div class="current">
          <span>En cours : <strong>{currentTech.name}</strong></span>
          <div class="bar"><div class="fill" style:width={`${currentRatio * 100}%`}></div></div>
          <span class="hint">{currentProgress} / {currentTech.cost} science — changement libre (progression conservée)</span>
        </div>
      {:else if player.scienceStored > 0}
        <p class="reserve">Choisissez une recherche — science en attente : <strong>{player.scienceStored}</strong></p>
      {:else}
        <p class="hint">Aucune recherche en cours. La science produite s'accumule en réserve jusqu'au premier choix (R-85).</p>
      {/if}

      <!-- 7e : l'arbre est groupé par ère (Ancienne → Moderne), prérequis tracés. -->
      {#each ERA_ORDER as era (era)}
        {#if (availableByEra.get(era) ?? []).length > 0}
          <h3>{ERA_NAMES[era]}</h3>
          <ul>
            {#each availableByEra.get(era)! as t (t.id)}
              <li class:current={t.id === player.researching}>
                <button type="button" disabled={!editable} onclick={() => select(t.id)}>
                  <span class="name">{t.name} <em>({t.cost})</em></span>
                  <span class="bar"><span class="fill" style:width={`${ratio(t) * 100}%`}></span></span>
                  <span class="unlocks">{unlocksLabel(t)}</span>
                  {#if obsoleteLabel(t)}<span class="obsoletes">{obsoleteLabel(t)}</span>{/if}
                  {#if t.prereqs.length > 0}<span class="hint">Prérequis : {t.prereqs.map((p) => TECHS[p]?.name ?? p).join(', ')}</span>{/if}
                  {#if ratio(t) > 0}<span class="hint">progression : {player.scienceProgress[t.id] ?? 0} / {t.cost}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/each}
      {#if available.length === 0}
        <p class="hint">Aucune technologie disponible.</p>
      {/if}

      {#if locked.length > 0}
        <h3>Verrouillées</h3>
        <ul>
          {#each locked as t (t.id)}
            <li class="locked">
              <div class="name">{ERA_NAMES[t.era]} — {t.name} <em>({t.cost})</em></div>
              <div class="unlocks">Requiert : {missingPrereqs(t)}</div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: #000000a0; display: flex; align-items: center; justify-content: center; z-index: 20; }
  .panel { width: min(34rem, 92vw); max-height: 82vh; overflow-y: auto; background: #1d242b; border: 1px solid #3a4148; border-radius: 10px; padding: 0.9rem 1.1rem; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
  h2 { margin: 0; font-size: 1.05rem; }
  h3 { margin: 0.7rem 0 0.3rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  .close { background: none; border: none; color: #9aa7b2; font-size: 1rem; cursor: pointer; }
  .current { margin-bottom: 0.4rem; }
  .reserve { color: #ffe082; font-weight: 600; }
  .bar { height: 8px; background: #12161a; border-radius: 4px; overflow: hidden; border: 1px solid #3a4148; }
  .fill { display: block; height: 100%; background: #6fa3b8; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  li button { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem 0.7rem; cursor: pointer; border-radius: 8px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  li.current button { border-color: #6fa3b8; background: #22333c; }
  li.locked { padding: 0.45rem 0.7rem; border: 1px solid #333b42; border-radius: 8px; background: #1a2026; color: #7d8892; }
  .name { font-weight: 700; }
  .name em { font-weight: 400; color: #9aa7b2; }
  .unlocks { font-size: 0.82rem; color: #a8b4be; }
  .obsoletes { font-size: 0.78rem; color: #b08d5a; }
  .hint { font-size: 0.8rem; color: #8b98a5; }
  button:disabled { opacity: 0.55; cursor: default; }
</style>
