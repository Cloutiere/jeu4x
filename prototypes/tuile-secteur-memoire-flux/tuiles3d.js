/**
 * tuiles3d.js — Vitrine VRAIE 3D (Three.js r147) des 8 terrains cybernétiques.
 *
 * Chaque tuile = prisme hexagonal pointy-top dont le plateau suit l'ÉLÉVATION
 * sémantique (eau plus basse, colline +1, montagne +2) et porte ses GLYPHES :
 *  - bus de données (pistes néon traversantes + pulses) = Nourriture ;
 *  - microprocesseurs (socle + broches + puce émissive) = Cycles CPU ;
 *  - barrettes RAM (socle + module) = Commerce.
 *
 * État « allumé / pâle » : le potentiel total est TOUJOURS présent sur la tuile,
 * seul le rendement actif est lumineux — les interrupteurs de bâtiments
 * (Grenier, Atelier, Extracteur, Multiplexeur, Passerelle) allument le reste.
 */
window.Tuiles3D = (function () {
  'use strict';

  const T = window.CyberTiles;
  const BAS = -0.85;          // dessous commun à tous les prismes
  const LONG_BUS = 1.6;       // longueur d'une voie de bus

  let renderer, scene, camera, composer;
  let state = null;
  let ok = false;
  const glyphes = [];   // { mesh, matLit, matDim, famille, terrain, index, pulses? }
  const pulses = [];    // spheres voyageuses (une par voie allumable)
  const texCache = new Map();
  let matBusLit, matBusDim, matDieLit, matDieDim, matRamLit, matRamDim;

  // --- caméra orbitale maison (amortie) ---
  const orbit = {
    theta: -0.62, phi: 0.80, radius: 10.6,
    tTheta: -0.62, tPhi: 0.80, tRadius: 10.6,
    target: null,
  };

  function init(canvasEl, sharedState) {
    state = sharedState;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      canvasEl.replaceWith(messageNode('WebGL indisponible : ' + e.message));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070B18);
    scene.fog = new THREE.Fog(0x070B18, 16, 38);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    orbit.target = new THREE.Vector3(0, 0.1, 0.4);

    scene.add(new THREE.HemisphereLight(0x2C4A5A, 0x0A1420, 0.95));
    const dir = new THREE.DirectionalLight(0xE8FFF6, 0.85);
    dir.position.set(-5, 9, 3);
    scene.add(dir);
    const halo = new THREE.PointLight(0x3DFFCE, 0.45, 18, 2);
    halo.position.set(0, 4, 0);
    scene.add(halo);

    fabriquerMateriauxGlyphes();
    buildGround();
    buildCarte();

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.9, 0.5, 0.52));

    bindControls(canvasEl);
    if (window.ResizeObserver) {
      new ResizeObserver(() => resize()).observe(canvasEl.parentElement);
    }
    window.addEventListener('resize', resize);
    resize();
    ok = true;
    window.__three = { scene, camera, renderer, composer };
    appliquerEtats();
    loop();
  }

  function messageNode(txt) {
    const d = document.createElement('div');
    d.className = 'webgl-indisponible';
    d.textContent = txt;
    return d;
  }

  function buildGround() {
    const grid = new THREE.GridHelper(26, 26, 0x1A4A5A, 0x0E2233);
    grid.position.y = BAS - 0.35;
    grid.material.transparent = true;
    grid.material.opacity = 0.33;
    scene.add(grid);
  }

  // ------------------------------------------------------------------
  // Matériaux des glyphes — couples (allumé, pâle) par famille.
  // ------------------------------------------------------------------
  function fabriquerMateriauxGlyphes() {
    matBusLit = new THREE.MeshStandardMaterial({
      color: 0x0A2E33, emissive: T.NEON, emissiveIntensity: 1.05, roughness: 0.4, metalness: 0.1,
    });
    matBusDim = new THREE.MeshStandardMaterial({
      color: 0x0D2430, emissive: T.NEON, emissiveIntensity: 0.05, roughness: 0.85, metalness: 0.05,
    });
    matDieLit = new THREE.MeshStandardMaterial({
      color: 0x0A2E33, emissive: 0x9FFFE8, emissiveIntensity: 0.95, roughness: 0.35, metalness: 0.2,
    });
    matDieDim = new THREE.MeshStandardMaterial({
      color: 0x0E2430, emissive: 0x9FFFE8, emissiveIntensity: 0.05, roughness: 0.7, metalness: 0.2,
    });
    matRamLit = new THREE.MeshStandardMaterial({
      color: 0x0A2E33, emissive: 0x2CE8BE, emissiveIntensity: 0.8, roughness: 0.5, metalness: 0.1,
    });
    matRamDim = new THREE.MeshStandardMaterial({
      color: 0x0E2430, emissive: 0x2CE8BE, emissiveIntensity: 0.05, roughness: 0.8, metalness: 0.05,
    });
  }
  const matSocle = () => new THREE.MeshStandardMaterial({ color: 0x0B2231, roughness: 0.9, metalness: 0.2 });
  const matPins = () => new THREE.MeshStandardMaterial({ color: 0x7E8C96, roughness: 0.3, metalness: 0.85 });

  // ------------------------------------------------------------------
  // Géométrie : prisme hexagonal unitaire (y : 0 → 1), UV de face remappées.
  // ------------------------------------------------------------------
  function hexPrismGeometry() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i + 30) * Math.PI) / 180;
      const x = Math.cos(a), y = Math.sin(a);
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1,
    });
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + 1) / 2, (pos.getY(i) + 1) / 2);
    }
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  function topTexture(typeTerrain, variante) {
    const cle = typeTerrain + ':' + variante;
    if (!texCache.has(cle)) {
      const tex = new THREE.CanvasTexture(T.faceCanvas(512, typeTerrain, variante));
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texCache.set(cle, tex);
    }
    return texCache.get(cle);
  }

  // ------------------------------------------------------------------
  // Carte de démonstration : 37 tuiles + glyphes
  // ------------------------------------------------------------------
  function buildCarte() {
    const groupe = new THREE.Group();
    scene.add(groupe);
    const geo = hexPrismGeometry();

    T.chaqueCase((q, r, typ) => {
      const t = T.TERRAINS[typ];
      const x = Math.sqrt(3) * (q + r / 2);
      const z = 1.5 * r;
      const haut = t.elev;                 // plateau
      const hauteur = haut - BAS;          // épaisseur du prisme

      const variante = T.variantOf(q, r);
      const sideMat = new THREE.MeshStandardMaterial({
        color: T.foncerInt(t.haut, 0.45),
        roughness: 0.85, metalness: 0.15,
      });
      const topMat = new THREE.MeshStandardMaterial({
        map: topTexture(typ, variante), emissive: 0xffffff, emissiveMap: topTexture(typ, variante),
        emissiveIntensity: 0.45, roughness: 0.6, metalness: 0.12,
      });
      const tuile = new THREE.Mesh(geo, [topMat, sideMat]);
      tuile.scale.y = hauteur;
      tuile.position.set(x, BAS, z);
      groupe.add(tuile);

      poserGlyphes(groupe, typ, t, x, haut, z, q, r);
    });
  }

  /** Pose les glyphes d'une tuile et enregistre leurs états. */
  function poserGlyphes(groupe, typ, t, x, top, z, q, r) {
    const g = t.glyphe;
    const rnd = T.mulberry32(T.SEED ^ (q * 92821) ^ (r * 31337));

    if (g.type === 'bus') {
      const lanes = T.voiesBus(g.total);
      lanes.forEach((lz, i) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(LONG_BUS, 0.035, 0.10),
          matBusDim
        );
        mesh.position.set(x, top + 0.022, z + lz);
        groupe.add(mesh);
        const pulse = fabriquerPulse(top + 0.05, z + lz);
        glyphes.push({ mesh, matLit: matBusLit, matDim: matBusDim, famille: 'bus', terrain: typ, index: i, pulses: [pulse] });
      });
    } else if (g.type === 'cpu') {
      const pts = T.empreintesCpu(g.total);
      pts.forEach(([cx, cz], i) => {
        const puce = new THREE.Group();
        const jx = (rnd() - 0.5) * 0.05, jz = (rnd() - 0.5) * 0.05;
        puce.position.set(x + cx + jx, top + 0.0175, z + cz + jz);
        puce.rotation.y = (rnd() - 0.5) * 0.16;
        const socle = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.035, 0.20), matSocle());
        const die = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.11), matDieDim);
        die.position.y = 0.032;
        puce.add(socle, die);
        for (const [px, pz, w, d] of [[-0.112, 0, 0.024, 0.20], [0.112, 0, 0.024, 0.20], [0, -0.112, 0.20, 0.024], [0, 0.112, 0.20, 0.024]]) {
          const pin = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), matPins());
          pin.position.set(px, 0, pz);
          puce.add(pin);
        }
        groupe.add(puce);
        glyphes.push({ mesh: die, matLit: matDieLit, matDim: matDieDim, famille: 'cpu', terrain: typ, index: i });
      });
    } else if (g.type === 'ram') {
      const slots = T.slotsRam(g.total, 0);
      slots.forEach(([sx, sz], i) => {
        const h = 0.14 + rnd() * 0.10;
        const socle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.11), matSocle());
        socle.position.set(x + sx, top + 0.0225, z + sz);
        const stick = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), matRamDim);
        stick.position.set(x + sx, top + 0.045 + h / 2, z + sz);
        groupe.add(socle, stick);
        glyphes.push({ mesh: stick, matLit: matRamLit, matDim: matRamDim, famille: 'ram', terrain: typ, index: i });
      });
    } else if (g.type === 'mixte') {
      // 2 barrettes RAM (toujours allumées) + 1 voie de bus (Passerelle Optique)
      T.slotsRam(g.ram, 0.20).forEach(([sx, sz], i) => {
        const h = 0.11 + rnd() * 0.05;
        const socle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.11), matSocle());
        socle.position.set(x + sx, top + 0.0225, z + sz);
        const stick = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), matRamLit);
        stick.position.set(x + sx, top + 0.045 + h / 2, z + sz);
        groupe.add(socle, stick);
        glyphes.push({ mesh: stick, matLit: matRamLit, matDim: matRamDim, famille: 'ramEau', terrain: typ, index: i });
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(LONG_BUS, 0.035, 0.10), matBusDim);
      mesh.position.set(x, top + 0.022, z - 0.30);
      groupe.add(mesh);
      const pulse = fabriquerPulse(top + 0.05, z - 0.30);
      glyphes.push({ mesh, matLit: matBusLit, matDim: matBusDim, famille: 'busEau', terrain: typ, index: 0, pulses: [pulse] });
    }
  }

  // ------------------------------------------------------------------
  // Pulses : petites sphères additives voyageant le long des voies allumées.
  // ------------------------------------------------------------------
  function fabriquerPulse(y, z, x0) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xAEFFF0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), mat);
    mesh.position.set(x0 || -0.8, y, z);
    scene.add(mesh);
    const p = { mesh, y, z, t: T.mulberry32((y * 1e4 + z * 1e3) | 0)(), speed: 0.35 + T.mulberry32((z * 7e3) | 0)() * 0.4 };
    pulses.push(p);
    return p;
  }

  function updatePulses(dt) {
    for (const p of pulses) {
      if (!p.mesh.visible) continue;
      p.t += dt * p.speed;
      if (p.t > 1) p.t = 0;
      p.mesh.position.x = -0.8 + p.t * LONG_BUS;
    }
  }

  // ------------------------------------------------------------------
  // États allumé / pâle — le cœur du langage visuel.
  // ------------------------------------------------------------------
  function appliquerEtats() {
    if (!renderer) return;
    const b = state.batiments, tous = state.tous;
    const actif = (bat) => !!bat && (tous || b[bat]);
    for (const g of glyphes) {
      const spec = T.TERRAINS[g.terrain].glyphe;
      let lit;
      if (g.famille === 'ramEau') {
        lit = true; // le commerce de l'eau (2 RAM) est toujours actif
      } else if (g.famille === 'busEau') {
        lit = actif('passerelle');
      } else {
        const potentiel = spec.total;
        const actifs = spec.actifs;
        lit = g.index < (actif(spec.batiment) ? potentiel : actifs);
      }
      g.mesh.material = lit ? g.matLit : g.matDim;
      if (g.pulses) for (const p of g.pulses) p.mesh.visible = lit && state.animation;
    }
  }

  // ------------------------------------------------------------------
  // Contrôles orbitaux maison (pointer events, amortis)
  // ------------------------------------------------------------------
  function bindControls(el) {
    const pointers = new Map();
    let pinchD = 0;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b2] = [...pointers.values()];
        pinchD = Math.hypot(a.x - b2.x, a.y - b2.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        orbit.tTheta -= dx * 0.0052;
        orbit.tPhi = THREE.MathUtils.clamp(orbit.tPhi - dy * 0.0042, 0.18, 1.35);
      } else if (pointers.size === 2) {
        const [a, b2] = [...pointers.values()];
        const d = Math.hypot(a.x - b2.x, a.y - b2.y);
        if (pinchD > 0) orbit.tRadius = THREE.MathUtils.clamp(orbit.tRadius * (pinchD / d), 5, 26);
        pinchD = d;
      }
    });
    const end = (e) => { pointers.delete(e.pointerId); pinchD = 0; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.tRadius = THREE.MathUtils.clamp(orbit.tRadius * Math.exp(e.deltaY * 0.0011), 5, 26);
    }, { passive: false });
    el.addEventListener('dblclick', () => {
      orbit.tTheta = -0.62; orbit.tPhi = 0.80; orbit.tRadius = 10.6;
    });
  }

  function resize() {
    const box = renderer.domElement.parentElement.getBoundingClientRect();
    if (box.width < 10 || box.height < 10) return;
    renderer.setSize(box.width, box.height, false);
    composer.setSize(box.width, box.height);
    camera.aspect = box.width / box.height;
    camera.updateProjectionMatrix();
  }

  let t0 = performance.now(), last = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    if (!ok || renderer.domElement.offsetParent === null) return;
    const time = (performance.now() - t0) / 1000;
    const dt = Math.min(0.05, (performance.now() - last) / 1000);
    last = performance.now();

    if (state.animation) updatePulses(dt);

    // respiration des matières allumées (fait partie de l'« Animation »)
    if (state.animation) {
      matBusLit.emissiveIntensity = 1.0 + 0.22 * Math.sin(time * 2.6);
      matDieLit.emissiveIntensity = 0.9 + 0.22 * Math.sin(time * 2.2 + 1.0);
      matRamLit.emissiveIntensity = 0.75 + 0.18 * Math.sin(time * 2.9 + 2.0);
    } else {
      matBusLit.emissiveIntensity = 1.0;
      matDieLit.emissiveIntensity = 0.9;
      matRamLit.emissiveIntensity = 0.75;
    }

    const k = 0.14;
    orbit.theta += (orbit.tTheta - orbit.theta) * k;
    orbit.phi += (orbit.tPhi - orbit.phi) * k;
    orbit.radius += (orbit.tRadius - orbit.radius) * k;
    const sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
    camera.position.set(
      orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
      orbit.target.y + orbit.radius * cp,
      orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);

    composer.render();
  }

  return {
    init,
    appliquerEtats,
    invalidate: () => { if (ok) resize(); },
  };
})();
