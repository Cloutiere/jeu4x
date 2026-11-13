import { readFileSync } from 'node:fs';
import { simulerPartie, corpusBanc } from '../src/bancBotTd.js';
const avant = JSON.parse(readFileSync('../../devtmp/banc-bot-td-APRES-defense.json', 'utf8')).mesures;
const temoin = corpusBanc(40)[0]!;
let ok = true;
for (const difficulte of ['facile','normal','difficile'] as const) {
  const m = simulerPartie(difficulte, temoin, 150);
  const ref = avant.find((x: any) => x.difficulte === difficulte && x.seed === temoin);
  const meme = JSON.stringify(m) === JSON.stringify(ref);
  console.log(difficulte, 'bit-à-bit vs banc A (2f95e59) :', meme);
  ok = ok && meme;
}
console.log(ok ? 'BOTS INCHANGÉS — banc bot 40×3 de la tranche A reste valable' : 'DIVERGENCE');
