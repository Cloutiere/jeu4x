/** L3 — comparaison v4/it4 JEV-IT4-FIN-PARTIE (miroir analyse-contact.mjs). */
import { readFileSync, readdirSync } from 'node:fs';
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
    // JEV-IT4 : décisions de fin de partie (gate D3 + choix).
    const finPartie = lignes.filter(o => o.type === 'decision' && o.questions?.finPartie);
    const choixFin = finPartie.map(o => ({ tour: o.tour, choix: o.reponses?.finPartie?.choice ?? null, repli: o.repli === true })).filter(x => x.choix);
    const prodV = lignes.filter(o => o.type === 'decision' && o.reponses?.productionVictoire?.choice && o.reponses.productionVictoire.choice !== 'aucun').map(o => ({ tour: o.tour, choix: o.reponses.productionVictoire.choice }));
    const prot = lignes.filter(o => o.type === 'decision' && o.reponses?.protegerCapitale?.choice === 'proteger').length;
    parties.push({ f, seed: meta.seed, decl: decl.filter(d => d.ok).length, avantRencontre, fondationsJev, villesJevFin: fin?.joueursFin?.p1?.villes ?? 0, gagnant: fin?.gagnant, cout: fin?.coutTotalUsd ?? 0, tours: fin?.toursJoues, choixFin, prodV, prot });
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
    decisionsFinPartie: somme('prot'),
  };
}

const it4 = analyser('bancs/joueur-it4-2026-10-31');
console.log(`=== ${it4.dossier} ===`);
console.log(`guerres déclarées (ok): ${it4.guerres} — AVANT rencontre+délai: ${it4.avantRencontre}`);
console.log(`fondations Jev: ${it4.fondationsJev} — villes Jev fin/partie: ${it4.villesJevFin.toFixed(2)}`);
console.log(`victoires Jev: ${it4.victoiresJev}/${it4.n} — tours moy ${it4.toursMoy.toFixed(0)} — coût ${it4.cout.toFixed(4)} $`);
for (const p of it4.parties) {
  console.log(`  seed ${p.seed}: ${p.decl} décl, fondations ${p.fondationsJev}, villes fin ${p.villesJevFin}, gagnant ${p.gagnant}`);
  for (const c of p.choixFin) console.log(`    t${c.tour} finPartie → ${c.choix}`);
  for (const c of p.prodV) console.log(`    t${c.tour} productionVictoire → ${c.choix}`);
}
