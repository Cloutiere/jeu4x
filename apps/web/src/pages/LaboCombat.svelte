<script lang="ts">
  /**
   * LABO-COMBAT (#/labo-combat) — laboratoire de programmation et de
   * résolution (handoff HANDOFF-LABO-COMBAT). Outil de développement du
   * chapitre 2D, CLIENT PUR : aucune partie, aucun appel /api, le vrai
   * moteur (@game/rules, résolution seedée R-80) tourne dans le navigateur.
   *
   *  - M1 pose libre : carte rectangulaire ajustable (pinceau de terrain),
   *    unités des DEUX joueurs + barbares, villes, camps barbares (piles) ;
   *  - M2 programmation : onglets J1/J2, chemins multi-étapes (R-158),
   *    action finale fondation, attaques — puis « Résoudre le tour » avec
   *    le moteur réel (seed affiché/modifiable, reproductible) ;
   *  - M2.4 observation : journal complet de résolution à côté de la carte
   *    (événement par événement) + avant/après (PV, morts) ;
   *  - bonus : revenir à l'état pré-résolution (snapshot) pour rejouer une
   *    variante d'ordres sur la même configuration.
   */
  import type { TerrainId } from '@game/rules';
  import {
    BARBARIAN_ID,
    TERRAINS,
    colRowToHex,
    hexDistance,
    resolveTurn,
    unitType,
  } from '@game/rules';
  import type { GameEvent, GameState, Order, PlayerId, TileKey, Unit } from '@game/rules';
  import {
    CAMPS_LABO,
    TYPES_POSABLES,
    campVersJoueur,
    construireJournal,
    creerEtatLabo,
    ordreDe,
    terrainsPosables,
    nomCamp,
  } from '../lib/laboCombat.js';
  import type { CampBarbare, CampLabo, CityLabo, UnitLabo } from '../lib/laboCombat.js';

  // --- Carte (M1.1) -----------------------------------------------------------
  let width = $state(10);
  let height = $state(8);
  let fill = $state<TerrainId>('prairie');
  /** Pinceau : overrides de terrain (clé "q,r"). */
  let terrain: Record<TileKey, TerrainId> = $state({});
  let brushTerrain = $state<TerrainId>('foret');
  let numeroterCases = $state(true);
  let seed = $state(20260915);
  let seedText = $state('20260915');
  /** Compteur T-18 initial des camps posés (0 = jamais de spawn pendant le test). */
  let spawnCountdown = $state(10);

  // --- Poses libres (M1.2/M1.3) ----------------------------------------------
  type UnitePosee = UnitLabo & { k: number };
  type VillePosee = CityLabo & { k: number };
  type CampPosee = CampBarbare & { k: number };
  let unites = $state<UnitePosee[]>([]);
  let villes = $state<VillePosee[]>([]);
  let camps = $state<CampPosee[]>([]);
  let compteurPose = $state(0);

  let outil = $state<'poser' | 'editer' | 'peindre' | 'programmer'>('poser');
  let typePose = $state<string>('guerrier');
  let campPose = $state<CampLabo>('p1');
  let pvPose = $state(3);
  let campGardes = $state(2);
  let campExplorateur = $state(true);
  let typeVillePose = $state<'p1' | 'p2'>('p1');

  // --- Programmation (M2.1) ---------------------------------------------------
  let coteProgramme = $state<'p1' | 'p2'>('p1');
  let uniteSelectionnee = $state<string | null>(null);
  let modeAttaque = $state(false);
  interface Programme {
    path: Array<{ q: number; r: number }>;
    finalFoundCity: boolean;
    attackTarget: { q: number; r: number } | null;
  }
  /** Ordres programmés, PAR CÔTÉ, par id d'unité de l'état affiché. */
  let programmes = $state<{ p1: Record<string, Programme>; p2: Record<string, Programme> }>({
    p1: {},
    p2: {},
  });

  // --- Résolution (M2.3/M2.4) -------------------------------------------------
  let etatReporte = $state<GameState | null>(null);
  let etatResolu = $state<GameState | null>(null);
  let snapshotAvant = $state<GameState | null>(null);
  let journal = $state<Array<{ seq: number; type: string; ligne: string }>>([]);
  let erreur = $state<string | null>(null);

  /** État affiché : état reporté d'un tour résolu, sinon reconstruit des poses. */
  const etatAffiche = $derived.by<GameState>(() => {
    if (etatReporte) return etatReporte;
    return creerEtatLabo({
      width,
      height,
      fill,
      terrainOverrides: terrain,
      units: unites,
      cities: villes,
      camps: camps,
      spawnCountdown,
      seed,
    });
  });

  /** Unités par case de l'état affiché (clé "q,r"). */
  const unitesParCase = $derived.by(() => {
    const parCase = new Map<TileKey, Unit[]>();
    for (const id of Object.keys(etatAffiche.units).sort()) {
      const u = etatAffiche.units[id]!;
      const key = `${u.q},${u.r}`;
      const pile = parCase.get(key) ?? [];
      pile.push(u);
      parCase.set(key, pile);
    }
    return parCase;
  });

  const villesParCase = $derived.by(() => {
    const m = new Map<TileKey, (typeof etatAffiche.cities)[string]>();
    for (const id of Object.keys(etatAffiche.cities)) {
      const c = etatAffiche.cities[id]!;
      m.set(`${c.q},${c.r}`, c);
    }
    return m;
  });

  const campsParCase = $derived.by(() => {
    const m = new Map<TileKey, number>();
    for (const v of etatAffiche.villages) m.set(`${v.q},${v.r}`, v.spawnedUnits.filter((id) => etatAffiche.units[id]).length);
    return m;
  });

  /** Toutes les cases du rectangle, triées par ligne. */
  const cases = $derived.by(() => {
    const out: Array<{ q: number; r: number }> = [];
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) out.push(colRowToHex(col, row));
    }
    return out;
  });

  // --- Rendu SVG (pointy-top axial, Red Blob) ---------------------------------
  const HEX = 30;
  function px(q: number, r: number): { x: number; y: number } {
    return { x: HEX * Math.sqrt(3) * (q + r / 2), y: HEX * 1.5 * r };
  }
  function polygonPoints(q: number, r: number): string {
    const c = px(q, r);
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push(`${(c.x + HEX * Math.cos(a)).toFixed(1)},${(c.y + HEX * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  }
  const COULEURS_TERRAIN: Record<string, string> = {
    prairie: '#86b05e',
    plaine: '#a9b76a',
    foret: '#4e7f47',
    colline: '#9c8a5a',
    montagne: '#8d8d95',
    desert: '#dcc98a',
    eau: '#5b93c4',
    ocean: '#3f6fa3',
  };
  // Couleurs d'accent codifiées (textures.ts PLAYER_COLORS — SPEC-ART §3.3/§4,
  // décision Erik : le rouge est réservé aux barbares).
  const COULEURS_CAMP: Record<string, string> = {
    p1: '#3dffce', // menthe néon
    p2: '#3b6fd6', // bleu vif
    [BARBARIAN_ID]: '#e03131', // rouge barbare
  };
  const TEXTE_CAMP: Record<string, string> = {
    p1: '#0b3b32', // sombre sur menthe claire
    p2: '#ffffff',
    [BARBARIAN_ID]: '#ffffff',
  };
  function couleurTerrain(q: number, r: number): string {
    const t = terrain[`${q},${r}`] ?? fill;
    return COULEURS_TERRAIN[t] ?? '#ccc';
  }
  function bordViewBox(): string {
    let maxX = 0;
    let maxY = 0;
    for (const c of cases) {
      const p = px(c.q, c.r);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const m = HEX + 6;
    return `${-m} ${-m} ${maxX + 2 * m} ${maxY + 2 * m}`;
  }

  // --- Édition (M1.2) ---------------------------------------------------------
  let cibleEdition = $state<{ k: number; kind: 'unite' | 'ville' | 'camp' } | null>(null);
  const poseeEdition = $derived.by(() => {
    if (!cibleEdition) return null;
    if (cibleEdition.kind === 'unite') return unites.find((u) => u.k === cibleEdition!.k) ?? null;
    if (cibleEdition.kind === 'ville') return villes.find((c) => c.k === cibleEdition!.k) ?? null;
    return camps.find((c) => c.k === cibleEdition!.k) ?? null;
  });

  function cliquerCase(q: number, r: number): void {
    erreur = null;
    const key = `${q},${r}`;
    if (outil === 'peindre') {
      terrain = { ...terrain, [key]: brushTerrain };
      return;
    }
    if (outil === 'poser') {
      poser(q, r);
      return;
    }
    if (outil === 'editer') {
      editer(q, r);
      return;
    }
    if (outil === 'programmer') programmerClic(q, r);
  }

  function poser(q: number, r: number): void {
    const key = `${q},${r}`;
    if (TERRAINS[terrain[key] ?? fill]?.passable === false) {
      erreur = `Case ${key} : terrain infranchissable (${terrain[key] ?? fill}).`;
      return;
    }
    if (typePose === '__ville') {
      poserVilleSur(q, r);
      return;
    }
    if (typePose === '__camp') {
      poserCamp(q, r);
      return;
    }
    compteurPose += 1;
    const k = compteurPose;
    unites.push({ k, type: typePose, camp: campPose, q, r, hp: Math.min(pvPose, unitType(typePose).hpMax) });
  }

  function poserCamp(q: number, r: number): void {
    if (camps.some((c) => c.q === q && c.r === r)) {
      erreur = `Camp déjà posé en (${q},${r}).`;
      return;
    }
    compteurPose += 1;
    camps.push({ k: compteurPose, q, r, gardes: campGardes, explorateur: campExplorateur });
  }

  function poserVilleSur(q: number, r: number): void {
    compteurPose += 1;
    villes.push({ k: compteurPose, camp: typeVillePose, q, r, pop: 1, capital: false });
  }

  function editer(q: number, r: number): void {
    const key = `${q},${r}`;
    const unite = unites.find((u) => u.q === q && u.r === r);
    if (unite) {
      cibleEdition = { k: unite.k, kind: 'unite' };
      return;
    }
    const ville = villes.find((c) => c.q === q && c.r === r);
    if (ville) {
      cibleEdition = { k: ville.k, kind: 'ville' };
      return;
    }
    const camp = camps.find((c) => c.q === q && c.r === r);
    if (camp) {
      cibleEdition = { k: camp.k, kind: 'camp' };
      return;
    }
    cibleEdition = null;
  }

  function supprimerEditee(): void {
    if (!cibleEdition) return;
    if (cibleEdition.kind === 'unite') unites = unites.filter((u) => u.k !== cibleEdition!.k);
    else if (cibleEdition.kind === 'ville') villes = villes.filter((c) => c.k !== cibleEdition!.k);
    else camps = camps.filter((c) => c.k !== cibleEdition!.k);
    cibleEdition = null;
  }

  function reconstruireCarte(): void {
    terrain = {};
    unites = [];
    villes = [];
    camps = [];
    programmes = { p1: {}, p2: {} };
    etatReporte = null;
    etatResolu = null;
    snapshotAvant = null;
    journal = [];
    uniteSelectionnee = null;
    cibleEdition = null;
  }

  // --- Programmation (M2.1) ---------------------------------------------------
  function ordreProgramme(unitId: string): Programme | null {
    return programmes[coteProgramme][unitId] ?? null;
  }

  function programmerClic(q: number, r: number): void {
    if (etatResolu) {
      erreur = 'Résolution affichée — revenir à l’avant-résolution pour reprogrammer.';
      return;
    }
    const key = `${q},${r}`;
    if (!uniteSelectionnee) {
      const pile = unitesParCase.get(key) ?? [];
      const mienne = pile.find((u) => u.owner === coteProgramme);
      if (mienne) uniteSelectionnee = mienne.id;
      return;
    }
    const unite = etatAffiche.units[uniteSelectionnee];
    if (!unite) {
      uniteSelectionnee = null;
      return;
    }
    if (modeAttaque) {
      if (hexDistance({ q: unite.q, r: unite.r }, { q, r }) !== 1) {
        erreur = 'Attaque : la cible doit être ADJACENTE à l’unité (R-46).';
        return;
      }
      programmes[coteProgramme][unite.id] = { path: [], finalFoundCity: false, attackTarget: { q, r } };
      modeAttaque = false;
      return;
    }
    // Chemin multi-étapes (R-158) : chaque pas adjacent au précédent, premier
    // pas adjacent à l'unité ; repasser sur le départ annule le dernier pas.
    const prog = programmes[coteProgramme][unite.id] ?? { path: [], finalFoundCity: false, attackTarget: null };
    if (q === unite.q && r === unite.r) {
      if (prog.path.length > 0) prog.path = prog.path.slice(0, -1);
      programmes[coteProgramme] = { ...programmes[coteProgramme], [unite.id]: prog };
      return;
    }
    const dernier = prog.path.length > 0 ? prog.path[prog.path.length - 1]! : { q: unite.q, r: unite.r };
    if (hexDistance(dernier, { q, r }) !== 1) {
      erreur = `Chemin : case (${q},${r}) non adjacente au dernier pas (${dernier.q},${dernier.r}).`;
      return;
    }
    if (TERRAINS[terrain[key] ?? fill]?.passable === false) {
      erreur = `Chemin : terrain infranchissable en (${q},${r}).`;
      return;
    }
    prog.path = [...prog.path, { q, r }];
    programmes[coteProgramme] = { ...programmes[coteProgramme], [unite.id]: prog };
  }

  function toggleFinalFound(): void {
    if (!uniteSelectionnee) return;
    const prog = ordreProgramme(uniteSelectionnee) ?? { path: [], finalFoundCity: false, attackTarget: null };
    prog.finalFoundCity = !prog.finalFoundCity;
    prog.attackTarget = null;
    programmes[coteProgramme] = { ...programmes[coteProgramme], [uniteSelectionnee]: prog };
  }

  function tenir(): void {
    if (!uniteSelectionnee) return;
    programmes[coteProgramme] = {
      ...programmes[coteProgramme],
      [uniteSelectionnee]: { path: [], finalFoundCity: false, attackTarget: null },
    };
  }

  function effacerOrdre(): void {
    if (!uniteSelectionnee) return;
    const copie = { ...programmes[coteProgramme] };
    delete copie[uniteSelectionnee];
    programmes[coteProgramme] = copie;
  }

  /** Ordres moteurs du côté donné (depuis la programmation du labo). */
  function ordresDuCote(side: 'p1' | 'p2'): Order[] {
    const ordres: Order[] = [];
    for (const id of Object.keys(programmes[side]).sort()) {
      const unite = etatAffiche.units[id];
      if (!unite) continue;
      const prog = programmes[side][id]!;
      const ordre = ordreDe(unite, prog.path, prog.finalFoundCity, prog.attackTarget);
      if (ordre && !(ordre.type === 'Hold' && prog.path.length === 0 && !prog.finalFoundCity && prog.attackTarget === null && false)) {
        // Hold explicite conservé (le journal montre qui tient).
        ordres.push(ordre);
      }
    }
    return ordres;
  }

  const compteurOrdres = $derived.by(() => ({
    p1: Object.keys(programmes.p1).length,
    p2: Object.keys(programmes.p2).length,
  }));

  /** Résumé lisible des ordres programmés (les deux côtés) — ce qui partira
   *  au moteur à la résolution. */
  const resumeOrdres = $derived.by(() => {
    const lignes: string[] = [];
    for (const side of ['p1', 'p2'] as const) {
      for (const id of Object.keys(programmes[side]).sort()) {
        const u = etatAffiche.units[id];
        const prog = programmes[side][id]!;
        if (!u) continue;
        const chemin = prog.attackTarget
          ? `ATTAQUE (${prog.attackTarget.q},${prog.attackTarget.r})`
          : prog.path.length > 0
            ? `chemin ${u.q},${u.r} → ${prog.path.map((h) => `(${h.q},${h.r})`).join(' → ')}`
            : 'sur place';
        lignes.push(`${side === 'p1' ? 'J1' : 'J2'} ${id} ${u.type} : ${chemin}${prog.finalFoundCity ? ' + FONDATION' : ''}`);
      }
    }
    return lignes;
  });

  /** Export complet de la disposition (poses + ordres + seed) pour
   *  reproduction exacte d'un tour. */
  async function copierDisposition(): Promise<void> {
    const json = JSON.stringify(
      {
        width,
        height,
        fill,
        terrain,
        seed,
        spawnCountdown,
        unites,
        villes,
        camps,
        ordres: resumeOrdres,
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(json);
    dispositionCopiee = true;
    setTimeout(() => (dispositionCopiee = false), 2000);
  }
  let dispositionCopiee = $state(false);

  /** Copie du journal complet (sections + résolution) pour coller à ZCode. */
  async function copierJournal(): Promise<void> {
    await navigator.clipboard.writeText(journal.map((e) => e.ligne).join('\n'));
    journalCopie = true;
    setTimeout(() => (journalCopie = false), 2000);
  }
  let journalCopie = $state(false);

  // --- Résolution (M2.3) ------------------------------------------------------
  function appliquerSeedText(): void {
    const parsed = Number.parseInt(seedText, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      seed = parsed >>> 0;
    } else {
      seedText = String(seed);
    }
  }

  function resoudre(): void {
    erreur = null;
    try {
      const avant = structuredClone(etatAffiche);
      const ordres: Record<PlayerId, Order[]> = {
        p1: ordresDuCote('p1'),
        p2: ordresDuCote('p2'),
      };
      const resultat = resolveTurn(avant, ordres, seed);
      snapshotAvant = avant;
      etatResolu = resultat.newState;
      journal = construireJournal(avant, resultat.events.map((ev: GameEvent) => ev as unknown as { type: string } & Record<string, unknown>), ordres)
        .map((ligne, i) => ({
          seq: i + 1,
          type: ligne.startsWith('ATTAQUE') ? 'Attack'
            : ligne.startsWith('échange') ? 'CombatExchange'
            : ligne.startsWith('MORT') ? 'UnitDestroyed'
            : ligne.startsWith('REPLI') ? 'Retreat'
            : ligne.includes('RÉSOLU') ? 'TurnResolved'
            : ligne.startsWith('—') || ligne.startsWith('Tour') ? 'entete'
            : 'ligne',
          ligne,
        }));
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    }
  }

  /** Bonus M2.5 : revenir à l'état pré-résolution (mêmes ordres re-jouables). */
  function revenirAvant(): void {
    etatResolu = null;
    journal = [];
  }

  /** Enchaîner : l'état résolu devient la base du tour suivant (ordres gelés). */
  function poursuivre(): void {
    if (!etatResolu) return;
    etatReporte = etatResolu;
    etatResolu = null;
    snapshotAvant = null;
    journal = [];
    programmes = { p1: {}, p2: {} };
    uniteSelectionnee = null;
  }

  function retourEditeur(): void {
    etatReporte = null;
    etatResolu = null;
    journal = [];
    programmes = { p1: {}, p2: {} };
  }

  /** Avant/après (M2.4) : unités vivantes avant vs après, morts listées. */
  const diffResolution = $derived.by(() => {
    if (!snapshotAvant || !etatResolu) return null;
    const mortes: string[] = [];
    for (const id of Object.keys(snapshotAvant.units).sort()) {
      if (!etatResolu.units[id]) {
        const u = snapshotAvant.units[id]!;
        mortes.push(`${id} ${u.type} (${nomCamp(u.owner)})`);
      }
    }
    const survive: string[] = [];
    for (const id of Object.keys(etatResolu.units).sort()) {
      const u = etatResolu.units[id]!;
      const avantU = snapshotAvant.units[id];
      const hp = avantU && avantU.hp !== u.hp ? ` (PV ${avantU.hp}→${u.hp})` : '';
      const pos = avantU && (avantU.q !== u.q || avantU.r !== u.r) ? ` en (${u.q},${u.r})` : '';
      survive.push(`${id} ${u.type} (${nomCamp(u.owner)}) PV ${u.hp}${hp}${pos}`);
    }
    return { mortes, survive, tour: etatResolu.turn };
  });

  const uniteProg = $derived(uniteSelectionnee ? etatAffiche.units[uniteSelectionnee] ?? null : null);

  /** Toutes les programmations des DEUX côtés (lignes visibles en permanence,
   *  quelle que soit l'onglet actif — la programmée du côté sélectionné est
   *  en surépaisseur). */
  const programmesAffiches = $derived.by(() => {
    const out: Array<{ side: 'p1' | 'p2'; unitId: string; unit: Unit; prog: Programme; actif: boolean }> = [];
    for (const side of ['p1', 'p2'] as const) {
      for (const id of Object.keys(programmes[side]).sort()) {
        const u = etatAffiche.units[id];
        if (u) out.push({ side, unitId: id, unit: u, prog: programmes[side][id]!, actif: side === coteProgramme && id === uniteSelectionnee });
      }
    }
    return out;
  });

  function libelleUnite(u: Unit): string {
    return `${u.id} ${u.type} (${nomCamp(u.owner)}) PV ${u.hp}/${unitType(u.type).hpMax}`;
  }

  function peutFonder(): boolean {
    return uniteProg ? unitType(uniteProg.type).canFoundCity : false;
  }

  const terrains = terrainsPosables();
</script>

<main class="labo">
  <header>
    <h1>Labo de combat — programmation &amp; résolution</h1>
    <a href="#/lobby">← Lobby</a>
    <span class="tag">client pur — moteur seedé, zéro serveur</span>
  </header>

  <div class="columns">
    <!-- ============================ COLONNE GAUCHE ============================ -->
    <aside>
      <section>
        <h2>Carte</h2>
        <label>Largeur <input type="number" bind:value={width} min="4" max="24" disabled={!!etatReporte} /></label>
        <label>Hauteur <input type="number" bind:value={height} min="4" max="24" disabled={!!etatReporte} /></label>
        <label>
          Fond
          <select bind:value={fill} disabled={!!etatReporte}>
            {#each terrains as t}<option value={t}>{t}</option>{/each}
          </select>
        </label>
        <label>Seed (carte/résolution) <input type="number" bind:value={seedText} oninput={appliquerSeedText} min="0" /></label>
        <label class="check"><input type="checkbox" bind:checked={numeroterCases} /> Numéroter les cases (q,r)</label>
        <label>Spawn barbare : dans {spawnCountdown} résolution(s) (0 = jamais)
          <input type="range" min="0" max="20" bind:value={spawnCountdown} disabled={!!etatReporte} />
        </label>
        <button type="button" onclick={reconstruireCarte} disabled={!!etatReporte}>Réinitialiser la carte</button>
      </section>

      <section>
        <h2>Outil</h2>
        <div class="outils">
          {#each [['poser', 'Poser'], ['editer', 'Éditer'], ['peindre', 'Peindre'], ['programmer', 'Programmer']] as [v, lbl] (v)}
            <button type="button" class:actif={outil === v} onclick={() => (outil = v as typeof outil)}>{lbl}</button>
          {/each}
        </div>

        {#if outil === 'poser'}
          <div class="ligne boutons">
            <button type="button" class:actif={typePose !== '__ville' && typePose !== '__camp'} onclick={() => (typePose = 'guerrier')}>Unité</button>
            <button type="button" class:actif={typePose === '__ville'} onclick={() => (typePose = '__ville')}>Ville</button>
            <button type="button" class:actif={typePose === '__camp'} onclick={() => (typePose = '__camp')}>Camp barbare</button>
          </div>
          {#if typePose !== '__ville' && typePose !== '__camp'}
            <label>
              Type d'unité
              <select bind:value={typePose}>
                {#each TYPES_POSABLES as t}<option value={t}>{t}</option>{/each}
              </select>
            </label>
            <label>
              Camp
              <select bind:value={campPose}>
                {#each CAMPS_LABO as c}<option value={c}>{c === 'p1' ? 'Joueur 1' : c === 'p2' ? 'Joueur 2' : 'Barbare'}</option>{/each}
              </select>
            </label>
            <label>PV courants : {pvPose}
              <input type="range" min="1" max="10" bind:value={pvPose} />
            </label>
          {:else if typePose === '__ville'}
            <label>
              Propriétaire
              <select bind:value={typeVillePose}>
                <option value="p1">Joueur 1</option>
                <option value="p2">Joueur 2</option>
              </select>
            </label>
            <p class="hint-small">Rayon de travail 1 posé avec la ville (R-60).</p>
          {:else}
            <label>Gardes (ne sortent jamais, T-49) : {campGardes}
              <input type="range" min="0" max="4" bind:value={campGardes} />
            </label>
            <label class="check"><input type="checkbox" bind:checked={campExplorateur} /> + 1 explorateur (agit, R-97)</label>
          {/if}
          <p class="hint-small">Clic sur une case vide = pose (pile amie autorisée). Clic sur une case occupée en mode « Éditer » pour modifier/retirer.</p>
        {:else if outil === 'peindre'}
          <label>
            Terrain du pinceau
            <select bind:value={brushTerrain}>
              {#each terrains as t}<option value={t}>{t}</option>{/each}
            </select>
          </label>
          <p class="hint-small">Clic sur une case = repeindre. La montagne et l'eau sont infranchissables.</p>
        {:else if outil === 'editer'}
          <p class="hint-small">Clic sur une unité, une ville ou un camp pour l'éditer ou le retirer.</p>
          {#if poseeEdition}
            <div class="edition">
              {#if cibleEdition?.kind === 'unite' && poseeEdition}
                {@const u = poseeEdition as UnitePosee}
                <strong>Unité posée</strong>
                <label>
                  Type
                  <select bind:value={u.type}>
                    {#each TYPES_POSABLES as t}<option value={t}>{t}</option>{/each}
                  </select>
                </label>
                <label>
                  Camp
                  <select bind:value={u.camp}>
                    {#each CAMPS_LABO as c}<option value={c}>{c === 'p1' ? 'Joueur 1' : c === 'p2' ? 'Joueur 2' : 'Barbare'}</option>{/each}
                  </select>
                </label>
                <label>PV : {u.hp}
                  <input type="range" min="1" max="10" bind:value={u.hp} />
                </label>
              {:else if cibleEdition?.kind === 'ville' && poseeEdition}
                {@const v = poseeEdition as VillePosee}
                <strong>Ville posée</strong>
                <label>Pop <input type="number" bind:value={v.pop} min="1" max="20" /></label>
                <label class="check"><input type="checkbox" bind:checked={v.capital} /> Capitale</label>
              {:else if poseeEdition}
                {@const c = poseeEdition as CampPosee}
                <strong>Camp barbare</strong>
                <label>Gardes : {c.gardes} <input type="range" min="0" max="4" bind:value={c.gardes} /></label>
                <label class="check"><input type="checkbox" bind:checked={c.explorateur} /> Explorateur</label>
              {/if}
              <button type="button" class="danger" onclick={supprimerEditee}>Retirer</button>
            </div>
          {/if}
        {:else}
          <div class="onglets">
            <button type="button" class:actif={coteProgramme === 'p1'} onclick={() => { coteProgramme = 'p1'; uniteSelectionnee = null; modeAttaque = false; }}>
              Programmer J1 ({compteurOrdres.p1})
            </button>
            <button type="button" class:actif={coteProgramme === 'p2'} onclick={() => { coteProgramme = 'p2'; uniteSelectionnee = null; modeAttaque = false; }}>
              Programmer J2 ({compteurOrdres.p2})
            </button>
          </div>
          <p class="hint-small">Clic sur une unité {coteProgramme === 'p1' ? 'menthe (J1)' : 'bleue (J2)'} = sélection. Puis clics sur la carte = chemin multi-étapes (R-158). Re-cliquer l'unité = annuler le dernier pas.</p>
          {#if uniteProg}
            <div class="edition">
              <strong>{libelleUnite(uniteProg)}</strong>
              {#if uniteSelectionnee && ordreProgramme(uniteSelectionnee)}
                {@const prog = ordreProgramme(uniteSelectionnee)!}
                <p class="hint-small">
                  Ordre : {prog.attackTarget ? `attaque (${prog.attackTarget.q},${prog.attackTarget.r})` : prog.path.length > 0 ? `chemin ${prog.path.map((h) => `(${h.q},${h.r})`).join(' → ')}` : 'sur place'}{prog.finalFoundCity ? ' + FONDATION' : ''}
                </p>
              {/if}
              <div class="ligne boutons">
                <button type="button" class:actif={modeAttaque} onclick={() => (modeAttaque = !modeAttaque)}>Attaque adjacente…</button>
                <button type="button" class:actif={ordreProgramme(uniteSelectionnee!)?.finalFoundCity} disabled={!peutFonder()} onclick={toggleFinalFound}>
                  Fonder (fin de chemin)
                </button>
              </div>
              <div class="ligne boutons">
                <button type="button" onclick={tenir}>Tenir</button>
                <button type="button" onclick={effacerOrdre}>Effacer l'ordre</button>
              </div>
            </div>
          {:else}
            <p class="hint-small">Aucune unité sélectionnée.</p>
          {/if}
        {/if}
      </section>

      {#if erreur}<p class="error">{erreur}</p>{/if}
    </aside>

    <!-- ============================== CARTE SVG =============================== -->
    <div class="carte-host">
      <svg viewBox={bordViewBox()} role="img" aria-label="Carte du labo">
        {#each cases as c (`${c.q},${c.r}`)}
          {@const key = `${c.q},${c.r}`}
          {@const centre = px(c.q, c.r)}
          <polygon
            points={polygonPoints(c.q, c.r)}
            fill={couleurTerrain(c.q, c.r)}
            stroke="#3338"
            stroke-width="1"
            data-q={c.q}
            data-r={c.r}
            onclick={(e) => cliquerCase(Number(e.currentTarget.dataset.q), Number(e.currentTarget.dataset.r))}
          />
          {#if numeroterCases}
            <text x={centre.x} y={centre.y - HEX * 0.55} text-anchor="middle" font-size="7.5" fill="#000000aa" style="pointer-events: none;">{c.q},{c.r}</text>
          {/if}
          {#if villesParCase.get(key)}
            {@const ville = villesParCase.get(key)!}
            {@const p = px(c.q, c.r)}
            <rect x={p.x - 10} y={p.y - 10} width="20" height="20" fill="#fff" stroke={COULEURS_CAMP[ville.owner] ?? '#000'} stroke-width="3" />
            <text x={p.x} y={p.y + 22} text-anchor="middle" font-size="9" fill="#222">{ville.name ?? ville.id}</text>
          {/if}
          {#if campsParCase.get(key) !== undefined}
            {@const p = px(c.q, c.r)}
            <polygon points={`${p.x},${p.y - 12} ${p.x - 11},${p.y + 9} ${p.x + 11},${p.y + 9}`} fill="#3b2c1a" stroke="#000" />
            <text x={p.x} y={p.y + 22} text-anchor="middle" font-size="9" fill="#3b2c1a">camp ×{campsParCase.get(key)}</text>
          {/if}
          {#if unitesParCase.get(key)}
            {@const pile = unitesParCase.get(key)!}
            {@const p = px(c.q, c.r)}
            {#each pile.slice(0, 3) as u, i (u.id)}
              {@const dx = pile.length > 1 ? (i - (Math.min(pile.length, 3) - 1) / 2) * 14 : 0}
              <circle cx={p.x + dx} cy={p.y - 4} r="8" fill={COULEURS_CAMP[u.owner] ?? '#000'} stroke="#fff" stroke-width="1.5" />
              <text x={p.x + dx} y={p.y - 1} text-anchor="middle" font-size="7.5" fill={TEXTE_CAMP[u.owner] ?? '#fff'}>{u.type.slice(0, 3)}</text>
            {/each}
            {#if pile.length > 3}
              <text x={p.x + 14} y={p.y - 18} font-size="9" fill="#111">×{pile.length}</text>
            {/if}
            {#each pile as u (u.id)}
              <text x={p.x + (pile.length > 1 ? 14 : 8)} y={p.y + 10} font-size="8" fill="#111">{u.hp}</text>
              {#if uniteSelectionnee === u.id}
                <circle cx={p.x} cy={p.y - 4} r="13" fill="none" stroke="#fbbf24" stroke-width="2.5" />
              {/if}
            {/each}
          {/if}
          {#each programmesAffiches as pr (pr.side + pr.unitId)}
            {#each pr.prog.path as h, i (i)}
              {#if h.q === c.q && h.r === c.r}
                {@const prev = i === 0 ? { q: pr.unit.q, r: pr.unit.r } : pr.prog.path[i - 1]!}
                {@const p = px(h.q, h.r)}
                {@const pd = px(prev.q, prev.r)}
                <line x1={pd.x} y1={pd.y} x2={p.x} y2={p.y} stroke={COULEURS_CAMP[pr.side]!} stroke-width={pr.actif ? 3 : 1.8} stroke-dasharray="4 3" opacity={pr.actif ? 1 : 0.8} />
                <circle cx={p.x} cy={p.y} r={pr.actif ? 4.5 : 3.5} fill={COULEURS_CAMP[pr.side]!} />
                {#if i === pr.prog.path.length - 1 && pr.prog.finalFoundCity}
                  <text x={p.x} y={p.y - 10} text-anchor="middle" font-size="10" fill="#92400e">⌂</text>
                {/if}
              {/if}
            {/each}
            {#if pr.prog.attackTarget && pr.prog.attackTarget.q === c.q && pr.prog.attackTarget.r === c.r}
              {@const t = px(c.q, c.r)}
              <text x={t.x} y={t.y + 5} text-anchor="middle" font-size="14" fill="#7f1d1d">⚔</text>
            {/if}
          {/each}
        {/each}
      </svg>
      {#if etatResolu}
        <div class="bandeau-resolu">Résolution du tour affichée (seed {seed})</div>
      {:else if etatReporte}
        <div class="bandeau-resolu">Tour {etatReporte.turn} — état reporté (ordres gelés des unités actifs)</div>
      {/if}
    </div>

    <!-- ============================ COLONNE DROITE ============================ -->
    <aside class="droite">
      <section>
        <h2>Résoudre</h2>
        <div class="ligne boutons">
          <button type="button" class="go" onclick={resoudre} disabled={!!etatResolu}>
            ▶ Résoudre le tour {etatAffiche.turn + 1}
          </button>
        </div>
        <p class="hint-small">
          Ordres : J1 {compteurOrdres.p1} · J2 {compteurOrdres.p2} · barbares automatiques (R-97).
          Seed {seed} — re-résoudre le même tour avec le même seed = même résultat (R-80).
        </p>
        {#if resumeOrdres.length > 0}
          <ul class="diff resume-ordres">
            {#each resumeOrdres as ligne}<li>{ligne}</li>{/each}
          </ul>
        {/if}
        <button type="button" onclick={copierDisposition}>🧾 {dispositionCopiee ? 'Copié !' : 'Copier la disposition (poses + ordres + seed)'}</button>
        <div class="ligne boutons">
          <button type="button" onclick={revenirAvant} disabled={!etatResolu}>↩ Revenir à l'avant-résolution</button>
          <button type="button" onclick={poursuivre} disabled={!etatResolu}>▶▶ Poursuivre (tour suivant)</button>
        </div>
        {#if etatReporte}
          <button type="button" class="danger" onclick={retourEditeur}>← Retour à l'éditeur (repartir de la pose libre)</button>
        {/if}
      </section>

      <section>
        <h2>Journal de résolution</h2>
        {#if journal.length === 0}
          <p class="hint-small">Aucun événement — résous un tour pour lire le journal ici.</p>
        {:else}
          <button type="button" onclick={copierJournal}>📋 {journalCopie ? 'Journal copié !' : 'Copier le journal complet'}</button>
          <ol class="journal">
            {#each journal as ev (ev.seq)}
              <li class="ev-{ev.type}">{ev.ligne}</li>
            {/each}
          </ol>
        {/if}
      </section>

      <section>
        <h2>Avant / après</h2>
        {#if !diffResolution}
          <p class="hint-small">La comparaison s'affiche après une résolution (positions, PV, morts).</p>
        {:else}
          <p class="hint-small">Fin du tour {diffResolution.tour} — {diffResolution.mortes.length} unité(s) morte(s).</p>
          {#if diffResolution.mortes.length > 0}
            <p><strong>Mortes :</strong></p>
            <ul class="diff">
              {#each diffResolution.mortes as m}<li>☠ {m}</li>{/each}
            </ul>
          {/if}
          <p><strong>Survivantes :</strong></p>
          <ul class="diff">
            {#each diffResolution.survive as s}<li>{s}</li>{/each}
          </ul>
        {/if}
      </section>
    </aside>
  </div>
</main>

<style>
  main { max-width: 160rem; margin: 1rem auto; font-family: system-ui, sans-serif; padding: 0 1rem; color: #e6e3dc; }
  header { display: flex; gap: 1.5rem; align-items: baseline; flex-wrap: wrap; }
  h1 { font-size: 1.3rem; }
  .tag { color: #777; font-size: 0.75rem; }
  .columns { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
  aside { width: 22rem; flex: none; max-width: 100%; }
  section { border: 1px solid #555; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.75rem; background: #1c1c1e; }
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  label { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
  label.check { flex-direction: row; align-items: center; }
  .hint-small { color: #777; font-size: 0.72rem; margin: 0.4rem 0; }
  .error { color: #b00020; font-size: 0.8rem; font-weight: 600; }
  .outils, .onglets { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .ligne.boutons { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  button { font-size: 0.8rem; padding: 0.25rem 0.5rem; cursor: pointer; }
  button.actif { background: #1f2937; color: #fff; }
  button.danger { color: #b00020; }
  button.go { background: #166534; color: #fff; font-weight: 600; }
  button:disabled { opacity: 0.45; cursor: default; }
  .edition { border: 1px dashed #999; border-radius: 4px; padding: 0.5rem; font-size: 0.8rem; }
  .carte-host { position: relative; flex: 1; min-width: 40rem; border: 1px solid #ccc; border-radius: 6px; overflow: auto; background: #f4f1e8; max-height: 88vh; }
  svg { width: 100%; height: auto; display: block; }
  polygon[data-q] { cursor: pointer; }
  .bandeau-resolu { position: sticky; top: 0; background: #fef3c7; border-bottom: 1px solid #d97706; font-size: 0.8rem; padding: 0.25rem 0.6rem; }
  .journal { max-height: 28rem; overflow: auto; font-size: 0.78rem; padding-left: 1.4rem; margin: 0; color: #d8d5cd; }
  .journal .ev-entete { font-weight: 700; color: #e8e4da; list-style: none; margin-left: -1.1rem; margin-top: 0.3rem; }
  .journal li { margin-bottom: 0.12rem; }
  .journal .ev-Attack { font-weight: 700; color: #7f1d1d; }
  .journal .ev-CombatExchange { color: #7f1d1d; }
  .journal .ev-UnitDestroyed { font-weight: 700; color: #000; }
  .journal .ev-Retreat { color: #92400e; }
  .journal .ev-TurnResolved { font-weight: 700; letter-spacing: 0.05em; }
  .diff { font-size: 0.75rem; max-height: 14rem; overflow: auto; margin: 0.2rem 0 0.6rem; padding-left: 1.1rem; color: #d8d5cd; }
  @media (max-width: 90rem) {
    aside { width: 100%; }
    .carte-host { min-width: 100%; }
  }
</style>
