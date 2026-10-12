// À propos, écrit en 3D sur le sol vert, à la fin du vol de caméra du hero (js/hero.js). Repris du plan 1 du site
// immersif (homeservice-immersive, web/js/app.js : « texte inscrit sur le sol », « chiffres, à droite de la route »,
// « photo de l'équipe ») : même mise en page, mêmes dimensions (en mètres de sol, pour un écran de ~54 m de large,
// ramenées ici à la largeur que filme la caméra), mêmes animations ; la mise en page est celle de ce site :
// Deux écrans sur le sol vert : la caméra glisse de l'un à l'autre au fil du défilement (js/hero.js).
//   · premier écran, à gauche, en grand, le texte (#info-sol), en lettres de 3 cm de relief couchées sur le sol : tous les
//     mots sont là à 16 %, ils s'allument un à un, et la partie en couleur passe au vert clair ;
//   · premier écran, à droite, la photo de l'équipe, qui s'ouvre depuis son centre derrière le bord rongé du vide ;
//   · second écran, plus bas sur le sol, sur une plaque blanche aux coins arrondis, les trois chiffres (#info-chiffres) côte à côte, chacun avec
//     sa petite scène : un objet par service, la carte des communes, le devis tamponné ; les éléments surgissent en
//     rebondissant au rythme du décompte.
// Le texte et la photo apparaissent dès que le vert a rempli l'écran, les chiffres quand la caméra arrive sur eux (pas
// au fil du défilement) ; en remontant, tout s'efface. Le texte
// est clair sur le vert ; sur la plaque blanche, les chiffres ont les couleurs du site immersif (bleu encre, vert).
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sms = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const backOut = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

// Mise en page du site immersif, en mètres de son repère (x vers le haut de l'écran, y vers la gauche), et le point
// au centre de l'écran. On la reprend telle quelle dans un repère « plan » : X vers la droite, Y vers le haut, Z hors
// du sol.
const SCREEN_W = 54;                                // largeur de sol que remplit la mise en page à l'écran (m)
// mise en page, dans le repère plan (m ; origine au centre du premier écran, ~54 × 34 m) : bande du texte [gauche,
// droite, haut], photo [centre x, largeur] (centrée sur la hauteur du texte), écart entre les deux écrans (m, plus
// qu'une hauteur d'écran), plaque des chiffres [gauche, droite, demi-hauteur, rayon des coins] (centrée sur le second
// écran), chiffres [échelle, largeur d'une colonne, retrait à gauche]
const PAGE = 38;
const LAYOUT = { text: { x0: -24, x1: 3.2, top: 6.2 }, photo: { cx: 14.6, w: 16.5 },
  panel: { x0: -24, x1: 24, half: 6.2, r: 1.8 }, stats: { scale: 0.8, col: 17.8, inset: 2.2 } };
LAYOUT.panel.top = -PAGE + LAYOUT.panel.half;
LAYOUT.panel.bottom = -PAGE - LAYOUT.panel.half;
const STAT = { top: 15.0, left: -6.0, row: 7.0, R: 2.45, textGap: 0.5, pad: 0.55,
  toy: 2.2, map: 2.55, devis: 3.6, em: 1.35, unit: 0.5, title: 0.58, desc: 0.4, descW: 8.9, gap: 0.5 };
const PHOTO_EDGE = 6.0, PHOTO_REST = 3.0, PHOTO_ROUND = 2.2;   // bord de l'ouverture de la photo (m)

// Apparition, une fois le vert à l'écran (u de js/hero.js au-delà de ABOUT_ON) ; en secondes depuis ce moment :
// [fondu, écriture des mots, ouverture de la photo, premier chiffre, écart entre les chiffres] ; en remontant, tout
// s'efface deux fois plus vite
// STATS_ON : u où la caméra arrive sur le second écran (les chiffres apparaissent)
export const ABOUT_ON = 0.42, STATS_ON = 0.76;
const SHOW = { fade: [0, 0.45], words: [0.15, 1.1], photo: [0.25, 1.6], panel: [0, 0.35], stat: 0.25, statStep: 0.3, out: 2 };
const COLORS = { ink: '#f4f7f2', accent: '#8ef0b4', grey: '#c9e6d2',            // sur le vert
  inkD: '#172234', accentD: '#11703f', greyD: '#6a7382', panel: '#f7f7f5' };     // sur la plaque blanche

