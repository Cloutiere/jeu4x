/**
 * FLECHE-COUCHE (signalement Erik 04/10) — la flèche de déplacement doit
 * s'afficher AU-DESSUS de toutes les structures posées (huttes, camps
 * barbares, artefacts, villes — y compris ennemies et merveilles) mais
 * EN DESSOUS des unités (et de l'anneau de sélection qui les accompagne).
 *
 * Le tri vit dans `entitiesLayer.sortableChildren` : les structures sont à
 * zIndex -100 (retour GP-ART 28/09), l'anneau de sélection à -90 (REGLAGES-
 * CALIBRAGE 30/09), les unités à p.y*10+z (≥ 0). La flèche — qui vivait dans
 * `overlayLayer`, SOUS tout `entitiesLayer` — passe dans une couche dédiée
 * `flecheCouche` enfant d'`entitiesLayer` à ZINDEX_FLECHE (constante pure
 * exportée d'arrows.ts, testable sans rendu Pixi). Le rendu Pixi/Three n'est
 * pas rejouable en vitest : le câblage est vérifié sur la source.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZINDEX_FLECHE } from '../src/lib/render/arrows.js';

const SRC = resolve(import.meta.dirname, '../src/lib/render/GameCanvas.svelte');

describe('FLECHE-COUCHE — tri structures < flèche < unités', () => {
  it('ZINDEX_FLECHE place la flèche au-dessus des structures (-100) et sous l’anneau (-90)/unités (≥ 0)', () => {
    expect(ZINDEX_FLECHE).toBeGreaterThan(-100); // au-dessus des structures posées
    expect(ZINDEX_FLECHE).toBeLessThan(-90); // sous l’anneau de sélection
    expect(ZINDEX_FLECHE).toBeLessThan(0); // sous la plus basse unité (p.y*10+z)
  });

  it('flecheCouche est un enfant trié d’entitiesLayer au ZINDEX_FLECHE (création ET re-création des calques)', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).toMatch(/flecheCouche\.zIndex = ZINDEX_FLECHE/);
    expect(src).toMatch(/entitiesLayer\.addChild\(flecheCouche\)/);
    // La couche survit à la recréation du monde (chargement textures).
    expect(src).toMatch(/entitiesLayer\.sortableChildren = true/);
  });

  it('TOUT le bloc flèche passe par flecheCouche en 2D : flèche posée, chemin gelé, survol/maintien, brouillon, badges de tours', () => {
    const src = readFileSync(SRC, 'utf8');
    // drawArrow (ordre posé + chemin gelé, copies wrap comprises — la copie
    // wrap est addChildée par la même fonction).
    expect(src).toMatch(/flecheParent\(\)\.addChild\(gr\)/);
    // Survol (clic droit maintenu) et brouillon de chemin.
    expect(src).toMatch(/flecheParent\(\)\.addChild\(cont\)/);
    expect(src).toMatch(/overlayLayer/);
    // Badges de tours (jalons).
    expect(src).toMatch(/flecheParent\(\)\.addChild\(jalonsC\)/);
    // Le parent 2D est la couche flèche ; en 3D le comportement est inchangé
    // (les marqueurs Three restent sous les modèles).
    expect(src).toMatch(/return mode3dActif\(\) \? overlayLayer : flecheCouche/);
  });

  it('la couche flèche est vidée au rebuild sans toucher aux entités (anneau et unités persistent)', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).toMatch(/flecheCouche\.removeChildren\(\)/);
  });
});
