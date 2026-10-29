/**
 * CHAT-SOCLE (Erik 29/10) — le chat multijoueur : interface ready, rencontre
 * par fog R-73, persistance serveur hors état moteur (zéro LLM — D6).
 *
 *  - formes (EN PREMIER — leçon d'or 7f) + hygiène (débit D4, longueur) ;
 *  - privacité (D4, miroir DIPLOMATIE-T2) : règle pure `voitCanal` ;
 *  - persistance : historique servi par message dédié (D3), survit à la
 *    reconnexion ;
 *  - rencontre (D2) : première vision d'une entité adverse → PlayerMet une
 *    fois par paire, conversation déverrouillée (e2e — marche d'un guerrier
 *    vers l'ennemi sur carte libre).
 */
import { describe, expect, it, vi } from 'vitest';
import type { GameCreationSettings } from '@game/shared';
import type { GameState } from '@game/rules';
import {
  CHAT_LONGUEUR_MAX,
  chatShapeError,
  debitApres,
  debitDepasse,
  historiquePour,
  nouvellesRencontres,
  pairesRencontrees,
  voitCanal,
  avecMessage,
} from '../src/chat.js';
import { SELF } from 'cloudflare:test';
import { adminDump, createGame, joinGame, makeToken, openGameSocket } from './helpers.js';
import type { AdminDump, TestSocket } from './helpers.js';

vi.setConfig({ testTimeout: 180_000 });

const LIBRE_SOLO3: GameCreationSettings = { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 3 };
const Miroir2: GameCreationSettings = { mapId: 'pedagogique-40', turnTimerMinutes: null, isPublic: false, playerCount: 2 };

// ---------------------------------------------------------------------------
// Noyau pur — forme, hygiène, privacité, rencontres
// ---------------------------------------------------------------------------

