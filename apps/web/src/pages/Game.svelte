<script lang="ts">
  // Page de partie (L6) — SANS rendu de carte (Phase 3) : barre supérieure,
  // bouton « Fin de tour », état filtré brut et journal d'événements.
  import { onDestroy } from 'svelte';
  import type { GameEvent } from '@game/shared';
  import { createGameClient, unitsOf } from '../lib/gameClient.js';
  import type { GameClient, GameView } from '../lib/gameClient.js';

  let { code }: { code: string } = $props();

  const client: GameClient = createGameClient(code);
  onDestroy(() => client.close());

  const view = client.view;
  const status = client.status;
  const error = client.error;

  // Lien vers le mode reveal (#/debug) — jamais dans un build de production.
  const devMode = import.meta.env.DEV;

  // Mini-formulaire d'ordres (sans carte) : Hold, ou Move d'un pas (q, r).
  let orderUnitId = $state('');
  let orderKind = $state<'Hold' | 'Move'>('Hold');
  let stepQ = $state(0);
  let stepR = $state(0);

  function submitOrder(): void {
    if (!orderUnitId) return;
    client.submitOrder(
      orderKind === 'Hold'
        ? { type: 'Hold', unitId: orderUnitId }
        : { type: 'Move', unitId: orderUnitId, path: [{ q: stepQ, r: stepR }] },
    );
  }

  function label(event: GameEvent): string {
    switch (event.type) {
      case 'Move':
        return `${event.unitId} (${event.owner}) : (${event.from.q},${event.from.r}) → (${event.to.q},${event.to.r})`;
      case 'Attack':
        return `${event.attackerId} attaque ${event.defenderId} en (${event.at.q},${event.at.r})`;
      case 'CombatExchange':
        return `échange ${event.attackerId} (${event.attackerHpAfter} PV) vs ${event.defenderId} (${event.defenderHpAfter} PV)`;
      case 'UnitDestroyed':
        return `${event.unitId} détruite (${event.cause})`;
      case 'Retreat':
        return `${event.unitId} se replie vers (${event.to.q},${event.to.r})`;
      case 'Captured':
        return `${event.unitId} capturée par ${event.byPlayer} (${event.outcome})`;
      case 'BootyGold':
        return `${event.player} touche ${event.amount} or de butin`;
      case 'ArmyFormed':
        return `armée ${event.unitId} formée (${event.memberIds.join(', ')})`;
      case 'CityFounded':
        return `ville ${event.cityId} fondée en (${event.at.q},${event.at.r}) par ${event.owner}`;
      case 'CityCaptured':
        return `ville ${event.cityId} prise par ${event.toOwner}`;
      case 'UnitProduced':
        return `${event.unitType} produit par ${event.cityId}`;
      case 'DiplomaticIncident':
        return `incident diplomatique entre ${event.between[0]} et ${event.between[1]}`;
      case 'Victory':
        return `VICTOIRE de ${event.winner} (${event.reason})`;
      case 'TurnResolved':
        return `— fin du tour (nouveau tour : ${event.turn}) —`;
      default:
        // switch exhaustif sur GameEvent — ne devrait jamais se produire.
        return (event as { type: string }).type;
    }
  }
</script>

<main class="game">
  <header class="bar">
    <a href="#/lobby">← Lobby</a>
    <strong>Partie {code}</strong>
    <span>Tour {$view.turn}</span>
    <span>Phase {$view.phase}</span>
    <span>Statut : {$view.status}</span>
    <span>Réseau : {$status}</span>
    <span>{$view.locked ? 'Ordres verrouillés' : 'Ordres modifiables'}</span>
    <button type="button" disabled={$view.locked || $view.phase !== 'orders' || $view.status !== 'active'} onclick={() => client.endTurn()}>
      Fin de tour
    </button>
    <button type="button" onclick={() => client.resync()}>Resync</button>
    {#if devMode}<a href={`#/debug/${code}`}>Debug</a>{/if}
  </header>

  {#if $error}<p class="error">{$error}</p>{/if}

  {#if $view.status === 'waiting'}
    <p class="waiting">En attente du joueur 2 — lien d'invitation : <code>/#/join/{code}</code></p>
  {:else if !$view.state}
    <p>Chargement de l'état…</p>
  {:else}
    <section class="orders">
      <h2>Mes ordres ({$view.orders.length})</h2>
      <ul>
        {#each $view.orders as order, i (i)}
          <li>
            {order.type}
            {'unitId' in order ? ` — ${order.unitId}` : ''}
            <button type="button" disabled={$view.locked} onclick={() => 'unitId' in order && client.cancelOrderFor(order.unitId)}>
              annuler
            </button>
          </li>
        {/each}
      </ul>
      <form onsubmit={(e) => { e.preventDefault(); submitOrder(); }}>
        <select bind:value={orderUnitId}>
          <option value="" disabled selected>unité…</option>
          {#each unitsOf($view) as unit (unit.id)}
            <option value={unit.id}>{unit.id} ({unit.type}) en ({unit.q},{unit.r})</option>
          {/each}
        </select>
        <select bind:value={orderKind}>
          <option value="Hold">Hold</option>
          <option value="Move">Move (1 pas)</option>
        </select>
        {#if orderKind === 'Move'}
          <label>q <input type="number" bind:value={stepQ} /></label>
          <label>r <input type="number" bind:value={stepR} /></label>
        {/if}
        <button type="submit" disabled={$view.locked || !orderUnitId}>Soumettre</button>
      </form>
    </section>

    <section class="journal">
      <h2>Journal des événements ({$view.events.length})</h2>
      <ol>
        {#each $view.events as event (event.seq)}
          <li><code>#{event.seq}</code> <strong>{event.type}</strong> — {label(event)}</li>
        {/each}
      </ol>
    </section>

    <section class="raw">
      <h2>État filtré (brut)</h2>
      <pre>{JSON.stringify($view.state, null, 2)}</pre>
    </section>
  {/if}
</main>

<style>
  main { max-width: 60rem; margin: 1rem auto; font-family: system-ui, sans-serif; }
  .bar { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
  section { margin: 1rem 0; border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem; }
  .raw pre { max-height: 24rem; overflow: auto; font-size: 0.75rem; }
  .journal ol { max-height: 16rem; overflow: auto; }
  .error { color: #b00020; }
  .waiting { font-size: 1.1rem; }
  form { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
</style>
