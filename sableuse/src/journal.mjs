/**
 * Journal JSONL (HANDOFF-JEV-POC D7) + garde-fou budget (D8).
 * Une ligne par événement : {type:'meta'|'tour'|'decision'|'evenement'|'fin'}.
 * Écrit dans sableuse/journaux/ (gitigné).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Prix public du doc TypeSafe : 0,042 $ par million de jetons d'entrée. */
export const PRIX_PAR_JETON = 0.042 / 1_000_000;

export class Journal {
  constructor(chemin) {
    this.chemin = chemin;
    mkdirSync(join(chemin, '..'), { recursive: true });
    writeFileSync(chemin, '');
    this.jetonsTotal = 0;
    this.appels = 0;
    this.latencesMs = [];
    this.ordresRejetes = 0;
    this.replis = 0;
    this.distributionsPlates = 0;
  }

  ligne(objet) {
    appendFileSync(this.chemin, JSON.stringify(objet) + '\n');
  }

  meta(donnees) {
    this.ligne({ type: 'meta', ...donnees });
  }

  tour(n) {
    this.ligne({ type: 'tour', tour: n });
  }

  evenement(ev) {
    this.ligne({ type: 'evenement', evenement: ev });
  }

  decision(d) {
    this.ligne({ type: 'decision', ...d });
    if (d.jetonsEntree) {
      this.jetonsTotal += d.jetonsEntree;
      this.appels += 1;
      if (typeof d.latenceMs === 'number') this.latencesMs.push(d.latenceMs);
    }
    this.ordresRejetes += d.ordresRejetes ?? 0;
    if (d.repli) this.replis += 1;
    if (d.plate === true) this.distributionsPlates += 1;
  }

  /** Coût cumulé estimé en dollars (entrée seule — sorties gratuites). */
  coutUsd() {
    return this.jetonsTotal * PRIX_PAR_JETON;
  }

  /** D8 : true si le plafond estimé est atteint. */
  budgetDepasse(plafondUsd) {
    return this.coutUsd() >= plafondUsd;
  }

  fin(donnees) {
    const lat = this.latencesMs;
    this.ligne({
      type: 'fin',
      coutTotalUsd: this.coutUsd(),
      jetonsEntreeTotaux: this.jetonsTotal,
      appels: this.appels,
      latenceMoyMs: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null,
      latenceMaxMs: lat.length ? Math.max(...lat) : null,
      ordresRejetesTotaux: this.ordresRejetes,
      replisTotaux: this.replis,
      distributionsPlatesTotaux: this.distributionsPlates,
      ...donnees,
    });
  }
}