describe('CHAT-SOCLE · noyau pur', () => {
  it('forme (EN PREMIER — leçon d\'or 7f) : canal/texte invalides refusés', () => {
    expect(chatShapeError('general', 'bonjour')).toBeNull();
    expect(chatShapeError('', 'bonjour')).toBe('canal invalide');
    expect(chatShapeError('x'.repeat(65), 'bonjour')).toBe('canal invalide');
    expect(chatShapeError('p2', '')).toBe('texte vide');
    expect(chatShapeError('p2', '   ')).toBe('texte vide');
    expect(chatShapeError('p2', 42 as unknown as string)).toBe('texte invalide');
    expect(chatShapeError('p2', 'a'.repeat(CHAT_LONGUEUR_MAX))).toBeNull();
    expect(chatShapeError('p2', 'a'.repeat(CHAT_LONGUEUR_MAX + 1))).toContain('trop long');
  });

  it('débit D4 : fenêtre glissante 10/30 s', () => {
    const t0 = 1_000_000;
    const pleins = Array.from({ length: 10 }, (_, i) => t0 - i * 1000);
    expect(debitDepasse(pleins, t0)).toBe(true);
    expect(debitDepasse(pleins.slice(1), t0)).toBe(false);
    const vieux = Array.from({ length: 10 }, (_, i) => t0 - 31_000 - i * 1000);
    expect(debitDepasse(vieux, t0)).toBe(false);
    expect(debitApres(vieux, t0)).toEqual([t0]); // les anciens sont purgés
  });

  it('privacité D4 (règle unique) : Général = tous, individuel = aux DEUX seulement', () => {
    expect(voitCanal('p1', 'p1', 'general')).toBe(true);
    expect(voitCanal('p3', 'p1', 'general')).toBe(true);
    expect(voitCanal('p1', 'p1', 'p2')).toBe(true); // auteur
    expect(voitCanal('p2', 'p1', 'p2')).toBe(true); // destinataire
    expect(voitCanal('p3', 'p1', 'p2')).toBe(false); // le tiers ne voit RIEN
    const log = [
      { partie: 'ABC123', tour: 3, auteur: 'p1', canal: 'general', texte: 'a', horodatage: 1 },
      { partie: 'ABC123', tour: 3, auteur: 'p1', canal: 'p2', texte: 'secret', horodatage: 2 },
      { partie: 'ABC123', tour: 4, auteur: 'p2', canal: 'p1', texte: 'réponse', horodatage: 3 },
    ];
    expect(historiquePour(log, 'p3').map((m) => m.texte)).toEqual(['a']);
    expect(historiquePour(log, 'p1').map((m) => m.texte)).toEqual(['a', 'secret', 'réponse']);
    expect(historiquePour(log, 'p2').map((m) => m.texte)).toEqual(['a', 'secret', 'réponse']);
  });

  it('historique plafonné : les plus anciens tombent', () => {
    let log = [] as Parameters<typeof avecMessage>[0];
    for (let i = 0; i < 505; i++) {
      log = avecMessage(log, { partie: 'X', tour: 1, auteur: 'p1', canal: 'general', texte: `m${i}`, horodatage: i });
    }
    expect(log).toHaveLength(500);
    expect(log[0]!.texte).toBe('m5');
  });

  it('rencontres D2 : première vision d\'une entité adverse (unité OU ville), une fois par paire', () => {
    const tuile = (terrain = 'plaine') => ({ terrain, q: 0, r: 0 });
    const etat = (entites: { units?: Record<string, unknown>; cities?: Record<string, unknown> }) =>
      ({
        mapWidth: 8,
        turn: 2,
        map: Object.fromEntries(['0,0', '1,0', '2,0', '3,0', '0,1', '1,1', '2,1', '-1,0', '-1,1', '0,2', '1,2'].map((k) => [k, tuile()])),
        units: entites.units ?? {},
        cities: entites.cities ?? {},
        players: { p1: { defeated: false }, p2: { defeated: false } },
      }) as unknown as GameState;

    // Hors de portée : rien.
    const loin = etat({
      units: {
        u1: { id: 'u1', type: 'guerrier', q: 0, r: 0, owner: 'p1', aboard: null },
        u2: { id: 'u2', type: 'guerrier', q: 3, r: 0, owner: 'p2', aboard: null },
      },
    });
    expect(nouvellesRencontres(loin, {})).toEqual({});

    // À portée : rencontre SYMÉTRIQUE.
    const pres = etat({
      units: {
        u1: { id: 'u1', type: 'guerrier', q: 0, r: 0, owner: 'p1', aboard: null },
        u2: { id: 'u2', type: 'guerrier', q: 1, r: 0, owner: 'p2', aboard: null },
      },
    });
    const apres = nouvellesRencontres(pres, {});
    expect(apres.p1).toEqual(['p2']);
    expect(apres.p2).toEqual(['p1']);
    // Une fois par paire : déjà connue → aucun changement.
    expect(nouvellesRencontres(pres, apres)).toEqual(apres);
    expect(pairesRencontrees(apres, nouvellesRencontres(pres, apres))).toEqual([]);
    expect(pairesRencontrees({}, apres)).toEqual([
      { joueur: 'p1', rencontre: 'p2' },
      { joueur: 'p2', rencontre: 'p1' },
    ]);

    // Une VILLE adverse compte (D2 : unité ou ville) — p1 voit depuis son unité.
    const ville = etat({
      units: { u1: { id: 'u1', type: 'guerrier', q: 0, r: 0, owner: 'p1', aboard: null } },
      cities: { c1: { id: 'c1', q: 1, r: 1, owner: 'p2' } },
    });
    expect(nouvellesRencontres(ville, {}).p1).toEqual(['p2']);

    // Un joueur éliminé ne rencontre plus (et n'est plus rencontré — il n'a
    // plus d'entités actives de toute façon).
    const defs = etat({
      units: {
        u1: { id: 'u1', type: 'guerrier', q: 0, r: 0, owner: 'p1', aboard: null },
        u2: { id: 'u2', type: 'guerrier', q: 1, r: 0, owner: 'p2', aboard: null },
      },
    });
    (defs.players.p2 as { defeated: boolean }).defeated = true;
    expect(nouvellesRencontres(defs, {})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// E2E — GameDO (delivery temps réel, hygiène, persistance, rencontre)
// ---------------------------------------------------------------------------

/** Position d'une unité à moi depuis mon dernier Snapshot. */
function positionUnite(snap: { state: { units: Record<string, { id: string; owner: string; q: number; r: number; type: string }> } }, engineId: string): { id: string; q: number; r: number } {
  const [id, u] = Object.entries(snap.state.units).find(([, u]) => u.owner === engineId) ?? [];
  if (!id || !u) throw new Error(`aucune unité pour ${engineId}`);
  return { id, q: u.q, r: u.r };
}

/** Pas vers la cible en axial (réduit la distance hex) — voisin praticable testé par l'appelant.
 *  Wrap-aware : le monde est un cylindre Est↔Ouest (CARTE-RONDE) — le dq est
 *  replié dans [−largeur/2, largeur/2) avant de choisir la direction. */
function pasVers(de: { q: number; r: number }, vers: { q: number; r: number }, largeur = 40): { q: number; r: number } {
  let dq = vers.q - de.q;
  const dr = vers.r - de.r;
  if (dq > largeur / 2) dq -= largeur;
  if (dq < -largeur / 2) dq += largeur;
  if (dq > 0 && dr <= 0) return { q: de.q + Math.min(1, dq), r: de.r };
  if (dr > 0 && dq <= 0) return { q: de.q, r: de.r + 1 };
  if (dq < 0 && dr >= 0) return { q: de.q - 1, r: de.r };
  if (dr < 0 && dq >= 0) return { q: de.q, r: de.r - 1 };
  // coin : les deux positifs ou les deux négatifs → diagonale
  return { q: de.q + Math.sign(dq), r: de.r + Math.sign(dr) };
}

/** Distance hex wrap-aware (cylindre Est↔Ouest, largeur 40). */
function distWrap(a: { q: number; r: number }, b: { q: number; r: number }, largeur = 40): number {
  let dq = Math.abs(b.q - a.q);
  if (dq > largeur / 2) dq = largeur - dq;
  return dq + Math.abs(b.r - a.r);
}
function replier(h: { q: number; r: number }, largeur = 40): { q: number; r: number } {
  return { q: ((h.q % largeur) + largeur) % largeur, r: h.r };
}

/**
 * Socket de test À HISTORIQUE (miroir helpers.openSocket) : les messages sont
 * ARCHIVÉS, jamais consommés — `attendre` scrute depuis un index. Aucune
 * course de waitFor ne peut voler un message hors phase (leçon de la mise au
 * point : la pompe à waitFor unique fait des deadlocks en multi-tours).
 */
import { PROTO_VERSION } from '@game/shared';
class MiniSocket {
  hist: Array<Record<string, unknown>> = [];
  private ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
  }
  static async open(code: string, token: string): Promise<MiniSocket> {
    const res = await SELF.fetch(`https://example.com/ws/game/${code}?token=${encodeURIComponent(token)}`, {
      headers: { upgrade: 'websocket' },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    const s = new MiniSocket(ws);
    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        s.hist.push(JSON.parse(ev.data as string) as Record<string, unknown>);
      } catch {
        // ignore
      }
    });
    ws.accept();
    return s;
  }
  send(m: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ proto: PROTO_VERSION, ...m }));
  }
  close(): void {
    this.ws.close();
  }
  /** Premier message vérifiant `pred` à partir de `depuis` (scrutation, timeout). */
  async attendre(pred: (m: Record<string, unknown>) => boolean, depuis = 0, delaiMs = 60_000): Promise<Record<string, unknown>> {
    const fin = Date.now() + delaiMs;
    for (;;) {
      const m = this.hist.slice(depuis).find(pred);
      if (m) return m;
      if (Date.now() > fin) throw new Error(`attente expirée (${delaiMs} ms)`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  async attendreType(type: string, depuis = 0, delaiMs = 60_000): Promise<Record<string, unknown>> {
    return this.attendre((m) => m.type === type, depuis, delaiMs);
  }
  /** Comme attendre, mais retourne l'INDEX du message trouvé (curseur). */
  async attendreIndex(pred: (m: Record<string, unknown>) => boolean, depuis = 0, delaiMs = 60_000): Promise<number> {
    const fin = Date.now() + delaiMs;
    for (;;) {
      const i = this.hist.slice(depuis).findIndex(pred);
      if (i >= 0) return depuis + i;
      if (Date.now() > fin) throw new Error(`attente expirée (${delaiMs} ms)`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

type SnapMinimal = { state: { turn: number; map: Record<string, { terrain: string } | undefined>; units: Record<string, { id: string; owner: string; q: number; r: number; type: string }>; cities: Record<string, { owner: string; production: { item: unknown } | null } | undefined> } };

/** Fait marcher l'unité (préférence combattante, re-sélection à la mort) vers
 *  l'entité adverse la plus proche (BFS wrap-aware sur la carte COMPLÈTE du
 *  dump admin), jusqu'à RENCONTRE (dump) ou épuisement des tours. */
async function marcherJusquARencontre(
  sockets: Array<{ ws: MiniSocket; engineId: string; snapshot: SnapMinimal }>,
  code: string,
): Promise<void> {
  const praticable = (t?: { terrain: string }) =>
    // case inconnue (absente du dump) = autorisée — le moteur revalide tout
    // à la résolution (fog R-161, terrain, occupation). Les villes sont
    // traversables pour le BFS (approche d'une capitale adverse).
    t ? !['eau', 'ocean', 'montagne'].includes(t.terrain) : true;
  const poidsUnite = (u: { type: string; id: string }): number =>
    ({ eclaireur: 0, guerrier: 1, archer: 2 }[u.type] ?? 3) * 1000 + Number(u.id.replace(/\D/g, '') || 0);
  const marcheurs = sockets.map((s) => {
    const candidats = Object.entries(s.snapshot.state.units).filter(([, u]) => u.owner === s.engineId);
    const [id] = candidats.sort((a, b) => poidsUnite(a[1]) - poidsUnite(b[1]))[0]!;
    return { ...s, unitId: id, cible: null as { q: number; r: number; id?: string } | null, curseur: 0 };
  });
  // Dump admin (NON filtré) vu lâchement — le test lit carte/unités/rencontres.
  type Dump = AdminDump & { chat?: { log?: unknown[]; rencontres?: Record<string, string[]> }; state: SnapMinimal['state'] | null };
  for (let tour = 0; tour < 60; tour++) {
    const dumpAvant = (await adminDump(code)) as unknown as Dump;
    if ((dumpAvant.chat?.rencontres ?? {}).p1?.length) return;
    // Phase 1 : chaque humain programme son chemin (≤ 3 pas) et verrouille.
    for (const m of marcheurs) {
      const dernierSnapshot = m.snapshot;
      if (!dernierSnapshot.state.units[m.unitId]) {
        const candidats = Object.entries(dernierSnapshot.state.units).filter(([, u]) => u.owner === m.engineId);
        if (candidats.length === 0) {
          // plus aucune unité : verrouiller pour ne pas bloquer la résolution
          m.ws.send({ type: 'EndTurn' });
          continue;
        }
        m.unitId = candidats.sort((a, b) => poidsUnite(a[1]) - poidsUnite(b[1]))[0]![0];
        m.cible = null;
      }
      const moi = positionUniteId(dernierSnapshot, m.unitId);
      // Cible : l'entité adverse la plus proche (distance WRAP-AWARE,
      // hystérésis ≥ 2 contre l'oscillation entre deux cibles à égalité).
      const ennemis = Object.values(dumpAvant.state!.units).filter((u) => u.owner !== m.engineId && u.owner !== 'barbares');
      const meilleure = ennemis
        .map((u) => ({ u, d: distWrap(moi, u) }))
        .sort((a, b) => a.d - b.d || a.u.id.localeCompare(b.u.id))[0];
      if (meilleure) {
        if (!m.cible || !ennemis.some((u) => u.id === (m.cible as { id?: string }).id)) m.cible = meilleure.u;
        else if (distWrap(moi, m.cible) - meilleure.d >= 2) m.cible = meilleure.u;
      }
      // BFS sur la carte COMPLÈTE du dump (admin — non filtrée). Le wrap
      // Est↔Ouest est géré à la résolution de clé (q bruts négatifs à l'Ouest).
      const cle = (h: { q: number; r: number }): string => {
        const k = `${h.q},${h.r}`;
        return dumpAvant.state!.map[k] ? k : `${replier(h).q},${h.r}`;
      };
      if (!m.cible) {
        m.ws.send({ type: 'EndTurn' });
        continue;
      }
      const départ = cle(moi);
      const arrivée = cle(m.cible);
      let chemin: Array<{ q: number; r: number }> = [];
      if (départ !== arrivée) {
        const préc = new Map<string, string>();
        const file = [départ];
        const vus = new Set([départ]);
        while (file.length > 0 && !préc.has(arrivée)) {
          const cur = file.shift()!;
          const [cq, cr] = cur.split(',').map(Number) as [number, number];
          for (const [dq, dr] of [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]] as const) {
            const h = cle({ q: cq + dq, r: cr + dr });
            if (vus.has(h)) continue;
            const tuile = dumpAvant.state!.map[h];
            if (!tuile || !praticable(tuile)) continue;
            vus.add(h);
            préc.set(h, cur);
            file.push(h);
          }
        }
        let cur = préc.has(arrivée) ? arrivée : null;
        while (cur && préc.get(cur) !== départ) {
          const [dq, dr] = cur.split(',').map(Number) as [number, number];
          chemin.unshift({ q: dq, r: dr });
          cur = préc.get(cur) ?? null;
        }
        chemin = chemin.slice(0, 3); // mp d'une guerrière = 2 ; surplus ignoré
      }
      if (chemin.length > 0) {
        const avant = m.ws.hist.length;
        m.ws.send({ type: 'SubmitOrder', order: { type: 'MultiStep', unitId: m.unitId, path: chemin.map((h) => replier(h)) } });
        // l'ordre peut être refusé (case occupée, fog) — sans conséquence :
        // le verrouillage part et le cycle continue.
        await m.ws.attendreIndex((x) => x.type === 'OrderAck' || x.type === 'Error', avant, 10_000);
      }
      if (chemin.length > 0) {
        const avant = m.ws.hist.length;
        m.ws.send({ type: 'SubmitOrder', order: { type: 'MultiStep', unitId: m.unitId, path: chemin.map((h) => replier(h)) } });
        // l'ordre peut être refusé (case occupée, fog) — sans conséquence :
        // le verrouillage part et le cycle continue.
        await m.ws.attendreIndex((x) => x.type === 'OrderAck' || x.type === 'Error', avant, 10_000);
      }
      // Une ville SANS production bloque la fin de tour (blocage production) :
      // programmer une guerrière sur chaque ville muette avant de verrouiller.
      for (const [cityId, c] of Object.entries(dernierSnapshot.state.cities ?? {})) {
        if (c && c.owner === m.engineId && !c.production) {
          const avant = m.ws.hist.length;
          m.ws.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId, item: { kind: 'unit', id: 'guerrier' } } });
          await m.ws.attendreIndex((x) => x.type === 'OrderAck' || x.type === 'Error', avant, 10_000);
        }
      }
      m.ws.send({ type: 'EndTurn' });
    }
    // Phase 2 — verrouillage POLLING : re-EndTurn chaque seconde (un EndTurn
    // parti pendant la résolution précédente est refusé sans conséquence)
    // jusqu'au TurnResult du nouveau tour — robuste à l'ordre des deux
    // verrouillages (la résolution part au DERNIER).
    for (const m of marcheurs) {
      const tourPrécédent = (m.snapshot as unknown as { state: { turn: number } }).state.turn;
      const échéance = Date.now() + 30_000;
      let trouvé = false;
      while (!trouvé) {
        m.ws.send({ type: 'EndTurn' });
        try {
          const idx = await m.ws.attendreIndex(
            (x) => x.type === 'TurnResult' && (x as unknown as SnapMinimal).state.turn > tourPrécédent,
            m.curseur,
            1_000,
          );
          m.snapshot = m.ws.hist[idx] as unknown as SnapMinimal;
          m.curseur = idx + 1;
          trouvé = true;
        } catch {
          if (Date.now() > échéance) throw new Error(`${m.engineId} : tour ${tourPrécédent + 1} jamais résolu`);
        }
      }
    }
  }
  throw new Error('rencontre non obtenue en 60 tours');
}

/** Position d'une unité donnée depuis un snapshot. */
function positionUniteId(snap: SnapMinimal, unitId: string): { q: number; r: number } {
  const u = snap.state.units[unitId];
  if (!u) throw new Error(`unité ${unitId} absente du snapshot`);
  return { q: u.q, r: u.r };
}

describe('CHAT-SOCLE · GameDO — forme, Général, hygiène, persistance', () => {
  it('formes refusées : texte vide / trop long / canal inconnu → Error badMessage', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO3);
    const ws = await openGameSocket(code, await makeToken('dev:alice', 'Alice'));
    await ws.waitFor('Welcome');
    await ws.waitFor('Snapshot');
    ws.send({ type: 'ChatSend', canal: 'general', texte: '   ' });
    expect(((await ws.waitFor('Error')) as { message: string }).message).toBe('texte vide');
    ws.send({ type: 'ChatSend', canal: '', texte: 'x' });
    expect(((await ws.waitFor('Error')) as { message: string }).message).toBe('canal invalide');
    ws.send({ type: 'ChatSend', canal: 'general', texte: 'a'.repeat(CHAT_LONGUEUR_MAX + 1) });
    expect(((await ws.waitFor('Error')) as { message: string }).message).toContain('trop long');
    ws.close();
  });

  it('Général : écho temps réel (partie/tour/auteur/canal), texte ROGNÉ', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO3);
    const ws = await openGameSocket(code, await makeToken('dev:alice', 'Alice'));
    await ws.waitFor('Welcome');
    const snap = (await ws.waitFor('Snapshot')) as { state: { turn: number } };
    ws.send({ type: 'ChatSend', canal: 'general', texte: '  salut  ' });
    const msg = (await ws.waitFor('ChatMessage')) as unknown as { message: Record<string, unknown> };
    expect(msg.message).toMatchObject({ partie: code, tour: snap.state.turn, auteur: 'p1', canal: 'general', texte: 'salut' });
    ws.close();
  });

  it('canal individuel VERROUILLÉ avant la rencontre (fait de fog — D2)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO3);
    const ws = await openGameSocket(code, await makeToken('dev:alice', 'Alice'));
    await ws.waitFor('Welcome');
    await ws.waitFor('Snapshot');
    ws.send({ type: 'ChatSend', canal: 'p2', texte: 'coucou' });
    const err = (await ws.waitFor('Error')) as { message: string };
    expect(err.message).toContain('non rencontré');
    // canal inconnu : idem
    ws.send({ type: 'ChatSend', canal: 'p9', texte: 'coucou' });
    expect(((await ws.waitFor('Error')) as { message: string }).message).toBe('canal invalide');
    // auto-canal : refusé
    ws.send({ type: 'ChatSend', canal: 'p1', texte: 'moi' });
    expect(((await ws.waitFor('Error')) as { message: string }).message).toBe('canal invalide');
    ws.close();
  });

  it('débit D4 : 10 messages passent, le 11e est refusé', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO3);
    const ws = await openGameSocket(code, await makeToken('dev:alice', 'Alice'));
    await ws.waitFor('Welcome');
    await ws.waitFor('Snapshot');
    for (let i = 0; i < 10; i++) {
      ws.send({ type: 'ChatSend', canal: 'general', texte: `m${i}` });
      await ws.waitFor('ChatMessage');
    }
    ws.send({ type: 'ChatSend', canal: 'general', texte: 'm10' });
    expect(((await ws.waitFor('Error')) as { message: string }).message).toContain('débit dépassé');
    ws.close();
  });

  it('persistance D3 : l\'historique survit à la reconnexion (message dédié)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO3);
    const ws = await openGameSocket(code, await makeToken('dev:alice', 'Alice'));
    await ws.waitFor('Welcome');
    await ws.waitFor('Snapshot');
    ws.send({ type: 'ChatSend', canal: 'general', texte: 'premier' });
    await ws.waitFor('ChatMessage');
    ws.send({ type: 'ChatSend', canal: 'general', texte: 'deuxième' });
    await ws.waitFor('ChatMessage');
    ws.close();

    // Reconnexion : NOUVEAU socket, l'historique complet est rejoué.
    const ws2 = await openGameSocket(code, await makeToken('dev:alice', 'Alice'));
    const welcome = (await ws2.waitFor('Welcome')) as { rencontres?: string[] };
    expect(Array.isArray(welcome.rencontres)).toBe(true);
    await ws2.waitFor('Snapshot');
    ws2.send({ type: 'ChatHistory' });
    const hist = (await ws2.waitFor('ChatHistory')) as { messages: Array<{ texte: string; auteur: string }> };
    expect(hist.messages.map((m) => m.texte)).toEqual(['premier', 'deuxième']);
    ws2.close();
  });
});

