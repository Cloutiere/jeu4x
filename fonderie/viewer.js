// FONDERIE 3D — visualiseur autonome (T1). Zéro dépendance au projet : Three.js
// r0.185.1 en fichiers locaux (copiés de node_modules du jeu, même version exacte).
//
// RÉGLAGES DE RENDU « copiés, pas importés » (session T3, 06/09 — réconciliés
// avec le JEU, qui fait foi : apps/web/src/lib/render3d/stage3d.ts ; valeurs
// COPIÉES en commentaire/valeur, PAS importées — aucune dépendance de code,
// cf. convention du handoff fonderie) :
//   - bloom : UnrealBloomPass(0.55, 0.4, 0.62) — ÉTEINT par défaut dans le jeu
//     (bascule en partie, décision Erik 4.1) ; activé ici pour l'atelier
//   - tone mapping : courbe data-driven §eclairage (candidat = ACES filmique,
//     exposition 1.3 — noirs creusés, look Tripo ; rig actuel = aucun)
//   - éclairage (§eclairage — valeurs COPIÉES du visuel3d.json, jamais importées) :
//     Hemisphere(0x2c4a5a, 0x0a1420, 0.35) + Directional (0xe8fff6, 1.3,
//     position -4,10,2) + PointLight néon (0x3dffce, 0.45, portée 18, decay 2,
//     position 0,4,0) + IBL RoomEnvironment intensité 0.3 — aucune ombre portée
//   - fond sombre : 0x070b18 (couleur exacte de la scène du jeu)
//
// MODE « A/B éclairage » (handoff ECLAIRAGE §M1) : le modèle sélectionné est
// rendu DEUX FOIS, rig historique du jeu à gauche, rig candidat à droite,
// MÊME caméra (split-screen scissor, bloom désactivé) — c'est sur ce comparatif
// qu'Erik tranche.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const NEON = 0x3DFFCE;
const FONDS = { sombre: 0x070b18, clair: 0xdde8ec };

// Rigs copiés de visuel3d.json §eclairage (spec3d.ts fait foi). ACTUEL = rig
// historique du jeu avant le chantier ECLAIRAGE (stage3d.ts d'origine).
const RIG_ACTUEL = {
  exposition: 1.0,
  tone: 'none',
  hemispherique: { intensite: 0.95, ciel: 0x2c4a5a, sol: 0x0a1420 },
  directionnelle: { intensite: 0.85, couleur: 0xe8fff6, position: [-5, 9, 3] },
  haloNeon: { intensite: 0.45, portee: 18, decay: 2 },
  ibl: { intensite: 0 },
};
const RIG_CANDIDAT = {
  exposition: 1.3,
  tone: 'aces',
  hemispherique: { intensite: 0.35, ciel: 0x2c4a5a, sol: 0x0a1420 },
  directionnelle: { intensite: 1.3, couleur: 0xe8fff6, position: [-4, 10, 2] },
  haloNeon: { intensite: 0.45, portee: 18, decay: 2 },
  ibl: { intensite: 0.3 },
};

// Courbe de sortie d'un rig → constante Three (AUCUNE = rig historique)
function toneMappingDe(rig) {
  return rig.tone === 'aces' ? THREE.ACESFilmicToneMapping
    : rig.tone === 'linear' ? THREE.LinearToneMapping
    : THREE.NoToneMapping;
}

