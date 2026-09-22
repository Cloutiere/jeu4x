import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// FENETRE-GRANDE L1 : la marge par défaut de Chromium sur body (8 px) faisait
// dépasser la page du viewport (main.game height:100vh + 16 px) → scrollbar
// verticale parasite en partie. Le reset global doit rester en place.
const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf-8');

describe('reset CSS global (app.css)', () => {
  it('annule la marge/padding par défaut de html/body', () => {
    expect(CSS).toMatch(/(?:^|[,]\s*)(?:html|body)[^{]*\{[^}]*margin\s*:\s*0/s);
    expect(CSS).toMatch(/(?:^|[,]\s*)(?:html|body)[^{]*\{[^}]*padding\s*:\s*0/s);
  });

  it('est importé dans main.ts avant le montage Svelte', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf-8');
    expect(main).toMatch(/import\s+['"]\.\/app\.css['"]/);
  });
});
