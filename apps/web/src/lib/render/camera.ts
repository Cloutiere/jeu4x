/**
 * Caméra de la carte (L1) : pan par glisser, zoom molette borné
 * (ZOOM_MIN/ZOOM_MAX), recentrage. Espace écran = pixels CSS du canvas ;
 * espace monde = unités du plateau (case de rayon HEX_SIZE).
 */
import { ZOOM_MAX, ZOOM_MIN } from './hexView.js';
import type { Rect } from './hexView.js';

export class Camera {
  x = 0;
  y = 0;
  scale = 1;

  /** Rect monde visible à l'écran. */
  worldRect(viewW: number, viewH: number): Rect {
    return { x: -this.x / this.scale, y: -this.y / this.scale, w: viewW / this.scale, h: viewH / this.scale };
  }

  /** Pan en pixels écran. */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /**
   * Zoom molette ancré sur le curseur : le point monde sous le curseur reste
   * sous le curseur. `factor` > 1 = avant. Borné à [ZOOM_MIN, ZOOM_MAX].
   */
  zoomAt(screenX: number, screenY: number, factor: number): boolean {
    const target = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.scale * factor));
    if (target === this.scale) return false;
    const worldX = (screenX - this.x) / this.scale;
    const worldY = (screenY - this.y) / this.scale;
    this.scale = target;
    this.x = screenX - worldX * this.scale;
    this.y = screenY - worldY * this.scale;
    return true;
  }

  /** Centre la vue sur un point monde (bornes respectées). */
  centerOn(worldX: number, worldY: number, viewW: number, viewH: number): void {
    this.x = viewW / 2 - worldX * this.scale;
    this.y = viewH / 2 - worldY * this.scale;
  }

  /** Empêche la carte de sortir entièrement de la vue (marge 30 %). */
  clamp(bounds: Rect, viewW: number, viewH: number): void {
    const marginX = bounds.w * 0.3;
    const marginY = bounds.h * 0.3;
    const centerX = (viewW / 2 - this.x) / this.scale;
    const centerY = (viewH / 2 - this.y) / this.scale;
    const cx = Math.min(Math.max(centerX, bounds.x - marginX), bounds.x + bounds.w + marginX);
    const cy = Math.min(Math.max(centerY, bounds.y - marginY), bounds.y + bounds.h + marginY);
    this.x = viewW / 2 - cx * this.scale;
    this.y = viewH / 2 - cy * this.scale;
  }
}