// Rig « copié, jamais importé » : construit les lumières d'une scène depuis un
// rig (mêmes conventions que stage3d.ts dans le jeu).
function construireEclairage(sc, rig) {
  const hemi = new THREE.HemisphereLight(rig.hemispherique.ciel, rig.hemispherique.sol, rig.hemispherique.intensite);
  sc.add(hemi);
  const cle = new THREE.DirectionalLight(rig.directionnelle.couleur, rig.directionnelle.intensite);
  cle.position.set(...rig.directionnelle.position);
  sc.add(cle);
  const halo = new THREE.PointLight(NEON, rig.haloNeon.intensite, rig.haloNeon.portee, rig.haloNeon.decay);
  halo.position.set(0, 4, 0);
  sc.add(halo);
  if (rig.ibl.intensite > 0) {
    // un seul bake PMREM pour le renderer (texture partagée entre scènes)
    if (!construireEclairage.env) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      construireEclairage.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    sc.environment = construireEclairage.env;
    sc.environmentIntensity = rig.ibl.intensite;
  }
  return { hemi, cle, halo };
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(FONDS.sombre);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(2.6, 2.2, 3.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = toneMappingDe(RIG_CANDIDAT); // courbe du rig candidat (cf. en-tête)
renderer.toneMappingExposure = RIG_CANDIDAT.exposition;
document.getElementById('scene').appendChild(renderer.domElement);

// Éclairage = rig candidat (visuel3d.json §eclairage — cf. en-tête), aucune ombre portée
const lumieresScene = construireEclairage(scene, RIG_CANDIDAT);

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
let racines = [];      // racines affichées (1 en mode normal, 2 en mode A/B)
let modeAB = false;
let selection = null;  // nom du fichier choisi au menu déroulant

function nettoyer() {
  for (const r of racines) scene.remove(r);
  racines = [];
}
function cadrerUnion() {
  if (!racines.length) return;
  const boite = new THREE.Box3();
  for (const r of racines) boite.expandByObject(r);
  const taille = boite.getSize(new THREE.Vector3()), centre = boite.getCenter(new THREE.Vector3());
  controls.target.copy(centre);
  const d = Math.max(taille.x, taille.y, taille.z) * 1.7;
  // vue de trois-quarts AVANT : la face avant du modèle est en -Z (convention du jeu)
  camera.position.set(centre.x + d * 0.75, centre.y + d * 0.45, centre.z - d * 0.95);
}
function chargerGLB(url, nom) {
  chargeur.load(url, (gltf) => {
    desactiverABRig();
    $('b-abrig').classList.remove('actif');
    nettoyer();
    racines = [gltf.scene];
    scene.add(gltf.scene);
    cadrerUnion();
    compterStats();
    appliquerTeinte(teinte);
  }, undefined, (err) => {
    document.getElementById('stats').innerHTML = `<b>ERREUR de chargement</b><br>${err.message || err}`;
  });
}
// Mode A/B ville (handoff VILLE-TRIPO) : variante A (corps Tripo intact) à gauche,
// variante B (corps accent_joueur neutre-clair) à droite, hauteurs égalisées.
function activerABVille(on) {
  modeAB = on;
  if (!on) { chargerGLB(`modeles/${selection}`, selection); return; }
  desactiverABRig();
  Promise.all([
    chargeur.loadAsync('modeles/ville_v1_A.glb'),
    chargeur.loadAsync('modeles/ville_v1_B.glb'),
  ]).then(([a, b]) => {
    nettoyer();
    const H = Math.max(
      new THREE.Box3().setFromObject(a.scene).max.y,
      new THREE.Box3().setFromObject(b.scene).max.y);
    // vérifié à l'écran (capture J5) : -X apparaît À DROITE => A à +x pour être à gauche
    for (const [gltf, x] of [[a, 1.5], [b, -1.5]]) {
      const boite = new THREE.Box3().setFromObject(gltf.scene);
      gltf.scene.scale.setScalar(H / (boite.max.y - boite.min.y));
      gltf.scene.position.x = x;
      scene.add(gltf.scene);
      racines.push(gltf.scene);
    }
    cadrerUnion();
    compterStats();
    appliquerTeinte(teinte);
  }).catch((err) => {
    document.getElementById('stats').innerHTML = `<b>ERREUR A/B ville</b><br>${err.message || err}`;
  });
}

// Mode A/B : chevalier.glb (même personnage, en jeu) à gauche, modèle sélectionné à droite
// (knight_v3 par défaut), mêmes réglages, hauteurs égalisées pour comparer le style
// (les tailles réelles se calibrent en jeu via visuel3d.json §echelle).
function activerAB(on) {
  modeAB = on;
  if (!on) { chargerGLB(`modeles/${selection}`, selection); return; }
  desactiverABRig();
  Promise.all([
    chargeur.loadAsync('modeles/chevalier.glb'),
    chargeur.loadAsync(`modeles/${selection}`),
  ]).then(([a, b]) => {
    nettoyer();
    const H = 2.6; // hauteur commune (celle du knight_v3)
    for (const [gltf, x] of [[a, -1.15], [b, 1.15]]) {
      const boite = new THREE.Box3().setFromObject(gltf.scene);
      const h = boite.max.y - boite.min.y;
      const e = H / h;
      gltf.scene.scale.setScalar(e);
      gltf.scene.position.x = x;
      scene.add(gltf.scene);
      racines.push(gltf.scene);
    }
    cadrerUnion();
    compterStats();
    appliquerTeinte(teinte);
  }).catch((err) => {
    document.getElementById('stats').innerHTML = `<b>ERREUR A/B</b><br>${err.message || err}`;
  });
}

let stats = { nom: '—', tris: 0, materiaux: 0, primitives: 0 };

// ---------- MODE A/B ÉCLAIRAGE (handoff ECLAIRAGE §M1) ----------
// Le modèle sélectionné est rendu deux fois : rig ACTUEL (historique du jeu)
// à gauche, rig CANDIDAT à droite, MÊME caméra. Split-screen scissor, bloom
// désactivé (le composer ne scisse pas ; le jugement porte sur la lumière).
let abRig = null; // { sceneA, sceneB, objetA, objetB, aspectAvant }
const legende = document.createElement('div');
legende.id = 'legende-abrig';
legende.style.cssText =
  'position:fixed;top:10px;left:0;right:0;display:none;justify-content:center;gap:2rem;' +
  'pointer-events:none;font:600 13px system-ui;color:#dfe6ee;text-shadow:0 1px 3px #000;z-index:10';
legende.innerHTML = '<span>◀ RIG ACTUEL (historique)</span><span style="color:#3DFFCE">RIG CANDIDAT (§eclairage) ▶</span>';
document.body.appendChild(legende);

function desactiverABRig() {
  if (!abRig) return;
  camera.aspect = abRig.aspectAvant;
  camera.updateProjectionMatrix();
  abRig.sceneA.remove(abRig.objetA);
  abRig.sceneB.remove(abRig.objetB);
  abRig = null;
  legende.style.display = 'none';
}

function activerABRig() {
  const nom = selection;
  if (!nom) return;
  chargeur.load(`modeles/${nom}`, (gltf) => {
    desactiverABRig();
    const objetA = gltf.scene.clone(true);
    const objetB = gltf.scene.clone(true);
    const sceneA = new THREE.Scene();
    const sceneB = new THREE.Scene();
    sceneA.background = new THREE.Color(FONDS.sombre);
    sceneB.background = new THREE.Color(FONDS.sombre);
    construireEclairage(sceneA, RIG_ACTUEL);
    const lumieresB = construireEclairage(sceneB, RIG_CANDIDAT);
    sceneA.add(objetA);
    sceneB.add(objetB);
    abRig = { sceneA, sceneB, objetA, objetB, lumieresB, aspectAvant: camera.aspect };
    camera.aspect = (innerWidth / 2) / innerHeight;
    camera.updateProjectionMatrix();
    cadrerUnionAB();
    legende.style.display = 'flex';
    stats = { nom: `A/B éclairage : ${nom}`, tris: 0, materiaux: 0, primitives: 0 };
    let tris = 0, primitives = 0;
    const materiaux = new Set();
    abRig.objetA.traverse((n) => {
      if (n.isMesh || n.isLine) {
        if (n.isMesh) tris += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
        (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => materiaux.add(m.uuid));
      }
      if (n.isMesh || n.isLine || n.isPoints) primitives++;
    });
    stats = { nom: `A/B éclairage : ${nom}`, tris: Math.round(tris), materiaux: materiaux.size, primitives };
    majStats();
    appliquerTeinte(teinte);
  }, undefined, (err) => {
    document.getElementById('stats').innerHTML = `<b>ERREUR A/B éclairage</b><br>${err.message || err}`;
  });
}

function cadrerUnionAB() {
  if (!abRig) return;
  const boite = new THREE.Box3().setFromObject(abRig.objetA);
  const taille = boite.getSize(new THREE.Vector3()), centre = boite.getCenter(new THREE.Vector3());
  controls.target.copy(centre);
  const d = Math.max(taille.x, taille.y, taille.z) * 1.7;
  camera.position.set(centre.x + d * 0.75, centre.y + d * 0.45, centre.z - d * 0.95);
}
function compterStats() {
  // comptage honnête : glTF loader crée des LineSegments pour les primitives
  // mode 1 (arêtes néon) — elles comptent 0 triangle ; seuls les meshes comptent.
  // draw calls ≈ nombre d'objets rendus (renderer.info est faussé par le compositeur).
  let tris = 0, primitives = 0;
  const materiaux = new Set();
  for (const r of racines) r.traverse((n) => {
    if (n.isMesh || n.isLine) {
      const g = n.geometry;
      if (n.isMesh) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => materiaux.add(m.uuid));
    }
    if (n.isMesh || n.isLine || n.isPoints) primitives++;
  });
  const nom = modeAB
    ? ($('b-abville').classList.contains('actif') ? 'A/B ville : A | B' : `A/B : chevalier | ${selection || '—'}`)
    : (selection || '—');
  stats = { nom, tris: Math.round(tris), materiaux: materiaux.size, primitives };
  majStats();
}
function majStats() {
  document.getElementById('stats').innerHTML =
    `<b>${stats.nom}</b><br>Triangles : <b>${stats.tris}</b><br>` +
    `Matériaux : <b>${stats.materiaux}</b> | Draw calls ≈ <b>${stats.primitives}</b>`;
}

// ---------- teinte accent joueur (la claque dédiée, STYLE §2) ----------
const TEINTES = {
  neutre: 0xffffff,
  j1: 0x3DFFCE, j2: 0xFF9A3D, j3: 0xB03DFF,
  // propositions tour 3 (pas de rouge franc : réservé aux barbares)
  j4: 0x3D9AFF, // bleu
  j5: 0xFFE23D, // jaune
  j6: 0xFF3DB8, // rose (magenta, distinct du rouge barbare)
  j7: 0xFF3D3D, // rouge — RÉSERVÉ AUX BARBARES (jamais pour un joueur)
};
let teinte = 'neutre';
// tous les objets affichés (mode normal, modes A/B d'assets, A/B éclairage)
function tousObjets() {
  const out = [...racines];
  if (abRig) out.push(abRig.objetA, abRig.objetB);
  return out;
}
function appliquerTeinte(cle) {
  for (const r of tousObjets()) r.traverse((n) => {
    if (n.isMesh && n.material && n.material.name === 'accent_joueur') {
      // la teinte MULTIPLIE la couleur de base du glb (qui peut porter un facteur
      // de compensation > 1, comme le corps v1) au lieu de l'écraser
      if (!n.material.userData.couleurBase) n.material.userData.couleurBase = n.material.color.clone();
      n.material.color.copy(n.material.userData.couleurBase).multiply(new THREE.Color(TEINTES[cle]));
    }
  });
}

// ---------- interface ----------
const $ = (id) => document.getElementById(id);
const boutonsEtat = {
  'b-bloom': { actif: true, f: (v) => (bloom.enabled = v) },
  'b-fond': { actif: false, f: (v) => scene.background.set(v ? FONDS.clair : FONDS.sombre) },
  'b-wire': { actif: false, f: (v) => tousObjets().forEach(r => r.traverse(n => { if (n.isMesh) n.material.wireframe = v; })) },
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

// Bouton A/B : chevalier.glb (en jeu) à côté du modèle sélectionné, même caméra
$('b-ab').addEventListener('click', () => {
  $('b-abville').classList.remove('actif');
  const on = !$('b-ab').classList.contains('actif');
  activerAB(on);
  $('b-ab').classList.toggle('actif', on);
});

// Bouton A/B ville : les deux variantes de la ville côte à côte (A à gauche, B à droite)
$('b-abville').addEventListener('click', () => {
  $('b-ab').classList.remove('actif');
  const on = !$('b-abville').classList.contains('actif');
  activerABVille(on);
  $('b-abville').classList.toggle('actif', on);
});

// Bouton A/B éclairage : rig ACTUEL à gauche, CANDIDAT à droite, même caméra
$('b-abrig').addEventListener('click', () => {
  $('b-ab').classList.remove('actif');
  $('b-abville').classList.remove('actif');
  const on = !$('b-abrig').classList.contains('actif');
  $('b-abrig').classList.toggle('actif', on);
  if (on) activerABRig();
  else {
    desactiverABRig();
    chargerGLB(`modeles/${selection}`, selection);
  }
});

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
    // par défaut : la ville (session VILLE-TRIPO), sinon barbare_v3, sinon le premier
    selection = fichiers.includes('ville_v1_A.glb') ? 'ville_v1_A.glb'
      : fichiers.includes('barbare_v3.glb') ? 'barbare_v3.glb' : fichiers[0];
    sel.value = selection;
    if (selection) chargerGLB(`modeles/${selection}`, selection);
    sel.addEventListener('change', () => {
      if (modeAB) { modeAB = false; $('b-ab').classList.remove('actif'); }
      selection = sel.value;
      chargerGLB(`modeles/${selection}`, selection);
    });
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
  camera.aspect = abRig ? (innerWidth / 2) / innerHeight : innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  compositeur.setSize(innerWidth, innerHeight);
});

