#!/usr/bin/env node
/** DEFENSE-VILLE-C — chiffrage de la CROISSANCE D'INPUT du condensé
 *  (tarif canon : coût en INPUT seulement, output gratuit). Moyennes
 *  jetonsEntree/décision et coutUsd/décision depuis les journaux JSONL. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dossier = process.argv[2];
let n = 0, entree = 0, sortie = 0, cout = 0;
for (const f of readdirSync(dossier).filter((x) => x.endsWith('.jsonl'))) {
  for (const l of readFileSync(join(dossier, f), 'utf8').split('\n')) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.type !== 'decision' || !e.reponses) continue;
    n += 1;
    entree += e.jetonsEntree ?? 0;
    sortie += e.jetonsSortie ?? 0;
    cout += e.coutUsd ?? 0;
  }
}
console.log(`${dossier.split(/[\/]/).pop()}: ${n} décisions — input/décision ${(entree / Math.max(1, n)).toFixed(0)}, sortie/décision ${(sortie / Math.max(1, n)).toFixed(0)}, $/partie ${(cout / Math.max(1, readdirSync(dossier).filter((x) => x.endsWith('.jsonl')).length)).toFixed(4)}`);
