import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// FOND-LOBBY : un `:global(html, body)` dans une feuille de style de composant
// s'applique à TOUTES les pages (import statique via App.svelte) et masque les
// fonds `position: fixed; z-index: -1` (ex. panorama du lobby, invisible du
// 02/10 au 16/11 — cf. REPORT-FOND-LOBBY). Interdiction structurelle.
const racine = join(__dirname, '..', 'src');

function fichiersSvelte(dir: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiersSvelte(chemin));
    else if (nom.endsWith('.svelte')) out.push(chemin);
  }
  return out;
}

describe('aucune feuille de style de composant ne style html/body en global', () => {
  it('zéro :global(html / :global(body dans les .svelte', () => {
    const fautifs = fichiersSvelte(racine)
      .map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf-8') }))
      .filter(({ contenu }) => /:global\(\s*(html|body)[,\s)]/.test(contenu));
    expect(fautifs.map((f) => f.chemin)).toEqual([]);
  });
});
