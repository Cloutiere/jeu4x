<script lang="ts">
  /**
   * RAPPORT-ENGAGEMENT (L2) — popover « sommaire de case » (demande d'Erik du
   * 30/09). Ancré près de la case cliquée, style AAA niveau lobby : or-sur-
   * foncé, serif des titres, liserés dégradés (MÊMES tokens que app.css /
   * CadreLobby). Contenu D2 : logo or de nation + bandeau de couleur de
   * faction, rôle R-180 (VAINQUEUR/MILIEU/PERDANT), barre de PV avant→après
   * (compartiments de la barre 3 vies), sort (détruit/expulsé/repli/capture/
   * reste). Bouton « ⟲ Rejouer ce combat » (D3). Fermeture : clic ailleurs,
   * Échap, ×.
   */
  import type { ResumeCase } from '../lib/rapport.js';

  interface InfoParticipant {
    nomUnite: string;
    nomFaction: string;
    logo: string | null;
    logoEchelle: number;
    couleur: string;
    hpMax: number;
  }

  let {
    resume,
    x,
    y,
    infos,
    peutRejouer,
    onRejouer,
    onFermer,
  }: {
    resume: ResumeCase;
    /** Position d'ancrage (px, relative à la zone de carte) — déjà bornée au viewport. */
    x: number;
    y: number;
    infos: Record<string, InfoParticipant>;
    peutRejouer: boolean;
    onRejouer(): void;
    onFermer(): void;
  } = $props();

  let el: HTMLDivElement;

  const ROLE_LABELS: Record<string, string> = { winner: 'VAINQUEUR', middle: 'MILIEU', loser: 'PERDANT' };

  const SORT_LABELS: Record<string, string> = {
    reste: 'reste en place',
    detruit: 'détruit ☠',
    expulse: 'expulsé',
    repli: 'repli',
    capture: 'capturé',
  };

  function delta(pvAvant: number | null, pvApres: number | null): string {
    if (pvAvant === null || pvApres === null) return '';
    const d = pvApres - pvAvant;
    return d === 0 ? '±0' : `(${d > 0 ? '+' : ''}${d})`;
  }

  function infoDe(p: ResumeCase['participants'][number]): InfoParticipant {
    return (
      infos[p.unitId] ?? {
        nomUnite: p.type,
        nomFaction: p.owner,
        logo: null,
        logoEchelle: 1,
        couleur: '#6E6E74',
        hpMax: 3,
      }
    );
  }

  // ---- COMBAT-EXPLIQUE (décisions Erik 06/10, L3) — verdict en tête,
  // « d'où vient sa force », assauts repliables. Compact par défaut.
  import type { CombatForceDetail } from '@game/rules';

  const detail = $derived(resume.detailCombat ?? null);

  function fmt(n: number): string {
    return n.toFixed(2).replace('.', ',');
  }

  function nomDe(unitId: string): string {
    const p = resume.participants.find((x) => x.unitId === unitId);
    return p ? infoDe(p).nomUnite : unitId;
  }

  function modLigne(f: CombatForceDetail): string {
    const morceaux: string[] = [`base ${f.base}`];
    for (const m of f.modsBase) morceaux.push(`+${fmt(m.valeur)} ${m.label}`);
    if (f.veteran) morceaux.push('× vétéran (T-01)');
    if (f.bonusDefPct.length > 0) {
      morceaux.push(`+${fmt(f.bonusDefPct.reduce((s, m) => s + m.valeur, 0) * 100)} % défensif`);
    }
    for (const m of f.modsPost) morceaux.push(`+${fmt(m.valeur)} ${m.label}`);
    return morceaux.join('  ·  ');
  }

  const verdict = $derived.by(() => {
    if (!detail) return null;
    const jets = detail.rounds.map((r) => (r.jet === null ? 'sans riposte' : `jet ${fmt(r.jet)}`));
    switch (detail.issue) {
      case 'victoire-attaquant':
        return `Victoire ${nomDe(detail.attaquant.unitId)} : force ${fmt(detail.attaquant.force)} contre ${fmt(detail.defenseur.force)} — ${jets.join(', ')}`;
      case 'victoire-defenseur':
        return `Victoire ${nomDe(detail.defenseur.unitId)} : force ${fmt(detail.defenseur.force)} contre ${fmt(detail.attaquant.force)} — ${jets.join(', ')}`;
      case 'survie-mutuelle':
        return `Survie mutuelle : force ${fmt(detail.attaquant.force)} contre ${fmt(detail.defenseur.force)} — ${jets.join(', ')}`;
      case 'ecrasement':
        return `Écrasement (Overrun) : force de base ${fmt(detail.ecrasement?.sAttBase ?? detail.attaquant.force)} ≥ ${detail.ecrasement?.ratio ?? 6} × S_def ${fmt(detail.ecrasement?.sDef ?? detail.defenseur.force)} — aucun assaut`;
    }
  });

  function pointerdownExt(e: PointerEvent): void {
    if (el && !el.contains(e.target as Node)) onFermer();
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') onFermer();
  }
