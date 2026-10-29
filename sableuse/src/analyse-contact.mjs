/** L3 — comparaison v3/v4 JEV-CONTACT-GUERRE : guerres avant rencontre,
 * guerres totales, fondations, victoires, coût. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function analyser(dossier) {
  const lignesFichiers = readdirSync(join(dossier, 'journaux')).filter(f => f.endsWith('.jsonl'));
  const parties = [];
  for (const f of lignesFichiers) {
    const lignes = readFileSync(join(dossier, 'journaux', f), 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const meta = lignes.find(o => o.type === 'meta');
    const fin = lignes.filter(o => o.type === 'fin').pop();
    const decl = lignes.filter(o => o.type === 'diplomatie' && o.genre === 'guerre');
    let avantRencontre = 0;
    for (const d of decl) {
      const decision = lignes.find(o => o.type === 'decision' && o.tour === d.tour);
      const r = decision?.condense?.diplomatie?.rivaux?.find(x => x.id === d.cible);
      if (!r || r.rencontreTour == null || d.tour - r.rencontreTour < 10) avantRencontre += 1;
    }
    const fondationsJev = lignes.filter(o => o.type === 'fondation' && o.owner === 'p1').length;
    const villesJevFin = fin?.joueursFin?.p1?.villes ?? 0;
    const rencontreTour = lignes.filter(o => o.type === 'decision').map(o => o.condense?.diplomatie?.rivaux?.[0]?.rencontreTour).find(x => x != null) ?? null;
    const premiereDecl = decl.filter(d => d.ok).map(d => d.tour)[0] ?? null;
    parties.push({ f, seed: meta.seed, decl: decl.filter(d => d.ok).length, avantRencontre, fondationsJev, villesJevFin, gagnant: fin?.gagnant, cout: fin?.coutTotalUsd ?? 0, tours: fin?.toursJoues, rencontreTour, premiereDecl, guerreFin: (fin?.guerresInterNations ?? []).length });
  }
  const somme = k => parties.reduce((s, p) => s + p[k], 0);
  return {
    dossier, parties,
    n: parties.length,
    guerres: somme('decl'),
    avantRencontre: somme('avantRencontre'),
    fondationsJev: somme('fondationsJev'),
    villesJevFin: somme('villesJevFin') / parties.length,
    victoiresJev: parties.filter(p => p.gagnant === 'p1').length,
    cout: somme('cout'),
    toursMoy: somme('tours') / parties.length,
    guerresFin: somme('guerreFin'),
  };
}

const v3 = analyser('bancs/joueur-v3-2026-10-27');
const v4 = analyser('bancs/joueur-v4-2026-10-29');
for (const v of [v3, v4]) {
  console.log(`\n=== ${v.dossier} ===`);
  console.log(`guerres déclarées (ok): ${v.guerres} — AVANT rencontre+délai: ${v.avantRencontre}`);
  console.log(`paires en guerre en fin: ${v.guerresFin} — fondations Jev: ${v.fondationsJev} — villes Jev fin/partie: ${v.villesJevFin.toFixed(2)}`);
  console.log(`victoires Jev: ${v.victoiresJev}/${v.n} — tours moy ${v.toursMoy.toFixed(0)} — coût ${v.cout.toFixed(4)} $`);
  console.log('par partie (seed, rencontre, 1re décl, déclarations):');
  for (const p of v.parties) console.log(`  seed ${p.seed}: rencontre t${p.rencontreTour ?? '—'}, 1re décl t${p.premiereDecl ?? '—'}, ${p.decl} décl, fondations ${p.fondationsJev}, villes fin ${p.villesJevFin}`);
}
