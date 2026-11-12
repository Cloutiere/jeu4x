#!/usr/bin/env node
/**
 * DEFENSE-VILLE-A · SONDE D'ARBITRAGE (lecture seule, zéro partie nouvelle).
 *
 * Sur les journaux JSONL d'un banc joueur :
 *   1. chutes de villes p1 (CityCaptured ET CityRazed — piège diag #1) +
 *      éliminations précoces (fin de partie avant t=75) ;
 *   2. fondations p1 par partie (critère « maintenues ≥ 5,7/partie ») ;
 *   3. PING-PONG de rappel : aller-retour A⇄B (paire de cases parcourue
 *      DEUX fois consécutivement dans les deux sens par la MÊME unité p1)
 *      — le critère canon est ZÉRO ;
 *   4. fondations SOUS LES GRIFFES : ville p1 fondée alors qu'un barbare
 *      visible (dans le condensé ennemisVisibles du tour) était à d ≤ 3.
 *
 *   node devtmp/arbitre-defense-ville.mjs <dossier-banc>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2];
if (!dossier) {
  console.error('usage : node devtmp/arbitre-defense-ville.mjs <dossier-banc>');
  process.exit(1);
}
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

function analyser(fichier) {
  const lignes = readFileSync(fichier, 'utf8').split('\n').filter(Boolean);
  let largeur = 40;
  let tour = 0;
  let fin = null;
  const units = new Map(); // id → { owner, type, q, r }
  const citiesP1 = new Map(); // id → { q, r, fondeTour }
  // ping-pong : dernier segment (unité) { fromKey→toKey } précédent
  const dernierSegment = new Map(); // id → { a, b }
  let pingPongs = [];
  let fondationsSousGriffes = [];
  let fondations = 0;
  // ennemis visibles du tour (condensé decision)
  const visiblesTour = new Map(); // tour → [{q,r,...}]
  for (const ligne of lignes) {
    let e; try { e = JSON.parse(ligne); } catch { continue; }
    if (e.type === 'meta') { largeur = e.carte?.largeur ?? largeur; continue; }
    if (e.type === 'tour') { tour = e.tour; continue; }
    if (e.type === 'decision') { visiblesTour.set(e.tour, e.condense?.monde?.ennemisVisibles ?? []); continue; }
    if (e.type === 'fin') { fin = e; continue; }
    const ev = e.evenement;
    if (!ev) continue;
    const t = ev.type;
    if (t === 'UnitProduced') {
      units.set(ev.unitId, { owner: ev.owner, type: ev.unitType, q: ev.at.q, r: ev.at.r });
    } else if (t === 'BarbarianSpawned') {
      units.set(ev.unitId, { owner: ev.owner ?? 'barbarien', type: ev.unitType ?? 'guerrier', q: ev.at.q, r: ev.at.r });
    } else if (t === 'Move' || t === 'Retreat' || t === 'UnitExpelled') {
      const u = units.get(ev.unitId);
      if (!u) continue;
      const from = `${u.q},${u.r}`;
      const to = `${ev.to.q},${ev.to.r}`;
      if (from !== to && u.owner !== 'barbarien') {
        const prev = dernierSegment.get(ev.unitId);
        if (prev && prev.a === to && prev.b === from) {
          // oscillation de GARNISON : un bout du cycle à d ≤ 1 d'une ville p1
          const presDeVille = (cle) => {
            const [qq, rr] = cle.split(',').map(Number);
            return [...citiesP1.values()].some((c) => dist({ q: qq, r: rr }, c, largeur) <= 1);
          };
          if (u.owner === 'p1' && (presDeVille(from) || presDeVille(to))) {
            pingPongs.push({ tour, unitId: ev.unitId, hexes: `${from}⇄${to}` });
          }
          dernierSegment.delete(ev.unitId); // un cycle compte une fois
        } else {
          dernierSegment.set(ev.unitId, { a: from, b: to });
        }
      }
      u.q = ev.to.q; u.r = ev.to.r;
    } else if (t === 'CityFounded') {
      if (ev.owner !== 'barbarien') {
        fondations += ev.owner === 'p1' ? 1 : 0;
        citiesP1.set(ev.cityId, { q: ev.at?.q ?? ev.q, r: ev.at?.r ?? ev.r, fondeTour: tour });
        // fondation sous les griffes : barbare (unité reconstruite — approx.
        // CONSIGNÉE : le fog n'est pas rejoué ici, metric comparative) à d ≤ 3
        const pos = { q: ev.at?.q ?? ev.q, r: ev.at?.r ?? ev.r };
        let barbareProche = null;
        for (const [uid, uu] of units) {
          if (uu.owner !== 'barbarien') continue;
          if (dist(pos, uu, largeur) <= 3) { barbareProche = { unitId: uid, at: { q: uu.q, r: uu.r } }; break; }
        }
        if (barbareProche) fondationsSousGriffes.push({ tour, ville: ev.cityId, at: pos, barbare: barbareProche });
      }
    } else if (t === 'UnitDied' || t === 'UnitCaptured') {
      units.delete(ev.unitId);
    } else if (t === 'CityRazed') {
      units.delete(ev.unitId);
    }
  }
  const chutes = lignes.reduce((acc, l) => {
    let e; try { e = JSON.parse(l); } catch { return acc; }
    const ev = e.evenement;
    if (ev && (ev.type === 'CityCaptured' || ev.type === 'CityRazed')) {
      const de = ev.fromOwner ?? ev.owner;
      if (de === 'p1') acc.push({ tour: e.tour ?? ev.tour, genre: ev.type, ville: ev.cityId, de, vers: ev.toOwner ?? ev.byPlayer ?? '?' });
    }
    return acc;
  }, []);
  return { fichier: fichier.split(/[\\/]/).pop(), fin, chutes, pingPongs, fondationsSousGriffes, fondations };
}

const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.jsonl')).sort();
let totChutes = 0, totPp = 0, totFond = 0, totSousGriffes = 0, totElim = 0;
for (const f of fichiers) {
  const r = analyser(join(dossier, f));
  const elim = r.fin && r.fin.gagnant && r.fin.gagnant !== 'p1' && (r.fin.toursJoues ?? 999) < 75;
  if (elim) totElim += 1;
  totChutes += r.chutes.length;
  totPp += r.pingPongs.length;
  totFond += r.fondations;
  totSousGriffes += r.fondationsSousGriffes.length;
  console.log(`\n=== ${r.fichier} — fin: gagnant=${r.fin?.gagnant} raison=${r.fin?.raisonVictoire} tours=${r.fin?.toursJoues}${elim ? '  ⚠ ÉLIMINATION PRÉCOCE' : ''}`);
  console.log(`  fondations p1: ${r.fondations} ; chutes p1: ${r.chutes.length} ${JSON.stringify(r.chutes)}`);
  console.log(`  ping-pong A⇄B: ${r.pingPongs.length} ${JSON.stringify(r.pingPongs)}`);
  console.log(`  fondations sous les griffes (barbare visible d≤3): ${r.fondationsSousGriffes.length} ${JSON.stringify(r.fondationsSousGriffes)}`);
}
console.log(`\n===== TOTAUX (n=${fichiers.length}) =====`);
console.log(`chutes p1 (capturées + razées): ${totChutes}`);
console.log(`éliminations précoces (<t75): ${totElim}`);
console.log(`fondations p1: ${totFond} (${(totFond / Math.max(1, fichiers.length)).toFixed(1)}/partie)`);
console.log(`ping-pong A⇄B: ${totPp}`);
console.log(`fondations sous les griffes: ${totSousGriffes}`);
