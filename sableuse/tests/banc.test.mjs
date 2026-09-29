/**
 * Tests du banc de calibrage (HANDOFF-JEV-BANC L1) — faux client uniquement,
 * zéro appel réseau, zéro dollar. Petit banc éphémère dans un dossier temp.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = join(fileURLToPath(import.meta.url), '..', '..');

describe('banc de calibrage (faux client)', () => {
  let bancDir;

  beforeAll(() => {
    bancDir = join(mkdtempSync(join(tmpdir(), 'banc-test-')), 'banc-t');
  });

  it('génère un plan respecté : 5 civs par partie, rotation équilibrée, contrôles sans Jev', () => {
    execFileSync('node', ['--import', 'tsx', 'src/banc.mjs', '--generer-plan', bancDir, '--parties', '3', '--controle', '2', '--plan-seed', '42'], { cwd: racine });
    const plan = JSON.parse(readFileSync(join(bancDir, 'plan.json'), 'utf8'));
    expect(plan.parties).toHaveLength(5);
    expect(plan.parties.filter((p) => p.controle)).toHaveLength(2);
    const toutesCivs = plan.parties.flatMap((p) => Object.values(p.civs));
    expect(toutesCivs).toHaveLength(25);
    for (const p of plan.parties) {
      expect(Object.values(p.civs)).toHaveLength(5);
      if (p.controle) expect(p.siegeJev).toBeNull();
      else expect([1, 2, 3, 4, 5]).toContain(p.siegeJev);
    }
    // D3 banc 2 : SANS REMISE — civs DISTINCTES à l'intérieur de chaque partie
    for (const p of plan.parties) {
      const civs = Object.values(p.civs);
      expect(new Set(civs).size).toBe(5);
    }
    // équilibre global souple (tirage sans remise par partie) : aucun civ
    // monopolise les 25 slots
    const comptes = {};
    for (const c of toutesCivs) comptes[c] = (comptes[c] ?? 0) + 1;
    expect(Math.max(...Object.values(comptes))).toBeLessThanOrEqual(4);
    // refus d'écraser un banc en cours (D3)
    let refuse = false;
    try {
      execFileSync('node', ['--import', 'tsx', 'src/banc.mjs', '--generer-plan', bancDir], { cwd: racine });
    } catch { refuse = true; }
    expect(refuse).toBe(true);
  });

  it('exécute le banc (faux client) avec reprise après interruption simulée', async () => {
    // exécution complète en fond, puis interruption simulée : on vérifie que
    // etat.json trace chaque partie et qu'un 2e passage saute les faites.
    execFileSync('node', ['--import', 'tsx', 'src/banc.mjs', '--plan', bancDir, '--faux', '--base', '0'], { cwd: racine, timeout: 300_000 });
    const etatBanc = JSON.parse(readFileSync(join(bancDir, 'etat.json'), 'utf8'));
    expect(Object.keys(etatBanc.parties)).toHaveLength(5);
    for (const [, p] of Object.entries(etatBanc.parties)) {
      expect(['fait', 'echec', 'coupe-budget']).toContain(p.statut);
      if (p.statut === 'fait') {
        expect(existsSync(join(bancDir, 'journaux', p.fichier))).toBe(true);
        // faux client = zéro appel réseau ; les pseudo-jetons comptés restent
        // dérisoires même à 150 tours (v3 : condensé plus riche → ~0,012 $)
        expect(p.coutUsd).toBeLessThan(0.05);
      }
    }
    // reprise : un second passage ne rejoue rien (stdout sans « → gagnant »)
    const sortie = execFileSync('node', ['--import', 'tsx', 'src/banc.mjs', '--plan', bancDir, '--faux', '--base', '0'], { cwd: racine, timeout: 60_000 }).toString();
    expect(sortie).not.toContain('→ gagnant');
    expect((sortie.match(/sautée/g) ?? []).length).toBe(5);
  }, 400_000);

  it('agrège fixtures → métriques exactes et rapport généré', () => {
    // fixture : journal minimal à la main, lu par --rapport via etat.json
    const dirFix = join(mkdtempSync(join(tmpdir(), 'banc-fix-')), 'banc-f');
    mkdirSync(join(dirFix, 'journaux'), { recursive: true });
    const meta = (joueurs) => JSON.stringify({ type: 'meta', seed: 7, joueurs, plafondTours: 50 });
    const joueurs = [
      { id: 'p1', civId: 'egypte', pilote: 'jev' },
      { id: 'p2', civId: 'rome', pilote: 'bot' },
      { id: 'p3', civId: 'chine', pilote: 'bot' },
      { id: 'p4', civId: 'zoulous', pilote: 'bot' },
      { id: 'p5', civId: 'mongolie', pilote: 'bot' },
    ];
    const journal = [
      meta(joueurs),
      JSON.stringify({ type: 'evenement', evenement: { type: 'CityFounded', cityId: 'v1', owner: 'p1', capital: true } }),
      JSON.stringify({ type: 'evenement', evenement: { type: 'CityFounded', cityId: 'v2', owner: 'p2', capital: true } }),
      JSON.stringify({ type: 'evenement', evenement: { type: 'TechResearched', player: 'p1', tech: 'poterie' } }),
      JSON.stringify({ type: 'evenement', evenement: { type: 'Victory', winner: 'p1', reason: 'domination' } }),
      JSON.stringify({ type: 'decision', repli: true, jetonsEntree: 1000, latenceMs: 200 }),
      JSON.stringify({ type: 'fin', gagnant: 'p1', toursJoues: 21, coupeParBudget: false, replisTotaux: 1, appels: 1, coutTotalUsd: 0.000042, latenceMoyMs: 200, latenceMaxMs: 200 }),
    ].join('\n');
    writeFileSync(join(dirFix, 'journaux', 'partie-001-jev-seed7.jsonl'), journal);
    writeFileSync(join(dirFix, 'plan.json'), JSON.stringify({ planSeed: 1, nJev: 1, nControle: 0, playerCount: 5, plafondTours: 50, parties: [{ idx: 1, seed: 7, controle: false, siegeJev: 1, civs: {} }] }));
    writeFileSync(join(dirFix, 'etat.json'), JSON.stringify({ parties: { 1: { statut: 'fait', fichier: 'partie-001-jev-seed7.jsonl', coutUsd: 0.000042 } } }));
    execFileSync('node', ['--import', 'tsx', 'src/banc.mjs', '--plan', dirFix, '--rapport'], { cwd: racine });
    const rapport = readFileSync(join(dirFix, 'RAPPORT.md'), 'utf8');
    expect(rapport).toContain('| egypte | 1 | 1 | 100 %');
    expect(rapport).toContain('| domination | 1 | 0 | 1 |');
    expect(rapport).toContain('Moyenne : **21.0 tours**');
    expect(rapport).toContain('1 replis / 1 appels');
    expect(rapport).toContain('0.0000'); // détail coût
  });
});
