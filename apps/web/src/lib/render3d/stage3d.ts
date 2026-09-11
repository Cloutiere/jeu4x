/**
 * stage3d — scène Three.js commune aux deux options du spike (renderer,
 * lumières, bloom optionnel, resize). Le rendu du TERRAIN vit dans world3d,
 * les entités dans optionA (3D pur) ou optionB (overlay PixiJS).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Camera3D } from './camera3d.js';
// Rig d'éclairage data-driven (§eclairage de visuel3d.json — handoff ECLAIRAGE).
import { ECLAIRAGE, NEON } from './spec3d.js';

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
    // Exposition + courbe de sortie data-driven (§eclairage). 'none' = rig
    // historique exact ; 'linear' = exposition seule ; 'aces' = courbe filmique
    // (noirs creusés, look Tripo des assets externes).
    this.renderer.toneMapping =
      ECLAIRAGE.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping
      : ECLAIRAGE.toneMapping === 'linear' ? THREE.LinearToneMapping
      : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = ECLAIRAGE.exposition;
    this.scene.background = new THREE.Color(0x070b18);
    const ecl = ECLAIRAGE;
    this.scene.add(new THREE.HemisphereLight(ecl.hemispherique.ciel, ecl.hemispherique.sol, ecl.hemispherique.intensite));
    const dir = new THREE.DirectionalLight(ecl.directionnelle.couleur, ecl.directionnelle.intensite);
    dir.position.set(...ecl.directionnelle.position);
    this.scene.add(dir);
    const halo = new THREE.PointLight(NEON, ecl.haloNeon.intensite, ecl.haloNeon.portee, ecl.haloNeon.decay);
    halo.position.set(0, 4, 0);
    this.scene.add(halo);
    // IBL légère (RoomEnvironment) : relumine les faces hors lumière. Coût :
    // un bake PMREM ponctuel à la construction, puis un échantillonnage env
    // par fragment — chiffré au bench avant/après (handoff ECLAIRAGE §M4).
    if (ecl.ibl.intensite > 0) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = ecl.ibl.intensite;
      pmrem.dispose();
    }
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
