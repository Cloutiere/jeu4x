<script lang="ts">
  /**
   * CHAT-SOCLE (Erik 29/10, D1/D5) — panneau de chat de la colonne droite
   * (onglet 💬) : canal Général (tous les joueurs) + UNE conversation par
   * joueur rencontré (popup de rencontre → conversation déverrouillée).
   * Bulles colorées à l'accent de l'auteur (palettes 4 tons), envoi
   * instantané (WebSocket — action immédiate, sans attendre la résolution),
   * habillage AAA or-sur-sombre (miroir Chroniques). ZÉRO LLM (D6) — les
   * bots non-Jev ne répondent pas (silence scripté).
   */
  import type { GameView } from '../lib/gameClient.js';
  import { chat } from '../lib/chat.js';
  import { FACTIONS4, paletteDe } from '../lib/render/accents.js';

  let { view, onEnvoyer }: { view: GameView; onEnvoyer: (canal: string, texte: string) => void } = $props();

  type Canal = { id: 'general' } | { id: string; label: string };

  /** Conversations déverrouillées (rencontres) — mappées vers les joueurs. */
  const rencontresInfos = $derived(
    $chat.rencontres
      .map((engineId) => view.players.find((p) => p.engineId === engineId))
      .filter((p): p is NonNullable<typeof p> => !!p),
  );

  let canalActif = $state<'general' | string>('general');

  /** Si la rencontre change la liste, on reste sur un canal valide. */
  const canalValide = $derived(
    canalActif === 'general' || rencontresInfos.some((p) => p.engineId === canalActif),
  );

  const messagesDuCanal = $derived($chat.messages.filter((m) => m.canal === canalActif));

  function monEngineIdVue(): string | null {
    return view.players.find((p) => p.id === view.playerId)?.engineId ?? null;
  }
  const monEngineId = $derived(monEngineIdVue());

  /** Couleur d'accent d'un auteur (miroir bandeau — palettes 4 tons). */
  function couleurDe(engineId: string): string {
    return FACTIONS4[paletteDe(engineId)]?.base ?? '#6E6E74';
  }
  function nomDe(engineId: string): string {
    if (engineId === monEngineId) return 'Vous';
    return view.players.find((pl) => pl.engineId === engineId)?.name ?? engineId;
  }

  let saisie = $state('');
  let listeElt: HTMLElement | undefined = $state();

  function envoyer(): void {
    const texte = saisie.trim();
    if (!texte || !canalValide) return;
    onEnvoyer(canalActif, texte);
    saisie = '';
  }

  /** Défilement vers le bas à chaque nouveau message du canal. */
  $effect(() => {
    void messagesDuCanal.length;
    if (listeElt) listeElt.scrollTop = listeElt.scrollHeight;
  });
</script>

<section class="panel chat-panel">
  <h2>💬 Messagerie</h2>
  <!-- D1 : canaux — Général + une conversation par joueur rencontré. -->
  <div class="canaux" role="tablist" aria-label="Canaux de chat">
    <button
      type="button"
      role="tab"
      class="canal"
      class:actif={canalActif === 'general'}
      aria-selected={canalActif === 'general'}
      onclick={() => (canalActif = 'general')}
    >
      Général
    </button>
    {#each rencontresInfos as p (p.engineId)}
      <button
        type="button"
        role="tab"
        class="canal"
        class:actif={canalActif === p.engineId}
        aria-selected={canalActif === p.engineId}
        onclick={() => (canalActif = p.engineId)}
      >
        <span class="pastille" style="background: {couleurDe(p.engineId)}"></span>
        {p.name}
      </button>
    {/each}
  </div>

  {#if !canalValide}
    <p class="hint">Canal indisponible.</p>
  {:else}
    <div class="liste" bind:this={listeElt} aria-live="polite">
      {#if messagesDuCanal.length === 0}
        <p class="hint">
          {canalActif === 'general'
            ? 'Aucun message. Parlez à tous les joueurs de la partie.'
            : `Conversation privée avec ${nomDe(canalActif)}.`}
        </p>
      {/if}
      {#each messagesDuCanal as m, i (i)}
        {@const couleur = couleurDe(m.auteur)}
        <div class="bulle" class:moi={m.auteur === monEngineId} style="--accent: {couleur}">
          <span class="auteur">{nomDe(m.auteur)}</span>
          <span class="texte">{m.texte}</span>
        </div>
      {/each}
    </div>
    <form
      class="saisie"
      onsubmit={(e) => {
        e.preventDefault();
        envoyer();
      }}
    >
      <input
        type="text"
        bind:value={saisie}
        maxlength={300}
        placeholder={canalActif === 'general' ? 'Message à tous…' : `Message à ${nomDe(canalActif)}…`}
        aria-label="Message de chat"
      />
      <button type="submit" class="bouton-or" disabled={!saisie.trim()}>Envoyer</button>
    </form>
  {/if}
</section>

<style>
  .chat-panel {
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 10px;
    padding: 0.7rem 0.85rem;
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(201, 162, 39, 0.08);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 10rem;
  }
  h2 {
    margin: 0;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--or-clair, #e8c96a);
    border-bottom: 1px solid transparent;
    border-image: linear-gradient(90deg, transparent, var(--or, #c9a227), transparent) 1;
    padding-bottom: 0.3rem;
  }
  .canaux { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .canal {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.74rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    border: 1px solid rgba(201, 162, 39, 0.3);
    background: transparent;
    color: var(--texte-doux, #b6ad93);
    cursor: pointer;
    line-height: 1.4;
  }
  .canal.actif {
    color: var(--or-clair, #e8c96a);
    border-color: var(--or, #c9a227);
    background: rgba(201, 162, 39, 0.12);
  }
  .canal:hover { border-color: var(--or-clair, #e8c96a); }
  .pastille { width: 0.55rem; height: 0.55rem; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,0.4); }
  .liste {
    display: flex; flex-direction: column; gap: 0.3rem;
    max-height: 13rem; overflow-y: auto;
    padding-right: 0.15rem;
  }
  .bulle {
    background: rgba(255, 255, 255, 0.04);
    border-left: 3px solid var(--accent, #6e6e74);
    border-radius: 0 8px 8px 0;
    padding: 0.25rem 0.5rem;
    font-size: 0.82rem;
    color: var(--texte, #e9e4d3);
  }
  .bulle.moi { background: rgba(201, 162, 39, 0.08); }
  .auteur {
    display: block;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent, #6e6e74);
    font-weight: 600;
  }
  .saisie { display: flex; gap: 0.35rem; }
  .saisie input {
    flex: 1;
    min-width: 0;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(201, 162, 39, 0.3);
    border-radius: 8px;
    color: var(--texte, #e9e4d3);
    font-size: 0.82rem;
    padding: 0.3rem 0.5rem;
  }
  .saisie input:focus { outline: none; border-color: var(--or, #c9a227); }
  .hint { color: var(--texte-doux, #b6ad93); font-size: 0.8rem; margin: 0; }
</style>
