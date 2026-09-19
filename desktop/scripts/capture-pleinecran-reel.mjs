/**
 * Capture d'écran RÉELLE (CopyFromScreen) pendant le plein écran letterbox —
 * la page seule (screenshot Playwright) ne montre pas les bandes noires.
 * Produit dev-logs/captures-electron-resolution/plein-ecran-reel-ecran.png.
 */
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const OUT = path.join(DESKTOP, '..', 'dev-logs', 'captures-electron-resolution', 'plein-ecran-reel-ecran.png');
const sendKeys = (k) =>
  execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${k}')"`,
  );
const grab = () =>
  execSync(
    `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Dpi { [DllImport(\\"user32.dll\\")] public static extern bool SetProcessDPIAware(); }'; [Dpi]::SetProcessDPIAware() | Out-Null; Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${OUT.replace(/\\/g, '/')}'); $g.Dispose(); $bmp.Dispose()"`,
  );

const app = await electron.launch({ args: ['.'], cwd: DESKTOP });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await win.waitForTimeout(1500);
  await win.bringToFront();
  await win.waitForTimeout(500);
  // Le pont preload ne dépend pas du focus clavier (contrairement à SendKeys).
  await win.evaluate(() => (window).gameShell.toggleFullscreen());
  await win.waitForTimeout(1500);
  grab();
  console.log(`capture écran réel : ${OUT}`);
  sendKeys('{F11}');
  await win.waitForTimeout(800);
} finally {
  await app.close();
}