const renduBrut = location.search.includes('brut'); // ?brut = sans post-traitement (diagnostic)
renderer.setAnimationLoop(() => {
  controls.update();
  if (abRig) {
    // split-screen scissor : rig ACTUEL à gauche, CANDIDAT à droite (bloom off).
    // La courbe de tone mapping est un état renderer : on la bascule par moitié
    // (les programmes Three sont mis en cache par variante — pas de recompile).
    const demi = Math.floor(innerWidth / 2);
    renderer.setScissorTest(true);
    renderer.toneMapping = toneMappingDe(RIG_ACTUEL);
    renderer.setViewport(0, 0, demi, innerHeight);
    renderer.setScissor(0, 0, demi, innerHeight);
    renderer.toneMappingExposure = RIG_ACTUEL.exposition;
    renderer.render(abRig.sceneA, camera);
    renderer.toneMapping = toneMappingDe(RIG_CANDIDAT);
    renderer.setViewport(demi, 0, innerWidth - demi, innerHeight);
    renderer.setScissor(demi, 0, innerWidth - demi, innerHeight);
    renderer.toneMappingExposure = RIG_CANDIDAT.exposition;
    renderer.render(abRig.sceneB, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.toneMappingExposure = RIG_CANDIDAT.exposition;
  } else if (renduBrut) renderer.render(scene, camera);
  else compositeur.render();
});

// débogage
window.__fonderie = {
  scene: () => scene,
  camera: () => camera,
  THREE,
  modeAB: () => modeAB,
  racines: () => racines.length,
  rigs: () => ({ actuel: RIG_ACTUEL, candidat: RIG_CANDIDAT }),
  // calibrage live du rig candidat (A/B éclairage) :
  // __fonderie.rigCandidat({ ibl: 0.3, dir: 1.3, hemi: 0.35, expo: 1.3, tone: 'aces' })
  rigCandidat: (v = {}) => {
    if (v.ibl !== undefined) RIG_CANDIDAT.ibl.intensite = v.ibl;
    if (v.dir !== undefined) RIG_CANDIDAT.directionnelle.intensite = v.dir;
    if (v.hemi !== undefined) RIG_CANDIDAT.hemispherique.intensite = v.hemi;
    if (v.expo !== undefined) RIG_CANDIDAT.exposition = v.expo;
    if (v.tone !== undefined) RIG_CANDIDAT.tone = v.tone;
    // répercute sur les lumières VIVANTES (mode normal + scène B du A/B)
    for (const l of [lumieresScene, ...(abRig ? [abRig.lumieresB] : [])]) {
      if (!l) continue;
      l.hemi.intensity = RIG_CANDIDAT.hemispherique.intensite;
      l.cle.intensity = RIG_CANDIDAT.directionnelle.intensite;
      l.halo.intensity = RIG_CANDIDAT.haloNeon.intensite;
    }
    scene.environmentIntensity = RIG_CANDIDAT.ibl.intensite;
    if (abRig) abRig.sceneB.environmentIntensity = RIG_CANDIDAT.ibl.intensite;
    renderer.toneMapping = toneMappingDe(RIG_CANDIDAT);
    renderer.toneMappingExposure = RIG_CANDIDAT.exposition;
    return RIG_CANDIDAT;
  },
  meshes: () => { const r = []; racines.forEach(x => x.traverse(n => r.push(n.type + (n.isMesh ? ':' + n.material.name : '')))); return r; },
  mats: () => { const r = []; racines.forEach(x => x.traverse(n => { if (n.isMesh && !r.some(m => m.uuid === n.material.uuid)) r.push({ uuid: n.material.uuid, nom: n.material.name, emissive: n.material.emissive && [n.material.emissive.r, n.material.emissive.g, n.material.emissive.b], intensite: n.material.emissiveIntensity, couleur: n.material.color && [n.material.color.r, n.material.color.g, n.material.color.b], opacite: n.material.opacity, type: n.material.type }); })); return r; },
};
