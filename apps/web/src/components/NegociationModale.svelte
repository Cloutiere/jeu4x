<script lang="ts">
  /**
   * DIPLOMATIE-T2 (décisions Erik 28/10, D5) — modale de NÉGOCIATION :
   * ouverte depuis la pastille de nation (bouton « Négocier »). Deux offres :
   *   - la PAIX (si en guerre) avec curseur de compensation (or privé) ;
   *   - l'ÉCHANGE de technologies : ma tech contre une tech (1:1) OU contre
   *     de l'or — jamais avec une nation en guerre (canon, bouton désactivé).
   * La réponse du bot (accepte / refuse / contre-proposition) arrive en
   * direct (toast + Chronique privée) ; la modale se ferme à l'envoi.
   * Bots entre eux : pas de négociation — le joueur est le seul initiateur.
   */
  import type { GameView } from '../lib/gameClient.js';
  import type { GameClient } from '../lib/gameClient.js';
  import { TECHS } from '@game/rules';
  import { civName, civLeader } from '../lib/labels.js';

  interface CibleNegociation {
    id: string; // engineId moteur
    nom: string;
    enGuerre: boolean;
    defeated: boolean;
  }

  interface Props {
    view: GameView;
    client: GameClient;
    cible: CibleNegociation;
    onClose: () => void;
    /** OFFICIALISATION (D1) — ouverture depuis une bulle de Zii : section mise
     *  en avant (paix en guerre, sinon échange de techs). Optionnel. */
    sectionSuggeree?: 'paix' | 'techs';
  }

  let { view, client, cible, onClose, sectionSuggeree }: Props = $props();

  const moi = view.players.find((p) => p.engineId !== undefined && view.playerId !== null && p.id === view.playerId);
  const monEngineId = moi?.engineId ?? null;

  // Trésorerie du joueur (plafond du curseur de compensation).
  const monOr = $derived(monEngineId ? (view.state?.players[monEngineId]?.treasury ?? 0) : 0);

  // Mes techs proposables : connues de MOI, inconnues de la cible.
  const mesTechs = $derived(
    monEngineId
      ? (view.state?.players[monEngineId]?.techsUnlocked ?? [])
          .filter((t) => !(view.state?.players[cible.id]?.techsUnlocked ?? []).includes(t))
          .sort()
      : [],
  );
  // Techs de la cible que je ne connais PAS (échange 1:1).
  const sesTechs = $derived(
    (view.state?.players[cible.id]?.techsUnlocked ?? [])
      .filter((t) => !(monEngineId && (view.state?.players[monEngineId]?.techsUnlocked ?? []).includes(t)))
      .sort(),
  );

  let orPaix = $state(0);
  let techOfferte = $state<string>('');
  let modeEchange = $state<'tech' | 'or'>('tech');
  let techDemandee = $state<string>('');
  let orDemande = $state(0);

  // Défauts déterministes à l'ouverture (première entrée de chaque liste).
  if (mesTechs.length > 0 && techOfferte === '') techOfferte = mesTechs[0]!;
  if (sesTechs.length > 0 && techDemandee === '') techDemandee = sesTechs[0]!;

  function envoyerPaix(): void {
    client.proposePeace(cible.id, orPaix);
    onClose();
  }

  function envoyerEchange(): void {
    if (!techOfferte) return;
    if (modeEchange === 'tech' && techDemandee) client.tradeTechs(cible.id, techOfferte, techDemandee);
    else if (modeEchange === 'or') client.tradeTechs(cible.id, techOfferte, undefined, orDemande);
    onClose();
  }

  function nomTech(id: string): string {
    return TECHS[id]?.name ?? id;
  }
</script>

