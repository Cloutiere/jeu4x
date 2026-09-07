// FONDERIE 3D — visualiseur autonome (T1). Zéro dépendance au projet : Three.js
// r0.185.1 en fichiers locaux (copiés de node_modules du jeu, même version exacte).
//
// RÉGLAGES DE RENDU « copiés, pas importés » (session T3, 06/09 — réconciliés
// avec le JEU, qui fait foi : apps/web/src/lib/render3d/stage3d.ts ; valeurs
// COPIÉES en commentaire/valeur, PAS importées — aucune dépendance de code,
// cf. convention du handoff fonderie) :
//   - bloom : UnrealBloomPass(0.55, 0.4, 0.62) — ÉTEINT par défaut dans le jeu
//     (bascule en partie, décision Erik 4.1) ; activé ici pour l'atelier
//   - tone mapping : AUCUN (défaut Three NoToneMapping), exposition 1.0 —
//     l'ACESFilmic ×1.3 consigné en T1 n'était PAS celui du jeu (écart
//     documenté dans REPORT-FONDERIE-T3.md ; le look change ici, voulu)
//   - éclairage : Hemisphere(0x2c4a5a, 0x0a1420, 0.95) + Directional
//     (0xe8fff6, 0.85, position -5,9,3) + PointLight néon (0x3dffce, 0.45,
//     portée 18, decay 2, position 0,4,0) — aucune ombre portée
//   - fond sombre : 0x070b18 (couleur exacte de la scène du jeu)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const NEON = 0x3DFFCE;
const FONDS = { sombre: 0x070b18, clair: 0xdde8ec };

const scene = new THREE.Scene();
scene.background = new THREE.Color(FONDS.sombre);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(2.6, 2.2, 3.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NoToneMapping; // le jeu n'en pose AUCUN (cf. en-tête)
renderer.toneMappingExposure = 1.0;
document.getElementById('scene').appendChild(renderer.domElement);

// Éclairage = valeurs du jeu (stage3d.ts — cf. en-tête), aucune ombre portée
scene.add(new THREE.HemisphereLight(0x2c4a5a, 0x0a1420, 0.95));
const cle = new THREE.DirectionalLight(0xe8fff6, 0.85);
cle.position.set(-5, 9, 3);
scene.add(cle);
const halo = new THREE.PointLight(0x3dffce, 0.45, 18, 2);
halo.position.set(0, 4, 0);
scene.add(halo);

// Bloom (réglages du jeu : 0.55 / 0.4 / 0.62 — stage3d.ts, cf. en-tête)
const compositeur = new EffectComposer(renderer);
compositeur.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.62);
compositeur.addPass(bloom);
compositeur.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.autoRotateSpeed = 2.0;

// Grille/repère d'échelle : cercle de rayon 1 = tuile de référence (STYLE §5) + axes
const grille = new THREE.Group();
{
  const cercle = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      })),
    new THREE.LineBasicMaterial({ color: NEON, transparent: true, opacity: 0.5 }));
  grille.add(cercle);
  const axe = (a, b, c) => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([a, b]),
    new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.7 }));
  grille.add(axe(new THREE.Vector3(-1.2, 0, 0), new THREE.Vector3(1.2, 0, 0), 0x888888));
  grille.add(axe(new THREE.Vector3(0, 0, -1.2), new THREE.Vector3(0, 0, 1.2), 0x888888));
  grille.add(axe(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.4, 0), 0x666666));
}
grille.visible = false;
scene.add(grille);

// ---------- chargement des modèles ----------
const chargeur = new GLTFLoader();
let modeleCourant = null;

function chargerGLB(url, nom) {
  chargeur.load(url, (gltf) => {
    // succès
    if (modeleCourant) scene.remove(modeleCourant);
    modeleCourant = gltf.scene;
    scene.add(modeleCourant);
    cadrer(modeleCourant);
    compterStats(modeleCourant, nom);
    appliquerTeinte(teinte);
  }, undefined, (err) => {
    document.getElementById('stats').innerHTML = `<b>ERREUR de chargement</b><br>${err.message || err}`;
  });
}

function cadrer(obj) {
  const boite = new THREE.Box3().setFromObject(obj);
  const taille = boite.getSize(new THREE.Vector3()), centre = boite.getCenter(new THREE.Vector3());
  controls.target.copy(centre);
  const d = Math.max(taille.x, taille.y, taille.z) * 1.7;
  // vue de trois-quarts AVANT : la face avant du modèle est en -Z (convention du jeu)
  camera.position.set(centre.x + d * 0.75, centre.y + d * 0.45, centre.z - d * 0.95);
}

