#!/usr/bin/env node
/**
 * DIAG-DEFENSE-VILLE · SCRIPT FORENSIC (lecture seule, zéro partie nouvelle).
 *
 * Reconstruit les cycles de vie depuis les journaux JSONL du banc joueur-escorte
 * (+ baseline joueur-gate) et produit, pour chaque chute de ville p1 et chaque
 * élimination, une chronologie : belligérant, force d'assaut, durée du siège,
 * garnison présente/absente, unités vivantes ailleurs, menaces visibles par Jev
 * (condensé) et ordres du tour.
 *
 *   node devtmp/diag-defense-ville.mjs > devtmp/diag-defense-ville-resultat.txt
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(import.meta.dirname, '..', 'sableuse', 'bancs');
const RAYON_SIEGE = 2; // un ennemi à ≤ 2 cases = menace directe sur la ville
const RAYON_GARNISON = 2;
const colOf = (q, r) => q + Math.floor(r / 2);
const wrapDelta = (dc, w) => {
  const m = ((dc % w) + w) % w;
  return m > w / 2 ? m - w : m;
};
function dist(a, b, w) {
  const dc = wrapDelta(colOf(a.q, a.r) - colOf(b.q, b.r), w);
  const dr = a.r - b.r;
  const dq = dc - (Math.floor(a.r / 2) - Math.floor(b.r / 2));
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function analyser(fichier, dossier, label) {
  const lignes = readFileSync(join(dossier, fichier), 'utf8').split('\n').filter(Boolean);
  let largeur = 40, meta = null, fin = null;
  const units = new Map(); // id → { owner, type, q, r, pv, fortifiee }
  const cities = new Map(); // id → { owner, q, r, fondeTour }
  const snaps = new Map(); // tour → { units, cities } (À LA DÉCISION)
  const menaces = new Map(); // tour → condense.menaces
  const ennemisVisibles = new Map(); // tour → condense.monde.ennemisVisibles
  const ordres = new Map(); // tour → motif.ordres
  const productionsParVille = new Map(); // cityId(coord) → [{tour,type}]
  const events = []; // { tour, ev }
  let tour = 0;
  const colKey = (q, r) => `${q},${r}`;

  for (const ligne of lignes) {
    let e; try { e = JSON.parse(ligne); } catch { continue; }
    if (e.type === 'meta') { meta = e; largeur = e.carte?.largeur ?? largeur; continue; }
    if (e.type === 'tour') {
      tour = e.tour;
      snaps.set(tour, {
        units: new Map([...units.entries()].map(([k, v]) => [k, { ...v }])),
        cities: new Map([...cities.entries()].map(([k, v]) => [k, { ...v }])),
      });
      continue;
    }
    if (e.type === 'decision') {
      menaces.set(e.tour, e.condense?.menaces ?? []);
      ennemisVisibles.set(e.tour, e.condense?.monde?.ennemisVisibles ?? []);
      continue;
    }
    if (e.type === 'motif') { ordres.set(e.tour, e.ordres); continue; }
    if (e.type === 'fin') { fin = e; continue; }
    const ev = e.evenement;
    if (!ev) continue;
    events.push({ tour, ev });
    const t = ev.type;
    if (t === 'UnitProduced') {
      units.set(ev.unitId, { owner: ev.owner, type: ev.unitType, q: ev.at.q, r: ev.at.r, pv: null, fortifiee: false });
      const k = colKey(ev.at.q, ev.at.r);
      if (!productionsParVille.has(k)) productionsParVille.set(k, []);
      productionsParVille.get(k).push({ tour, type: ev.unitType, owner: ev.owner, unitId: ev.unitId });
    } else if (t === 'Move' || t === 'Retreat' || t === 'UnitExpelled') {
      const u = units.get(ev.unitId);
      if (u) { u.q = ev.to.q; u.r = ev.to.r; }
    } else if (t === 'Fortify') {
      const u = units.get(ev.unitId); if (u) u.fortifiee = true;
    } else if (t === 'BarbarianSpawned') {
      units.set(ev.unitId, { owner: ev.owner ?? 'barbarien', type: ev.unitType ?? 'guerrier', q: ev.at.q, r: ev.at.r, pv: null, fortifiee: false });
    } else if (t === 'ArmyFormed') {
      const chef = units.get(ev.unitId);
      if (chef) { chef.q = ev.at.q; chef.r = ev.at.r; }
      for (const m of ev.memberIds ?? []) { const mu = units.get(m); if (mu) { mu.q = ev.at.q; mu.r = ev.at.r; } }
    } else if (t === 'CityFounded') {
      cities.set(ev.cityId, { owner: ev.owner, q: ev.at.q, r: ev.at.r, fondeTour: tour });
    } else if (t === 'CityCaptured') {
      const c = cities.get(ev.cityId);
      if (c) c.owner = ev.toOwner;
    } else if (t === 'CityRazed') {
      const c = cities.get(ev.cityId);
      if (c) c.razee = true, c.razepar = ev.byPlayer;
      cities.delete(ev.cityId);
    } else if (t === 'CombatExchange') {
      const d = units.get(ev.defenderId);
      if (d && ev.defenderHpAfter === 0) units.delete(ev.defenderId);
      const a = units.get(ev.attackerId);
      if (a && ev.attackerHpAfter === 0) units.delete(ev.attackerId);
    } else if (t === 'UnitDestroyed') {
      units.delete(ev.unitId);
    }
  }

  const sortie = { label, fichier, meta, fin, chutes: [], colonsP1: [] };
  if (meta) for (const j of meta.joueurs ?? []) sortie['pilote_' + j.id] = j.pilote;

  // Chutes = CityCaptured ou CityRazed (perte définitive de la ville).
  for (const { tour: T, ev } of events) {
    if (ev.type !== 'CityCaptured' && ev.type !== 'CityRazed') continue;
    const raze = ev.type === 'CityRazed';
    const snap = snaps.get(T) ?? { units: new Map(), cities: new Map() };
    const de = raze ? ev.owner : ev.fromOwner;
    const vers = raze ? (ev.byPlayer ?? 'barbarien') : ev.toOwner;
    const ville = { id: ev.cityId, owner: de, q: ev.at.q, r: ev.at.r };
    const ennemis = [], garnison = [], ailleurs = [];
    for (const [id, u] of snap.units) {
      const d = dist(u, ville, largeur);
      if (u.owner !== de && u.owner !== 'neutre' && d <= RAYON_SIEGE) {
        ennemis.push({ id, owner: u.owner, type: u.type, q: u.q, r: u.r, d });
      } else if (u.owner === de) {
        const entry = { id, type: u.type, q: u.q, r: u.r, d, fortifiee: u.fortifiee };
        (d <= RAYON_GARNISON ? garnison : ailleurs).push(entry);
      }
    }
    // Durée du siège : premier tour où un ennemi était à ≤ 2 cases (snapshots).
    let siegeDepuis = null, premierAssaut = null;
    for (let t = 0; t <= T; t++) {
      const s = snaps.get(t);
      if (!s) continue;
      for (const [, u] of s.units) {
        if (u.owner !== ville.owner && u.owner !== 'neutre' && dist(u, ville, largeur) <= RAYON_SIEGE) { siegeDepuis = t; break; }
      }
      if (siegeDepuis != null) break;
    }
    for (const { tour: t, ev: e2 } of events) {
      if (e2.type === 'Attack' && t <= T && dist(e2.at, ville, largeur) <= RAYON_SIEGE) { premierAssaut = t; break; }
    }
    // Menaces Jev : tours où le condensé portait une menace, avant la chute.
    const menaceTours = [];
    for (let t = 0; t <= T; t++) {
      const m = menaces.get(t);
      if (m && m.length) menaceTours.push({ tour: t, menaces: m });
    }
    // Production historique de la ville.
    const prod = productionsParVille.get(colKey(ville.q, ville.r)) ?? [];
    sortie.chutes.push({
      tour: T, ville: ville.id, de, vers, at: ev.at,
      genre: raze ? 'RAZEE' : 'CAPTUREE',
      plunder: ev.plunder ?? null,
      assaillants: ennemis,
      garnison, ailleurs,
      siegeDepuis, premierAssaut,
      menacesJev: menaceTours.slice(-5),
      ordresTour: ordres.get(T) ?? null,
      productionVille: prod,
      fondeTour: (() => { const c0 = snaps.get(T)?.cities.get(ev.cityId); return c0?.fondeTour ?? null; })(),
    });
  }
  return sortie;
}

const fichiers = (d) => readdirSync(d).filter((f) => f.endsWith('.jsonl')).sort();
for (const dossier of ['joueur-escorte', 'joueur-gate']) {
  const d = join(RACINE, dossier, 'journaux');
  for (const f of fichiers(d)) {
    const r = analyser(f, d, dossier);
    console.log(`\n===== ${dossier} · ${f} =====`);
    console.log(`pilotes: p1=${r.pilote_p1 ?? '?'} p2=${r.pilote_p2 ?? '?'}; fin: gagnant=${r.fin?.gagnant} raison=${r.fin?.raisonVictoire} tours=${r.fin?.toursJoues}`);
    if (!r.chutes.length) { console.log('aucune chute de ville.'); continue; }
    for (const c of r.chutes) {
      console.log(`--- CHUTE (${c.genre}) t${c.tour} ville ${c.ville} (fondée t${c.fondeTour}) @${c.at.q},${c.at.r} : ${c.de} → ${c.vers}${c.plunder != null ? ` (plunder ${c.plunder})` : ''}`);
      console.log(`    siège : ennemi à ≤2 depuis t${c.siegeDepuis ?? 'JAMAIS'}, premier assaut t${c.premierAssaut ?? 'aucun'}`);
      console.log(`    assaillants: ${JSON.stringify(c.assaillants)}`);
      console.log(`    garnison (≤2): ${JSON.stringify(c.garnison)}`);
      console.log(`    unités ${c.de} ailleurs: ${JSON.stringify(c.ailleurs)}`);
      console.log(`    menaces Jev (condensé, ≤5 dernieres avant chute): ${JSON.stringify(c.menacesJev)}`);
      console.log(`    ordres tour ${c.tour}: ${JSON.stringify(c.ordresTour)}`);
      console.log(`    production dans cette ville: ${JSON.stringify(c.productionVille)}`);
    }
  }
}
