// Serveur statique minimal pour la fonderie (le seul du dossier — aucun lien avec le jeu).
// Usage : node serveur.mjs [port]   (par défaut 5178) puis ouvrir http://localhost:5178/
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 5178;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__liste') {
      const fichiers = (await readdir(join(racine, 'modeles'))).filter(f => !f.startsWith('.'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(fichiers));
    }
    const chemin = normalize(join(racine, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!chemin.startsWith(racine)) { res.writeHead(403); return res.end(); }
    const contenu = await readFile(chemin);
    res.writeHead(200, { 'Content-Type': MIME[extname(chemin)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(contenu);
  } catch {
    res.writeHead(404); res.end('introuvable');
  }
}).listen(port, () => console.log(`Fonderie : http://localhost:${port}/`));
