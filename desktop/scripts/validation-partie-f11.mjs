/**
 * PLEIN-ÉCRAN NET — par une VRAIE PARTIE (demande Erik 20/09) : lobby →
 * nouvelle partie solo → F11 (pont preload) → CopyFromScreen écran réel.
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
    `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Dpi { [DllImport(\\"user32.dll\\")] public static extern bool SetProcessDPIAware(); }'; [Dpi]::SetProcessDPIAware() | Out-Null; Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${path.join(OUT, fichier).replace(new RegExp('\\\\', 'g'), '/')}'); $g.Dispose(); $bmp.Dispose()"`,
  );

const app = await electron.launch({
  args: ['.', '--env=dev', '--profil=' + path.join(DESKTOP, 'tmp-profil-fix-f11')],
  cwd: DESKTOP,
});
try {
  const win = await (async () => {
    for (let i = 0; i < 20; i++) {
      for (const w of app.windows()) {
        if (w.url().includes('localhost:5174')) return w;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('fenêtre de jeu introuvable');
  })();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await win.waitForTimeout(4000);
  // connexion locale (mode stub) — ignorée si déjà connecté (profil persistant)
  const connecte = await win.evaluate(() => {
    const input = document.querySelector('input');
    const btn = [...document.querySelectorAll('button')].find((b) => /entrer/i.test(b.textContent));
    if (!input || !btn) return false;
    input.value = 'Erik';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
    return true;
  });
  console.log('connexion stub :', connecte);
  await win.waitForTimeout(2500);
  console.log('=== LOBBY CONNECTÉ ===');
  console.log(await win.evaluate(() => document.body.innerText.slice(0, 1200)));
  // partie solo (contre le bot) puis Créer
  await win.evaluate(() => {
    const solo = [...document.querySelectorAll('label, button, input')].find((b) => /partie solo/i.test((b.textContent || '') + (b.value || '')));
    if (solo) { solo.click(); return 'solo coché'; } return 'solo introuvable';
  });
  await win.waitForTimeout(400);
  const cree = await win.evaluate(() => {
    const el = [...document.querySelectorAll('button, input[type=submit], [role=button]')].find((b) => /r[êe]er/.test((b.textContent || b.value || '').trim()));
    if (!el) return false;
    el.click();
    return true;
  });
  console.log('Créer cliqué :', cree);
  await win.waitForTimeout(9000);
  console.log('=== EN JEU ? ===');
  console.log('hash:', await win.evaluate(() => location.hash));
  console.log(await win.evaluate(() => document.body.innerText.slice(0, 300)));
  await win.bringToFront();
  await win.waitForTimeout(400);
  grab('reel-partie-fenetre.png');
  // F11 via le pont preload
  await win.evaluate(() => window.gameShell.toggleFullscreen());
  await win.waitForTimeout(4000);
  console.log('état :', await win.evaluate(() => ({ dpr: window.devicePixelRatio, canvas: (() => { const el = document.querySelector('canvas'); return el ? [el.width, el.height] : null; })() })));
  grab('reel-partie-pleinecran.png');
  console.log('OK');
  await win.evaluate(() => window.gameShell.toggleFullscreen());
  await win.waitForTimeout(800);
} finally {
  await app.close();
}