describe('CHAT-SOCLE · GameDO — Général à N humains + rencontre (fog R-73)', () => {
  it('Général : les 3 humains reçoivent ; le dump admin expose le log', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, { ...LIBRE_SOLO3, solo: false, isPublic: false });
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);
    await joinGame({ id: 'dev:carol', name: 'Carol' }, code);
    const alice = await openGameSocket(code, await makeToken('dev:alice', 'Alice'));
    const bob = await openGameSocket(code, await makeToken('dev:bob', 'Bob'));
    const carol = await openGameSocket(code, await makeToken('dev:carol', 'Carol'));
    for (const s of [alice, bob, carol]) {
      await s.waitFor('Welcome');
      await s.waitFor('Snapshot');
    }
    alice.send({ type: 'ChatSend', canal: 'general', texte: 'bienvenue' });
    for (const s of [alice, bob, carol]) {
      const m = (await s.waitFor('ChatMessage')) as { message: { auteur: string; texte: string } };
      expect(m.message).toMatchObject({ auteur: 'p1', texte: 'bienvenue' });
    }
    const dump = (await adminDump(code)) as unknown as { chat?: { log: unknown[] } };
    expect(dump.chat?.log).toHaveLength(1);
    ws_close(alice, bob, carol);
  });

  it('D2 : première vision → PlayerMet UNE FOIS, conversation déverrouillée, privacité du canal', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, Miroir2);
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);
    const alice = await MiniSocket.open(code, await makeToken('dev:alice', 'Alice'));
    const bob = await MiniSocket.open(code, await makeToken('dev:bob', 'Bob'));
    const snapA = (await alice.attendreType('Snapshot')) as unknown as SnapMinimal;
    const snapB = (await bob.attendreType('Snapshot')) as unknown as SnapMinimal;

    // Avant la rencontre : canal individuel verrouillé (fait de fog — D2).
    alice.send({ type: 'ChatSend', canal: 'p2', texte: 'coucou' });
    const err = (await alice.attendre((m) => m.type === 'Error' && String(m.message).includes('non rencontré'))) as { message: string };
    expect(err.message).toContain('non rencontré');

    // Marche d'approche jusqu'à la première vision mutuelle.
    await marcherJusquARencontre(
      [
        { ws: alice, engineId: 'p1', snapshot: snapA },
        { ws: bob, engineId: 'p2', snapshot: snapB },
      ],
      code,
    );

    // PlayerMet livré aux DEUX (détection unique par paire — la boucle de
    // marche ne sort qu'après enregistrement ; l'événement est dans l'historique).
    const metA = (await alice.attendreType('PlayerMet')) as { joueur: string };
    const metB = (await bob.attendreType('PlayerMet')) as { joueur: string };
    expect(metA.joueur).toBe('p2');
    expect(metB.joueur).toBe('p1');
    // UNE FOIS par paire : l'historique du socket ne contient qu'un PlayerMet.
    expect(alice.hist.filter((m) => m.type === 'PlayerMet')).toHaveLength(1);

    // Conversation déverrouillée — écho à l'auteur + livraison au destinataire.
    alice.send({ type: 'ChatSend', canal: 'p2', texte: 'bonjour Bob' });
    const recu = (await bob.attendre((m) => m.type === 'ChatMessage' && (m as unknown as { message: { auteur: string } }).message.auteur === 'p1')) as unknown as { message: { canal: string; texte: string } };
    expect(recu.message).toMatchObject({ canal: 'p2', texte: 'bonjour Bob' });
    bob.send({ type: 'ChatSend', canal: 'p1', texte: 'salut Alice' });
    const retour = (await alice.attendre((m) => m.type === 'ChatMessage' && (m as unknown as { message: { auteur: string } }).message.auteur === 'p2')) as unknown as { message: { texte: string } };
    expect(retour.message.texte).toBe('salut Alice');

    // Reconnexion : l'historique COMPLET revient ; les rencontres persistent
    // (Welcome.rencontres — aucun nouveau PlayerMet fabriqué au chargement).
    alice.close();
    const alice2 = await MiniSocket.open(code, await makeToken('dev:alice', 'Alice'));
    const welcome = (await alice2.attendreType('Welcome')) as { rencontres?: string[] };
    expect(welcome.rencontres).toEqual(['p2']);
    await alice2.attendreType('Snapshot');
    alice2.send({ type: 'ChatHistory' });
    const hist = (await alice2.attendreType('ChatHistory')) as { messages: Array<{ canal: string; texte: string }> };
    expect(hist.messages.map((m) => `${m.canal}:${m.texte}`)).toEqual(['p2:bonjour Bob', 'p1:salut Alice']);
    alice2.close();
    bob.close();
  });
});

function ws_close(...sockets: TestSocket[]): void {
  for (const s of sockets) s.close();
}
