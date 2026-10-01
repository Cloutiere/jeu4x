<script lang="ts">
  import { onDestroy } from 'svelte';
  /**
   * FULLSCREEN-PERF · L0 — mini HUD perf du calque dev (bar-dev).
   * Affiche FPS, frame time moyenne/max de la dernière seconde et la
   * résolution réellement rendue (backing store × DPR) — lit
   * window.__game.perfResume() posé par GameCanvas (dev uniquement).
   * Zéro coût hors calque dev : ce composant n'est monté que dans .bar-dev.
   */
  let resume: {
    fps: number;
    frameMoyenneMs: number | null;
    frameMaxMs: number | null;
    dpr: number;
    cssW: number;
    cssH: number;
    backingW: number | null;
    backingH: number | null;
  } | null = null;

  let dernierTick = 0;
  function raf(now: number): void {
    if (now - dernierTick >= 500) {
      dernierTick = now;
      const g = (window as unknown as Record<string, unknown>).__game as
        | { perfResume?: () => typeof resume }
        | undefined;
      resume = g?.perfResume?.() ?? null;
    }
    rafId = requestAnimationFrame(raf);
  }
  let rafId = requestAnimationFrame(raf);
  onDestroy(() => cancelAnimationFrame(rafId));

  function couleurFps(fps: number): string {
    if (fps >= 55) return 'perf-ok';
    if (fps >= 30) return 'perf-moyen';
    return 'perf-mauvais';
  }
</script>

{#if resume}
  <span
    class="hud-perf {couleurFps(resume.fps)}"
    title="FPS / frame time (1 s) + résolution de rendu (backing store = CSS × DPR). FULLSCREEN-PERF L0."
  >
    {resume.fps} fps · {resume.frameMoyenneMs ?? '—'} ms
    {#if resume.backingW}
      · {resume.backingW}×{resume.backingH}px (css {resume.cssW}×{resume.cssH}, dpr {resume.dpr})
    {/if}
  </span>
{/if}

<style>
  .hud-perf {
    font-variant-numeric: tabular-nums;
    padding: 1px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
  }
  .perf-ok {
    color: #7ddc8a;
    border-color: #2c5c38;
  }
  .perf-moyen {
    color: #e8c96a;
    border-color: #6c5c24;
  }
  .perf-mauvais {
    color: #e87a6a;
    border-color: #6c2c24;
  }
</style>
