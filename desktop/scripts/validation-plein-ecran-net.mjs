/**
 * PLEIN-ÉCRAN NET — preuve sur écran RÉEL (CopyFromScreen, comme le F11 d'Erik).
 * Coquille dev (localhost:5174, profil isolé) → labo #/labo-rendu → F11 via le
 * pont preload → CopyFromScreen plein écran + lecture du DPR et du buffer canvas.
 */
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const OUT = path.join(DESKTOP, '..', 'dev-logs', 'captures-plein-ecran-net');
fs.mkdirSync(OUT, { recursive: true });

const grab = (fichier) =>
  execSync(
    `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Dpi { [DllImport(\\"user32.dll\\")] public static extern bool SetProcessDPIAware(); }'; [Dpi]::SetProcessDPIAware() | Out-Null; Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${path.join(OUT, fichier).replace(/\\/g, '/')}'); $g.Dispose(); $bmp.Dispose()"`,
  );

const app = await electron.launch({
  args: ['.', '--env=dev', '--profil=' + path.join(DESKTOP, 'tmp-profil-fix-f11')],
  cwd: DESKTOP,
});
try {
  const win = await (async () => {
    // config dev : devtools ouvert → viser la fenêtre qui sert le jeu
    for (let i = 0; i < 20; i++) {
      for (const w of app.windows()) {
        if (w.url().includes('localhost:5174')) return w;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('fenêtre de jeu localhost:5174 introuvable');
  })();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await win.evaluate(() => { location.hash = '#/labo-rendu'; });
  await win.waitForTimeout(6000);
  await win.bringToFront();
  await win.waitForTimeout(400);

  // zoom caméra sur les unités (molette au centre du canvas, où elles se trouvent)
  await win.mouse.move(640, 500);
  for (let i = 0; i < 6; i++) { await win.mouse.wheel(0, -240); await win.waitForTimeout(80); }
  await win.waitForTimeout(800);

  // FENÊTRÉ : capture réelle de l'écran (la fenêtre occupe une partie)
  grab('reel-fenetre.png');

  // PLEIN ÉCRAN (pont preload = F11), la caméra garde sa pose
  await win.evaluate(() => window.gameShell.toggleFullscreen());
  await win.waitForTimeout(3000);
  console.log('état :', await win.evaluate(() => ({ dpr: window.devicePixelRatio })));
  console.log('canvas :', await win.evaluate(() => {
    const el = document.querySelector('canvas');
    const r = el.getBoundingClientRect();
    return { css: [Math.round(r.width), Math.round(r.height)], buffer: [el.width, el.height] };
  }));
  // amener le CENTRE du canvas au centre du viewport, puis molette dessus
  const centre = await win.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    const dy = r.y + r.height / 2 - innerHeight / 2;
    window.scrollTo(0, scrollY + dy);
    return new Promise((ok) => setTimeout(() => {
      const q = document.querySelector('canvas').getBoundingClientRect();
      ok({ x: q.x + q.width / 2, y: q.y + q.height / 2 });
    }, 300));
  });
  await win.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 8; i++) { await win.mouse.wheel(0, -240); await win.waitForTimeout(100); }
  await win.waitForTimeout(1000);
  grab('reel-pleinecran.png');
  console.log('OK — captures réelles dans', OUT);

  // retour fenêtré (propreté)
  await win.evaluate(() => window.gameShell.toggleFullscreen());
  await win.waitForTimeout(1000);
} finally {
  await app.close();
}
