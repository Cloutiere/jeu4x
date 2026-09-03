<script lang="ts">
  /**
   * Menu de gouvernement — Phase 7h (RULES.md §8.7, R-121/R-122).
   * Régimes disponibles (tech débloquée OU Grande Pyramide contrôlée — R-125),
   * modificateurs ET pénalités affichés (valeurs exactes du document d'Erik),
   * régime actif, bouton « Adopter » avec avertissement Anarchie 1 tour
   * (T-29) — sauf bascule sans Anarchie à la complétion de la tech (R-122,
   * invitation du conseiller). SetGovernment = action immédiate (comme
   * SetResearch/SetConversion) : modifiable en phase ordres, même verrouillé.
   */
  import { GOVERNMENTS, ANARCHY_TURNS, isInAnarchy } from '@game/rules';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId } from '../lib/render/interaction.js';

  interface Props {
    view: GameView;
    client: GameClient;
    onClose(): void;
  }
  let { view, client, onClose }: Props = $props();

  const me = $derived.by(() => {
    const id = myEngineId(view);
    return id && view.state ? view.state.players[id] ?? null : null;
  });
  const hasPyramid = $derived.by(() => {
    const id = myEngineId(view);
    if (!id || !view.state) return false;
    return Object.values(view.state.cities).some((c) => c.owner === id && c.wonders.includes('grande_pyramide'));
  });
  const inAnarchy = $derived(me ? isInAnarchy(me, view.turn) : false);

  interface Row {
    id: string;
    name: string;
    techName: string | null;
    available: boolean;
    active: boolean;
    free: boolean; // adoption sans Anarchie (tech complétée ce tour — R-122)
    effect: string;
    penalty: string | null;
  }

  const rows = $derived.by<Row[]>(() => {
    if (!me) return [];
    const unlocked = me.techsUnlocked ?? [];
    const fresh = me.techsUnlockedThisTurn ?? [];
    const current = me.government ?? 'despotisme';
    return Object.values(GOVERNMENTS).map((g) => {
      const techOk = !g.tech || unlocked.includes(g.tech);
      const available = (techOk || hasPyramid) && current !== g.id;
      const free = !!g.tech && fresh.includes(g.tech);
      return {
        id: g.id,
        name: g.name,
        techName: g.tech ? g.tech : null,
        available,
        active: current === g.id,
        free,
        effect: g.effectLabel,
        penalty: g.penaltyLabel,
      };
    });
  });
</script>