const VD_NOISE = `
float vdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vdNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vdHash(i), vdHash(i + vec3(1, 0, 0)), f.x), mix(vdHash(i + vec3(0, 1, 0)), vdHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vdHash(i + vec3(0, 0, 1)), vdHash(i + vec3(1, 0, 1)), f.x), mix(vdHash(i + vec3(0, 1, 1)), vdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

export async function makeAbout({ gltfLoader, renderer }) {
  const [fontData, fontData500, servicesGltf, photoTex] = await Promise.all([
    fetch('fonts/manrope-800.typeface.json').then((r) => r.json()),
    fetch('fonts/manrope-500.typeface.json').then((r) => r.json()),
    gltfLoader.loadAsync('models/services.glb'),
    new THREE.TextureLoader().loadAsync('images/teampic.webp'),
  ]);
  const font = new FontLoader().parse(fontData), font500 = new FontLoader().parse(fontData500);

  // holder : posé au sol, tourné vers la caméra (js/hero.js le place) ; planG : le repère plan couché sur le sol
  const holder = new THREE.Group();
  const planG = new THREE.Group();
  planG.rotation.x = -Math.PI / 2;
  holder.add(planG);
  holder.visible = false;

  // ------------------------------------------------------------ encre : les mots s'allument un à un
  const MAX_WORDS = 80;
  const TEXT = { uWordOn: { value: new Float32Array(MAX_WORDS) }, uAccentOn: { value: 0 }, uFade: { value: 0 } };
  function inkMaterial(base, accent, accentCol = COLORS.accent) {
    const m = new THREE.MeshBasicMaterial({ color: base, transparent: true, depthWrite: false, toneMapped: false });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, TEXT, { uAccent: { value: new THREE.Color(accentCol) } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float word;\nvarying float vWord;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWord = word;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uWordOn[${MAX_WORDS}]; uniform float uAccentOn, uFade; uniform vec3 uAccent;
          varying float vWord;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wOn = uWordOn[int(vWord + 0.5)];
          ${accent ? 'diffuseColor.rgb = mix(diffuseColor.rgb, uAccent, uAccentOn);' : ''}
          diffuseColor.a *= mix(0.16, 1.0, wOn) * uFade;`);
    };
    m.customProgramCacheKey = () => `encre-${base}-${accent}-${accentCol}`;
    return m;
  }
  const INK = inkMaterial(COLORS.ink, false), LEAF = inkMaterial(COLORS.ink, true);
  // les chiffres, sur la plaque blanche : l'unité est déjà verte (l'accent est allumé avec le reste)
  const INK_D = inkMaterial(COLORS.inkD, false), UNIT_D = inkMaterial(COLORS.accentD, false),
    GREY_D = inkMaterial(COLORS.greyD, false);
  const wordOn = new Float32Array(MAX_WORDS);
  let wordCount = 0, accentFirst = -1, accentOn = 0;
  const adv = (t, em, fd = fontData) => [...t].reduce((a, c) => a + (fd.glyphs[c]?.ha ?? 500), 0) / fd.resolution * em;
  const withWord = (g, word) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.setAttribute('word', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(word), 1));
    return g.index ? g.toNonIndexed() : g;
  };
  const glyph = (t, em, word, f = font, depth = 0.03) =>
    withWord(new TextGeometry(t, { font: f, size: em, depth, curveSegments: 3, bevelEnabled: false }), word);

  // ------------------------------------------------------------ le texte, à gauche
  const textGroup = new THREE.Group();
  planG.add(textGroup);
  let textBottom = 0;
  function buildGroundText() {
    for (const m of [...textGroup.children]) { m.geometry.dispose(); textGroup.remove(m); }
    wordCount = 0;
    accentFirst = -1;
    const src = document.querySelector('#info-sol p');
    const lines = [[]];
    const walk = (node, acc) => node.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        for (const w of n.textContent.split(/(\s+)/)) {
          if (!w) continue;
          lines[lines.length - 1].push(/^\s+$/.test(w) ? { space: true } : { text: w, accent: acc });
        }
      } else if (n.tagName === 'BR') lines.push([]);
      else if (n.nodeType === 1) walk(n, acc || n.classList.contains('accent'));
    });
    walk(src, false);
    const clean = lines.map((l) => {
      const out = [];
      for (const t of l) if (!t.space || (out.length && !out[out.length - 1].space)) out.push(t);
      while (out.length && out[out.length - 1].space) out.pop();
      return out;
    }).filter((l) => l.length);
    const adv1 = (t) => adv(t, 1);
    const lineW1 = (l) => l.reduce((a, t) => a + (t.space ? adv1(' ') : adv1(t.text)), 0);
    const LEAD = 1.3, W = LAYOUT.text.x1 - LAYOUT.text.x0;
    const em = W / Math.max(...clean.map(lineW1));     // le texte remplit la largeur de sa bande
    const lineH = em * LEAD, asc = em * 0.95, H = clean.length * lineH;
    const geos = { ink: [], leaf: [] };
    clean.forEach((line, li) => {
      let x = 0;
      for (const t of line) {
        if (t.space) { x += adv1(' ') * em; continue; }
        const g = glyph(t.text, em, wordCount);
        g.translate(x, -(li * lineH + asc), 0);
        (t.accent ? geos.leaf : geos.ink).push(g);
        if (t.accent && accentFirst < 0) accentFirst = wordCount;
        wordCount++;
        x += adv1(t.text) * em;
      }
    });
    for (const [k, mat] of [['ink', INK], ['leaf', LEAF]]) {
      if (!geos[k].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geos[k]), mat);
      mesh.renderOrder = 2;
      textGroup.add(mesh);
    }
    textGroup.position.set(LAYOUT.text.x0, LAYOUT.text.top, 0.005);
    textBottom = LAYOUT.text.top - (H - lineH + em) - 0.25 * em;   // bas des dernières lettres
  }
  buildGroundText();

  // ------------------------------------------------------------ la photo de l'équipe, sous le texte
  photoTex.colorSpace = THREE.SRGBColorSpace;
  photoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const PHOTO_W = LAYOUT.photo.w, PHOTO_H = PHOTO_W / (photoTex.image.width / photoTex.image.height);
  const PHOTO = { uReveal: { value: 0 }, uFade: TEXT.uFade };
  const photoMat = new THREE.MeshBasicMaterial({ map: photoTex, transparent: true, depthWrite: false, toneMapped: false });
  photoMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, PHOTO);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPh = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vPh; uniform float uReveal, uFade;
        ${VD_NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec2 pm = vPh * vec2(${PHOTO_W.toFixed(3)}, ${PHOTO_H.toFixed(3)});            // en mètres, comme le vide
        vec3 pw = vec3(pm.x + 31.0, 0.0, pm.y + 7.0);
        float n = vdNoise(pw * 0.33) * 0.75 + vdNoise(pw * 1.9) * 0.25;
        float edge = mix(${PHOTO_EDGE.toFixed(1)}, ${PHOTO_REST.toFixed(1)}, smoothstep(0.55, 1.0, uReveal));
        vec2 hs = uReveal * (vec2(${(PHOTO_W / 2).toFixed(3)}, ${(PHOTO_H / 2).toFixed(3)}) - edge);
        float rc = min(uReveal * ${PHOTO_ROUND.toFixed(1)}, min(hs.x, hs.y));
        vec2 q = abs(pm - vec2(${(PHOTO_W / 2).toFixed(3)}, ${(PHOTO_H / 2).toFixed(3)})) - hs + rc;
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rc;
        if (-sd + (n - 1.0 + uReveal) * edge <= 0.0) discard;`)
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= uFade;\n#include <opaque_fragment>');
  };
  const photoMesh = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO_W, PHOTO_H), photoMat);
  photoMesh.renderOrder = 1;
  planG.add(photoMesh);
  let photoOpen = 0;
  const placePhoto = () => photoMesh.position.set(LAYOUT.photo.cx, (LAYOUT.text.top + textBottom) / 2, 0.002);
  placePhoto();

  // ------------------------------------------------------------ les chiffres, à droite, et leurs scènes
  const statOf = (li) => ({
    n: +li.dataset.n, suffix: li.dataset.suffix || '',
    title: li.querySelector('strong').textContent.trim(),
    desc: li.textContent.replace(li.querySelector('strong').textContent, '').replace(/\s+/g, ' ').trim(),
  });
  const statItems = () => [...document.querySelectorAll('#info-chiffres li')];
  const STATS = statItems().map(statOf);
  const STAT_WORD = MAX_WORDS - STATS.length;
  const statOn = STATS.map(() => 0), statCount = STATS.map(() => 0), statText = STATS.map(() => 0);
  const statDigits = [], statAdv = [], statRight = [], statRows = [];
  const g0 = new THREE.Group();
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  // objets en couleur (glTF, y en haut), centrés, posés sur z = 0 et redressés (y → z)
  const toyOf = (src, size, k = 1) => {
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.flatShading = true;
      m.material.emissive?.setRGB(0, 0, 0);
      m.castShadow = true;
      m.receiveShadow = true;
    });
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3());
    if (size) k = size / Math.max(sz.x, sz.z);
    o.scale.multiplyScalar(k);
    const c = b.getCenter(new THREE.Vector3());
    o.position.set(-c.x * k, -b.min.y * k, -c.z * k);
    const up = new THREE.Group();
    up.rotation.x = Math.PI / 2;
    up.add(o);
    const pivot = new THREE.Group();
    pivot.add(up);
    return pivot;
  };
  const splitParts = (o, groups) => {
    const model = o.children[0].children[0];
    const meshes = [...model.children];
    model.updateMatrixWorld(true);
    const toModel = model.matrixWorld.clone().invert();
    return groups.map((prefixes, j) => {
      const mine = meshes.filter((m) => {
        let best = null;
        for (const [k, list] of groups.entries()) for (const p of list) {
          if (m.name.startsWith(p) && (!best || p.length > best.len)) best = { k, len: p.length };
        }
        return best?.k === j;
      });
      const box = new THREE.Box3();
      for (const c of mine) c.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox.clone().applyMatrix4(toModel.clone().multiply(m.matrixWorld)));
      });
      const part = new THREE.Group();
      part.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      for (const m of mine) { m.position.sub(part.position); part.add(m); }
      model.add(part);
      return part;
    });
  };
  const wrap = (t) => t.split(' ').reduce((lines, w) => {
    const l = lines[lines.length - 1];
    if (l && adv(l + ' ' + w, STAT.desc, fontData500) <= STAT.descW) lines[lines.length - 1] = l + ' ' + w;
    else lines.push(w);
    return lines;
  }, []);
  const cap = 0.72;
  '0123456789'.split('').forEach((c) => statAdv.push(adv(c, STAT.em)));
  const unitW = (st) => (st.suffix ? 0.08 * STAT.em + adv(st.suffix, STAT.em * STAT.unit) : 0);
  const R = STAT.R;
  const named = (n) => servicesGltf.scene.getObjectByName(n);
  const scenes = [
    (spot) => {                                       // 5 services : un objet par service
      const places = [['nettoyage', -1.1, 1.8], ['livraison', 3.75, 1.7], ['jardinage', 1.35, 0.15],
        ['montage', -0.95, -1.5], ['desencombrement', 3.35, -1.45]];
      const parts = {
        nettoyage: [['Seau', 'Rebord', 'Cerclage', 'Anse', 'Attache', 'Eau'], ['Éponge', 'Grattoir']],
        desencombrement: [['Carton', 'Scotch'], ['Sac', 'Col_du_sac', 'Oreille', 'Lien']],
        montage: [['Caisse', 'Couvercle', 'Fermoir', 'Montant_poignée', 'Poignée_caisse'],
          ['Corps_visseuse', 'Poignée_visseuse', 'Batterie', 'Mandrin', 'Embout'], ['Clé_Allen']],
        livraison: [['Sac', 'Bande', 'Anse', 'Baguette', 'Poireau', 'Feuille_poireau', 'Pomme_1'], ['Pomme_2', 'Queue']],
      };
      return places.flatMap(([n, x, y], i) => {
        const o = toyOf(named(`Stat_${n}`), 0, STAT.toy);
        if (!o) return [];
        o.position.set(x, y, 0);
        spot.add(o);
        if (!parts[n]) return [{ obj: o, i, kind: 'pop', rot: 0 }];
        return splitParts(o, parts[n]).map((part, j) => ({ obj: part, i, kind: 'part', delay: j * 0.22, wait: 0 }));
      });
    },
    (spot) => {                                       // 19 communes : la carte, du centre vers le bord
      const o = toyOf(named('Stat_communes'), 0, STAT.map);
      if (!o) return [];
      o.position.set(1.15, 0, 0);
      spot.add(o);
      const model = o.children[0].children[0];
      model.children.filter((m) => m.name.startsWith('Fantôme')).forEach((m) => model.remove(m));
      model.updateMatrixWorld(true);
      const toModel = model.matrixWorld.clone().invert();
      const dist = (m) => {
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).applyMatrix4(toModel);
        return Math.hypot(c.x, c.z);
      };
      return model.children.filter((m) => m.name.startsWith('Commune'))
        .map((m) => ({ m, d: dist(m) })).sort((a, b) => a.d - b.d)
        .map(({ m }, i) => ({ obj: m, i, kind: 'grow' }));
    },
    (spot) => {                                       // 24 h : le devis arrive, et il est tamponné
      const o = toyOf(named('Stat_devis'), 0, STAT.devis);
      if (!o) return [];
      o.position.set(0.9, 0, 0);
      spot.add(o);
      const [env, sheet, stamp, mark] = splitParts(o, [['Enveloppe', 'Rabat'], ['Devis'], ['Tampon'], ['Empreinte', 'Coche']]);
      return [
        { obj: env, i: 0, kind: 'part' },
        { obj: sheet, i: 6, kind: 'slide', from: sheet.position.clone(), dz: -0.3 },
        { obj: stamp, i: 14, kind: 'part' },
        { obj: mark, i: 22.6, kind: 'part' },
      ];
    },
  ];
  STATS.forEach((st, r) => {
    const yc = 0, xc = r * LAYOUT.stats.col;          // côte à côte (le site immersif les empilait)
    const spot = new THREE.Group();
    spot.position.set(xc + R, yc, 0);
    g0.add(spot);
    const els = (scenes[r] || (() => []))(spot);
    els.forEach((e) => { e.s = 0; e.obj.visible = false; });
    statRows.push({ els, yc, xc, word: STAT_WORD + r });
  });
  const labels = [];
  const labelFor = (st, { yc, xc, word }, numW) => {
    const lines = wrap(st.desc);
    const textH = STAT.title * cap + STAT.title * 0.62 + STAT.desc * (0.95 + (lines.length - 1) * 1.45) + STAT.desc * 0.25;
    const label = new THREE.Group();
    label.position.set(xc + 2 * R + STAT.textGap, yc, 0);
    g0.add(label);
    labels.push(label);
    const put = (g, mat, x, y) => { const m = mesh(g, mat, label, x, y, 0); m.renderOrder = 2; return m; };
    const colX = STAT.pad + numW, base = -STAT.em * cap / 2;
    const glyphs = '0123456789'.split('').map((c) => glyph(c, STAT.em, word, font, 0.12));
    statDigits.push(Array.from({ length: String(st.n).length }, () => glyphs.map((g) => {
      const m = put(g, INK_D, 0, base);
      m.visible = false;
      return m;
    })));
    statRight.push(colX - unitW(st));
    if (st.suffix) put(glyph(st.suffix, STAT.em * STAT.unit, word, font, 0.08), UNIT_D, colX - adv(st.suffix, STAT.em * STAT.unit), base);
    const textX = colX + STAT.gap, tTop = textH / 2, tBase = tTop - STAT.title * cap;
    put(glyph(st.title, STAT.title, word), INK_D, textX, tBase);
    lines.forEach((t, i) => put(glyph(t, STAT.desc, word, font500), GREY_D, textX,
      tBase - STAT.title * 0.62 - STAT.desc * (0.95 + i * 1.45)));
  };
  function buildStatLabels() {
    const geos = new Set();
    for (const l of labels.splice(0)) { l.traverse((m) => { if (m.isMesh) geos.add(m.geometry); }); g0.remove(l); }
    geos.forEach((g) => g.dispose());
    statDigits.length = statRight.length = 0;
    const numW = Math.max(...STATS.map((st) => adv(String(st.n), STAT.em) + unitW(st)));
    STATS.forEach((st, r) => labelFor(st, statRows[r], numW));
  }
  buildStatLabels();
  // la plaque blanche aux coins arrondis, et les chiffres centrés dessus
  const pl = LAYOUT.panel;
  const shape = new THREE.Shape();
  shape.moveTo(pl.x0 + pl.r, pl.bottom);
  shape.lineTo(pl.x1 - pl.r, pl.bottom); shape.quadraticCurveTo(pl.x1, pl.bottom, pl.x1, pl.bottom + pl.r);
  shape.lineTo(pl.x1, pl.top - pl.r); shape.quadraticCurveTo(pl.x1, pl.top, pl.x1 - pl.r, pl.top);
  shape.lineTo(pl.x0 + pl.r, pl.top); shape.quadraticCurveTo(pl.x0, pl.top, pl.x0, pl.top - pl.r);
  shape.lineTo(pl.x0, pl.bottom + pl.r); shape.quadraticCurveTo(pl.x0, pl.bottom, pl.x0 + pl.r, pl.bottom);
  const panelMat = new THREE.MeshBasicMaterial({ color: COLORS.panel, transparent: true, depthWrite: false, toneMapped: false });
  const panel = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), panelMat);
  panel.position.z = 0.001;
  panel.renderOrder = 1;
  planG.add(panel);
  g0.scale.setScalar(LAYOUT.stats.scale);
  g0.position.set(pl.x0 + LAYOUT.stats.inset, (pl.top + pl.bottom) / 2, 0.006);
  planG.add(g0);

  // nouvelle langue : le texte et les chiffres se réécrivent
  window.addEventListener('hs:lang', () => {
    buildGroundText();
    placePhoto();
    statItems().forEach((li, i) => Object.assign(STATS[i], statOf(li)));
    buildStatLabels();
  });

  // ------------------------------------------------------------ animation : dès que le vert remplit l'écran
  let t = 0, t2 = 0;                                // temps depuis l'arrivée sur chaque écran (s) ; redescend en remontant
  function update(u, dt) {
    const on = u >= ABOUT_ON, on2 = u >= STATS_ON;
    t = on ? t + dt : Math.max(0, t - dt * SHOW.out);
    t2 = on2 ? t2 + dt : Math.max(0, t2 - dt * SHOW.out);
    const k1 = sms(SHOW.fade[0], SHOW.fade[1], t);
    holder.visible = k1 > 0.001;
    TEXT.uFade.value = k1;
    panelMat.opacity = sms(SHOW.panel[0], SHOW.panel[1], t2);
    const lit = Math.round(clamp((t - SHOW.words[0]) / (SHOW.words[1] - SHOW.words[0]), 0, 1) * wordCount);
    for (let i = 0; i < wordCount; i++) wordOn[i] = clamp(wordOn[i] + (i < lit ? 1 : -1) * dt / 0.35, 0, 1);
    const wo = TEXT.uWordOn.value;
    for (let i = 0; i < STAT_WORD; i++) { const v = wordOn[i]; wo[i] = v * v * (3 - 2 * v); }
    accentOn = clamp(accentOn + (accentFirst >= 0 && lit > accentFirst ? 1 : -1) * dt / 0.35, 0, 1);
    TEXT.uAccentOn.value = accentOn * accentOn * (3 - 2 * accentOn);
    // la photo s'ouvre en glissant
    photoOpen += (sms(SHOW.photo[0], SHOW.photo[1], t) - photoOpen) * (1 - Math.exp(-dt * 2.5));
    PHOTO.uReveal.value = photoOpen;
    photoMesh.visible = photoOpen > 0.001 && k1 > 0.001;
    // les chiffres : l'un après l'autre ; le texte s'allume, puis le décompte, et la scène le suit
    STATS.forEach((st, r) => {
      const row = statRows[r];
      const shown = on2 && t2 > SHOW.stat + r * SHOW.statStep;
      statText[r] = clamp(statText[r] + (shown ? 1 : -1) * dt / 0.45, 0, 1);
      statOn[r] = clamp(statOn[r] + (shown && statText[r] > 0.6 ? 1 : -1) * dt / 0.35, 0, 1);
      statCount[r] = clamp(statCount[r] + (shown && statText[r] > 0.6 ? 1 : -1) * dt / 1.6, 0, 1);
      wo[STAT_WORD + r] = statOn[r] * statOn[r] * (3 - 2 * statOn[r]);
      const vf = st.n * (1 - (1 - statCount[r]) ** 3), str = String(Math.round(vf));
      let x = statRight[r] - [...str].reduce((a, ch) => a + statAdv[+ch], 0);
      statDigits[r].forEach((glyphs, k) => {
        const d = k < str.length ? +str[k] : -1;
        glyphs.forEach((m, i) => { m.visible = i === d; m.position.x = x; });
        if (d >= 0) x += statAdv[d];
      });
      for (const e of row.els) {
        const go = vf > e.i + 0.35;
        if (e.delay) e.wait = go ? e.wait + dt : 0;
        e.s = clamp(e.s + (go && !(e.wait < e.delay) ? 1 : -1) * dt / 0.4, 0, 1);
        const b = backOut(e.s);
        e.obj.visible = e.s > 0.001;
        if (e.kind === 'part') {
          e.obj.scale.setScalar(Math.max(b, 1e-3));
          e.obj.rotation.y = (1 - e.s) * 1.2;
        } else if (e.kind === 'slide') {
          e.obj.position.z = e.from.z - e.dz * (1 - b);
          e.obj.scale.setScalar(Math.max(Math.min(1, e.s * 3), 1e-3));
        } else if (e.kind === 'pop') {
          e.obj.scale.setScalar(Math.max(b, 1e-3));
          e.obj.rotation.z = e.rot + (1 - e.s) * 1.2;
        } else if (e.kind === 'grow') e.obj.scale.y = Math.max(b, 1e-3);
      }
    });
  }

  // ------------------------------------------------------------ place au sol, face à la caméra d'arrivée
  // groundW : largeur de sol que filme la caméra à la fin du vol (m) ; az : son tour autour de l'îlot (rad)
  function layout({ center, groundW, az }) {
    holder.position.copy(center);
    holder.rotation.y = az;
    holder.scale.setScalar(groundW / SCREEN_W);
  }
  // déplacement du monde qui mène la caméra du premier écran au second (k de 0 à 1) : vers le bas de l'écran, sur le sol
  const _pan = new THREE.Vector3();
  const pan = (k) => _pan.set(Math.sin(holder.rotation.y), 0, Math.cos(holder.rotation.y)).multiplyScalar(PAGE * holder.scale.x * k);

  return { group: holder, update, layout, pan };
}