let stats = { nom: '—', tris: 0, materiaux: 0, primitives: 0 };
function compterStats(obj, nom) {
  // comptage honnête : glTF loader crée des LineSegments pour les primitives
  // mode 1 (arêtes néon) — elles comptent 0 triangle ; seuls les meshes comptent.
  // draw calls ≈ nombre d'objets rendus (renderer.info est faussé par le compositeur).
  let tris = 0, primitives = 0;
  const materiaux = new Set();
  obj.traverse((n) => {
    if (n.isMesh) {
      const g = n.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => materiaux.add(m.uuid));
    }
    if (n.isMesh || n.isLine || n.isPoints) primitives++;
  });
  stats = { nom, tris: Math.round(tris), materiaux: materiaux.size, primitives };
  majStats();
}
function majStats() {
  document.getElementById('stats').innerHTML =
    `<b>${stats.nom}</b><br>Triangles : <b>${stats.tris}</b><br>` +
    `Matériaux : <b>${stats.materiaux}</b> | Draw calls ≈ <b>${stats.primitives}</b>`;
}

// ---------- teinte accent joueur (la claque dédiée, STYLE §2) ----------
const TEINTES = { neutre: 0xffffff, j1: 0x3DFFCE, j2: 0xFF9A3D, j3: 0xB03DFF };
let teinte = 'neutre';
function appliquerTeinte(cle) {
  if (!modeleCourant) return;
  modeleCourant.traverse((n) => {
    if (n.isMesh && n.material && n.material.name === 'accent_joueur')
      n.material.color.set(TEINTES[cle]);
  });
}

// ---------- interface ----------
const $ = (id) => document.getElementById(id);
const boutonsEtat = {
  'b-bloom': { actif: true, f: (v) => (bloom.enabled = v) },
  'b-fond': { actif: false, f: (v) => scene.background.set(v ? FONDS.clair : FONDS.sombre) },
  'b-wire': { actif: false, f: (v) => modeleCourant && modeleCourant.traverse(n => { if (n.isMesh) n.material.wireframe = v; }) },
  'b-grille': { actif: false, f: (v) => (grille.visible = v) },
  'b-rotation': { actif: false, f: (v) => (controls.autoRotate = v) },
};
for (const [id, cfg] of Object.entries(boutonsEtat)) {
  $(id).addEventListener('click', () => {
    cfg.actif = !cfg.actif;
    $(id).classList.toggle('actif', cfg.actif);
    cfg.f(cfg.actif);
  });
}
$('b-capture').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `fonderie-${Date.now()}.png`;
  a.click();
});
for (const b of document.querySelectorAll('#teintes button')) {
  b.addEventListener('click', () => {
    document.querySelectorAll('#teintes button').forEach(x => x.classList.remove('actif'));
    b.classList.add('actif');
    teinte = b.dataset.t;
    appliquerTeinte(teinte);
  });
}

// Liste des .glb du dossier modeles/ (servie par serveur.mjs) + glisser-déposer
async function listerModeles() {
  try {
    const r = await fetch('__liste');
    const fichiers = (await r.json()).filter(f => f.endsWith('.glb'));
    const sel = $('modele');
    sel.innerHTML = '';
    for (const f of fichiers) {
      const o = document.createElement('option');
      o.value = o.textContent = f;
      sel.appendChild(o);
    }
    if (fichiers.length) chargerGLB(`modeles/${fichiers[0]}`, fichiers[0]);
    sel.addEventListener('change', () => chargerGLB(`modeles/${sel.value}`, sel.value));
  } catch { /* ouvert hors serveur : le glisser-déposer reste disponible */ }
}
listerModeles();

const drop = $('drop');
addEventListener('dragover', (e) => { e.preventDefault(); drop.style.display = 'flex'; });
addEventListener('dragleave', () => (drop.style.display = 'none'));
addEventListener('drop', (e) => {
  e.preventDefault();
  drop.style.display = 'none';
  const f = [...e.dataTransfer.files].find(f => f.name.endsWith('.glb'));
  if (!f) return;
  chargerGLB(URL.createObjectURL(f), f.name + ' (déposé)');
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  compositeur.setSize(innerWidth, innerHeight);
});

const renduBrut = location.search.includes('brut'); // ?brut = sans post-traitement (diagnostic)
renderer.setAnimationLoop(() => {
  controls.update();
  if (renduBrut) renderer.render(scene, camera);
  else compositeur.render();
});

// débogage
window.__fonderie = {
  scene: () => scene,
  THREE,
  modeleChargé: () => !!modeleCourant,
  meshes: () => { const r = []; modeleCourant && modeleCourant.traverse(n => r.push(n.type + (n.isMesh ? ':' + n.material.name : ''))); return r; },
  mats: () => { const r = []; modeleCourant && modeleCourant.traverse(n => { if (n.isMesh && !r.some(m => m.uuid === n.material.uuid)) r.push({ uuid: n.material.uuid, nom: n.material.name, emissive: n.material.emissive && [n.material.emissive.r, n.material.emissive.g, n.material.emissive.b], intensite: n.material.emissiveIntensity, couleur: n.material.color && [n.material.color.r, n.material.color.g, n.material.color.b], opacite: n.material.opacity, type: n.material.type }); }); return r; },
};