</script>

<svelte:window onpointerdown={pointerdownExt} onkeydown={keydown} />

<div
  bind:this={el}
  class="rapport"
  style:left={`${x}px`}
  style:top={`${y}px`}
  role="dialog"
  aria-label={`Rapport de combat — case (${resume.hex.q},${resume.hex.r})`}
>
  <span class="pointeur" aria-hidden="true"></span>
  <header>
    <h2>Case ({resume.hex.q},{resume.hex.r})</h2>
    <span class="compte">{resume.participants.length} participant{resume.participants.length > 1 ? 's' : ''}</span>
    <button type="button" class="fermer" onclick={onFermer} aria-label="Fermer">×</button>
  </header>
  {#if resume.melee}
    <p class="melee">Mêlée d'instabilité <span>(R-180)</span></p>
  {/if}
  {#if verdict}
    <p class="verdict">{verdict}</p>
  {/if}
  {#if detail}
    <details class="explication">
      <summary>D'où vient sa force</summary>
      <div class="forces">
        {#each [detail.attaquant, detail.defenseur] as f (f.unitId)}
          <p class="force-ligne"><strong>{nomDe(f.unitId)}</strong> — force <span class="chiffre">{fmt(f.force)}</span></p>
          <p class="force-detail">{modLigne(f)} <span class="egal">= {fmt(f.force)}</span></p>
        {/each}
      </div>
    </details>
    {#if detail.rounds.length > 0}
      <details class="explication">
        <summary>Assauts ({detail.rounds.length})</summary>
        <ul class="assauts">
          {#each detail.rounds as r (r.round)}
            <li>
              Assaut {r.round} —
              {#if r.jet === null}
                tir sans riposte (R-59) → −1 PV à {nomDe(detail.defenseur.unitId)}
              {:else}
                jet {fmt(r.jet)} <span class="proba">(p touche {fmt(r.pTouche)})</span> → −1 PV à {nomDe(r.touche === 'attaquant' ? detail.attaquant.unitId : detail.defenseur.unitId)}
              {/if}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
  {#if resume.detailMelee}
    <details class="explication">
      <summary>Poids de mêlée</summary>
      <ul class="assauts">
        {#each resume.detailMelee.participants as p (p.unitId)}
          <li>{nomDe(p.unitId)} : force {fmt(p.force)}² × étau {fmt(p.tau)} = poids {fmt(p.poids)}{p.bonusDefPct.length > 0 ? ` (demeure : ${p.bonusDefPct.map((m) => m.label).join(', ')})` : ''}</li>
        {/each}
        <li>Tirages : {resume.detailMelee.rolls.map((j) => fmt(j)).join(' puis ')}</li>
      </ul>
    </details>
  {/if}
  <ul>
    {#each resume.participants as p (p.unitId)}
      {@const info = infoDe(p)}
      <li style:border-left-color={info.couleur}>
        <span class="logo-site" aria-hidden="true">
          {#if info.logo}
            <img
              src={info.logo}
              alt=""
              style:width={`${2.4 * info.logoEchelle}rem`}
              style:height={`${2.4 * info.logoEchelle}rem`}
            />
          {/if}
        </span>
        <div class="corps">
          <p class="nom">
            <strong>{info.nomUnite}</strong>
            <span class="faction">{info.nomFaction}</span>
            {#if p.role}
              <span class="badge role-{p.role}">{ROLE_LABELS[p.role]}</span>
            {/if}
          </p>
          <div class="pv-ligne">
            <span class="pv barre" aria-hidden="true">
              {#each Array(info.hpMax) as _, i (i)}
                <span
                  class="cellule"
                  class:perte={p.pvApres !== null && i < (p.pvAvant ?? 0) && i >= p.pvApres}
                  class:pleine={p.pvApres !== null && i < p.pvApres}
                  class:avant-seule={p.pvAvant !== null && i < p.pvAvant && p.pvApres !== null && i >= p.pvApres}
                ></span>
              {/each}
            </span>
            <span class="pv-texte" class:perte={p.pvApres !== null && p.pvAvant !== null && p.pvApres < p.pvAvant}>
              {p.pvAvant ?? '—'}→{p.pvApres ?? '—'} {delta(p.pvAvant, p.pvApres)}
            </span>
          </div>
          <p class="sort" class:mort={p.sort === 'detruit'}>
            {SORT_LABELS[p.sort]}{p.deplaceVers ? ` → (${p.deplaceVers.q},${p.deplaceVers.r})` : ''}
          </p>
        </div>
      </li>
    {/each}
  </ul>
  <footer>
    <button type="button" class="rejouer" disabled={!peutRejouer} title={peutRejouer ? 'Recentre sur la case et rejoue la résolution du tour' : 'Relecture indisponible (reconnexion) — paires pré-état purgées'} onclick={onRejouer}>
      ⟲ Rejouer ce combat
    </button>
  </footer>
</div>

<style>
  .rapport {
    position: absolute;
    z-index: 40; /* au-dessus de la carte, sous les modales */
    width: 21rem;
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    border: 1px solid var(--or-sombre, #8a6d1a);
    border-radius: 10px;
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(201, 162, 39, 0.18);
    color: var(--texte, #e9e4d3);
    padding: 0.55rem 0.7rem 0.6rem;
    animation: apparition 150ms ease-out;
    pointer-events: auto;
  }
  @keyframes apparition {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
  }
  .pointeur {
    position: absolute;
    width: 14px;
    height: 14px;
    left: 50%;
    top: -8px;
    transform: translateX(-50%) rotate(45deg);
    background: #241f16;
    border-left: 1px solid var(--or-sombre, #8a6d1a);
    border-top: 1px solid var(--or-sombre, #8a6d1a);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    border-bottom: 1px solid transparent;
    border-image: linear-gradient(90deg, transparent, var(--or, #c9a227), transparent) 1;
    padding-bottom: 0.25rem;
  }
  h2 {
    margin: 0;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    color: var(--or-clair, #e8c96a);
  }
  .compte { font-size: 0.72rem; color: var(--texte-doux, #b6ad93); margin-left: auto; }
  .fermer {
    background: none;
    border: none;
    color: var(--texte-doux, #b6ad93);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 0.15rem;
  }
  .fermer:hover { color: var(--or-clair, #e8c96a); }
  .melee {
    margin: 0.3rem 0 0;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--or, #c9a227);
  }
  .melee span { color: var(--texte-doux, #b6ad93); }
  /* COMBAT-EXPLIQUE — verdict + explications repliables (compact par défaut) */
  .verdict {
    margin: 0.35rem 0 0;
    font-size: 0.76rem;
    line-height: 1.35;
    color: var(--or-clair, #e8c96a);
  }
  details.explication {
    margin-top: 0.3rem;
    font-size: 0.72rem;
  }
  details.explication summary {
    cursor: pointer;
    color: var(--texte-doux, #b6ad93);
    letter-spacing: 0.04em;
    user-select: none;
  }
  details.explication summary:hover { color: var(--or-clair, #e8c96a); }
  .forces { margin-top: 0.25rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .force-ligne { margin: 0; color: var(--texte, #e9e4d3); }
  .force-ligne .chiffre { color: var(--or-clair, #e8c96a); }
  .force-detail {
    margin: 0 0 0 0.6rem;
    color: var(--texte-doux, #b6ad93);
    font-size: 0.68rem;
    line-height: 1.4;
  }
  .force-detail .egal { color: var(--or-clair, #e8c96a); }
  ul.assauts { list-style: none; margin: 0.25rem 0 0; padding: 0 0 0 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; color: var(--texte-doux, #b6ad93); }
  ul.assauts .proba { opacity: 0.75; }
  ul { list-style: none; margin: 0.35rem 0 0.2rem; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border-left: 3px solid;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
    padding: 0.25rem 0.4rem 0.25rem 0.3rem;
  }
  .logo-site { width: 2.6rem; height: 2.6rem; display: flex; align-items: center; justify-content: center; flex: none; }
  .logo-site img { object-fit: contain; filter: drop-shadow(0 0 3px rgba(201, 162, 39, 0.5)); }
  .corps { flex: 1; min-width: 0; }
  .nom { margin: 0; font-size: 0.82rem; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .faction { color: var(--texte-doux, #b6ad93); font-size: 0.76rem; }
  .badge {
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
    border: 1px solid;
  }
  .role-winner { color: #ffe9a8; border-color: var(--or, #c9a227); background: rgba(201, 162, 39, 0.18); }
  .role-middle { color: #cfd6dd; border-color: #5a6470; background: rgba(90, 100, 112, 0.2); }
  .role-loser { color: #f0a8a0; border-color: #8a3a30; background: rgba(138, 58, 48, 0.22); }
  .pv-ligne { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.18rem; }
  .pv { display: inline-flex; gap: 2px; background: #14120d; padding: 2px; border-radius: 3px; }
  .cellule { width: 1.05rem; height: 0.42rem; border-radius: 1px; background: #33302a; display: inline-block; }
  .cellule.pleine { background: var(--or-clair, #e8c96a); }
  .cellule.perte { background: #a8382c; }
  .pv-texte { font-size: 0.72rem; color: var(--texte-doux, #b6ad93); }
  .pv-texte.perte { color: #f0a8a0; }
  .sort { margin: 0.12rem 0 0; font-size: 0.72rem; color: var(--texte-doux, #b6ad93); }
  .sort.mort { color: #f0a8a0; }
  footer { display: flex; justify-content: flex-end; margin-top: 0.4rem; }
  .rejouer {
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    color: var(--or-clair, #e8c96a);
    background: rgba(201, 162, 39, 0.08);
    border: 1px solid var(--or-sombre, #8a6d1a);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }
  .rejouer:hover:enabled { border-color: var(--or-clair, #e8c96a); box-shadow: 0 0 10px rgba(201, 162, 39, 0.35); }
  .rejouer:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
