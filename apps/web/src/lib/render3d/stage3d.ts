/**
 * stage3d — scène Three.js commune aux deux options du spike (renderer,
 * lumières, bloom optionnel, resize). Le rendu du TERRAIN vit dans world3d,
 * les entités dans optionA (3D pur) ou optionB (overlay PixiJS).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Camera3D } from './camera3d.js';

export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new Camera3D();
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bloomOn = false;
  viewW = 800;
  viewH = 600;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Comptage par FRAME (le composer multi-passe écraserait info.render sinon).
    this.renderer.info.autoReset = false;
    this.scene.background = new THREE.Color(0x070b18);
    this.scene.add(new THREE.HemisphereLight(0x2c4a5a, 0x0a1420, 0.95));
    const dir = new THREE.DirectionalLight(0xe8fff6, 0.85);
    dir.position.set(-5, 9, 3);
    this.scene.add(dir);
    const halo = new THREE.PointLight(0x3dffce, 0.45, 18, 2);
    halo.position.set(0, 4, 0);
    this.scene.add(halo);
  }

  setBloom(on: boolean): void {
    if (on === this.bloomOn) return;
    this.bloomOn = on;
    if (on && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.cam.camera));
      // 🔶 calibrage spike : 0.9/0.5/0.52 (prototype 37 tuiles) noyait les
      // entités sous la lueur des bus néon sur une carte dense.
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.4, 0.62);
      this.composer.addPass(this.bloomPass);
    }
    if (this.composer) this.composer.setSize(this.viewW, this.viewH);
  }

  resize(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    // updateStyle=true (défaut) OBLIGATOIRE : sans taille CSS, le canvas Three
    // s'affiche à la taille de son buffer (dpr ×) dès que devicePixelRatio > 1
    // (PC en mise à l'échelle 125/150 %) — le terrain paraît agrandi et les
    // entités PixiJS (autoDensity, px CSS) se retrouvent hors de leurs cases
    // (bug d'Erik du 04/09 : unités de départ « en haut à gauche »).
    this.renderer.setSize(this.viewW, this.viewH);
    this.cam.setViewport(this.viewW, this.viewH);
    this.composer?.setSize(this.viewW, this.viewH);
  }

  render(): void {
    this.renderer.info.reset();
    this.cam.apply();
    if (this.bloomOn && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.cam.camera);
  }

  dispose(): void {
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