<div class="parametres-overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="parametres-boite negociation-boite">
    <div class="parametres-tete">
      <h2>Négocier — {cible.nom}</h2>
      <button type="button" class="fermer" aria-label="Fermer" onclick={onClose}>×</button>
    </div>

    {#if cible.defeated}
      <p class="negociation-hint">Cette nation est éliminée : aucune négociation possible.</p>
    {:else}
      {#if cible.enGuerre}
        <!-- D2 : paix avec compensation — l'or ne passe qu'À L'ACCEPTATION ;
             la réponse du bot est seedée (prix = fierté × rapport de forces). -->
        <section class="negociation-section" class:suggeree={sectionSuggeree === 'paix'}>
          <h3>🕊 Proposer la paix</h3>
          <p class="negociation-hint">Proposition PRIVÉE. La compensation n'est versée que si l'échange est accepté ; sinon rien ne bouge.</p>
          <div class="negociation-ligne">
            <label for="negoc-or">Compensation (or) :</label>
            <input id="negoc-or" type="range" min="0" max={Math.max(monOr, 0)} step="1" bind:value={orPaix} />
            <output>{orPaix} or</output>
          </div>
          <button type="button" class="negociation-envoyer paix" disabled={monOr <= 0 && orPaix > 0} onclick={envoyerPaix}>
            Proposer la paix (+{orPaix} or)
          </button>
        </section>
      {/if}

      <!-- D3 : échange de technologies — JAMAIS avec une nation en guerre. -->
      <section class="negociation-section" class:suggeree={sectionSuggeree === 'techs'}>
        <h3>🔬 Échanger des technologies</h3>
        {#if cible.enGuerre}
          <p class="negociation-hint">Impossible : aucun échange avec une nation EN GUERRE.</p>
        {:else if mesTechs.length === 0}
          <p class="negociation-hint">Aucune technologie à proposer : {cible.nom} connaît déjà tout votre savoir (ou votre empire n'a rien à troquer).</p>
        {:else}
          <p class="negociation-hint">Proposition PRIVÉE. Échange 1:1 ou votre tech contre de l'or.</p>
          <div class="negociation-ligne">
            <label for="negoc-offerte">Vous offrez :</label>
            <select id="negoc-offerte" bind:value={techOfferte}>
              {#each mesTechs as t (t)}
                <option value={t}>{nomTech(t)} ({TECHS[t]?.cost} 🔬)</option>
              {/each}
            </select>
          </div>
          <div class="negociation-ligne">
            <label>Contre :</label>
            <label class="negoc-radio"><input type="radio" bind:group={modeEchange} value="tech" /> une technologie</label>
            <label class="negoc-radio"><input type="radio" bind:group={modeEchange} value="or" /> de l'or</label>
          </div>
          {#if modeEchange === 'tech'}
            {#if sesTechs.length === 0}
              <p class="negociation-hint">{cible.nom} ne connaît aucune technologie qui vous manque.</p>
            {:else}
              <div class="negociation-ligne">
                <label for="negoc-demandee">Vous demandez :</label>
                <select id="negoc-demandee" bind:value={techDemandee}>
                  {#each sesTechs as t (t)}
                    <option value={t}>{nomTech(t)} ({TECHS[t]?.cost} 🔬)</option>
                  {/each}
                </select>
              </div>
            {/if}
          {:else}
            <div class="negociation-ligne">
              <label for="negoc-ordemande">Or demandé :</label>
              <input id="negoc-ordemande" type="number" min="0" bind:value={orDemande} />
            </div>
          {/if}
          <button
            type="button"
            class="negociation-envoyer"
            disabled={cible.enGuerre || !techOfferte || (modeEchange === 'tech' && sesTechs.length === 0)}
            onclick={envoyerEchange}
          >
            Proposer l'échange
          </button>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  /* DIPLOMATIE-T2 · D5 : modale AAA compacte — les styles .parametres-* de
     Game.svelte sont SCOPÉS à ce composant : recopiés ici (miroir 1716). */
  .parametres-overlay {
    position: fixed; inset: 0; z-index: 400;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
  }
  .parametres-boite {
    width: min(680px, 92vw); max-height: 80vh; overflow: auto;
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.35));
    border-radius: 12px; padding: 1rem 1.2rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(201, 162, 39, 0.12);
    color: #e8dcc0;
  }
  .parametres-tete { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.3rem; }
  .fermer {
    background: none; border: none; color: #c9a227; font-size: 1.2rem;
    cursor: pointer; line-height: 1;
  }
  /* DIPLOMATIE-T2 · D5 : modale AAA compacte — miroir des boîtes guerre/paix. */
  .negociation-boite {
    max-width: 30rem;
    min-width: 24rem;
  }
  .negociation-section {
    margin: 0.6rem 0;
    padding: 0.5rem 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
  }
  .negociation-section.suggeree {
    border-color: var(--or, #c9a227);
    box-shadow: 0 0 0 1px rgba(201, 162, 39, 0.35);
  }
  .negociation-section h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }
  .negociation-hint {
    margin: 0.15rem 0 0.45rem;
    font-size: 0.82rem;
    opacity: 0.75;
  }
  .negociation-ligne {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.3rem 0;
    font-size: 0.9rem;
  }
  .negociation-ligne label {
    white-space: nowrap;
  }
  .negociation-ligne input[type='range'] {
    flex: 1;
  }
  .negociation-ligne output {
    min-width: 4.5rem;
    text-align: right;
    font-weight: 600;
  }
  .negoc-radio {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-right: 0.8rem;
  }
  .negociation-envoyer {
    margin-top: 0.45rem;
    padding: 0.35rem 0.9rem;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    cursor: pointer;
  }
  .negociation-envoyer.paix {
    border-color: rgba(140, 200, 255, 0.5);
  }
  .negociation-envoyer:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
