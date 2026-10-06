// Abeilles du hero (js/hero.js) : modèle et battement d'ailes.
// Une abeille domestique, d'après nature et sans caricature (comme les papillons, js/papillons.js) : corps fin et
// allongé ; abdomen en ovale effilé, ambre doré barré de bandes brun sombre étroites et adoucies, plus sombre vers le
// bout ; thorax brun ocre au duvet roux, à peine plus large que la tête ; petite tête sombre, yeux en amande sur les
// côtés, antennes fines et coudées ; pattes fines, repliées sous le corps ; ailes claires, à peine teintées, nervures
// fines. Les couleurs et le relief sont portés par des dégradés (couleurs par sommet), pas par des aplats.
// Repère : la tête vers +z, le dos vers +y ; longueur 1 (on la met à l'échelle).
// Les ailes battent trop vite pour l'œil : on les dessine translucides entre deux positions qui alternent.
import * as THREE from 'three';

const col = (h) => new THREE.Color(h);
const C = {
  // sombres et saturées : l'éclairage du site (AgX, exposition forte) les éclaircit beaucoup
  ambre: col('#9a5512'), ambreClair: col('#b56d14'), bande: col('#140c06'), bout: col('#0e0905'),
  thorax: col('#3e2812'), duvet: col('#6a4418'), tete: col('#120d09'), oeil: col('#0a0807'), patte: col('#1c140d'),
};

// un corps tourné (profil r(t)), coloré par une fonction de t (0 : avant, 1 : arrière), le long de -z
function lathe(len, radius, color, segs = 18, sides = 12) {
  const prof = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    prof.push(new THREE.Vector2(Math.max(radius(t), 0.002), -t * len));
  }
  const g = new THREE.LatheGeometry(prof, sides);
  const pos = g.attributes.position, c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = -pos.getY(i) / len;
    const up = -pos.getZ(i) / Math.max(1e-6, Math.hypot(pos.getX(i), pos.getZ(i)));  // dessus (après rotateX : -z → +y)
    const k = color(t).clone().multiplyScalar(0.82 + 0.18 * up);                    // le dessous un peu plus sombre
    c.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.rotateX(Math.PI / 2);                           // l'axe vers -z
  return g;
}

function abdomenColor(t) {
  // bandes sombres étroites et adoucies, de plus en plus larges vers le bout
  const x = t * 5.2, f = x - Math.floor(x);
  const w = 0.32 + 0.3 * t;                         // largeur de la bande sombre
  const dark = THREE.MathUtils.smoothstep(f, 1 - w - 0.1, 1 - w + 0.05);
  const base = C.ambreClair.clone().lerp(C.ambre, t);
  return base.lerp(C.bande, dark).lerp(C.bout, THREE.MathUtils.smoothstep(t, 0.75, 1));
}

let wingTex = null;
function wingTexture() {
  if (wingTex) return wingTex;
  const W = 160, H = 64, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const outline = () => {
    g.beginPath();
    g.moveTo(2, H * 0.45);
    g.bezierCurveTo(40, 6, 120, 4, W - 6, H * 0.36);
    g.bezierCurveTo(W, H * 0.55, 110, H - 8, 2, H * 0.55);
    g.closePath();
  };
  outline();
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(200, 190, 170, 0.5)');
  grad.addColorStop(1, 'rgba(235, 240, 245, 0.22)');
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(80, 66, 50, 0.45)';
  g.lineWidth = 1;
  g.stroke();
  g.strokeStyle = 'rgba(80, 66, 50, 0.35)';         // les nervures, fines, surtout vers l'attache
  for (const [x1, y1, x2, y2] of [[3, 30, 95, 14], [3, 30, 70, 33], [40, 22, 78, 40], [78, 40, 120, 30], [95, 14, 120, 30]]) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  wingTex = new THREE.CanvasTexture(cv);
  wingTex.colorSpace = THREE.SRGBColorSpace;
  return wingTex;
}

let shared = null;
function parts(prepare) {
  if (shared) return shared;
  const std = (o) => prepare(new THREE.MeshStandardMaterial(o));
  const wingGeo = new THREE.PlaneGeometry(1, 0.4);
  wingGeo.translate(0.5, 0, 0);
  wingGeo.rotateX(-Math.PI / 2);
  shared = {
    abd: lathe(0.38, (t) => 0.1 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.92)) ** 0.55 * (1 - 0.15 * t), abdomenColor),
    thorax: lathe(0.24, (t) => 0.105 * Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)) ** 0.6,
      (t) => C.thorax.clone().lerp(C.duvet, 0.5 + 0.5 * Math.sin(t * Math.PI)), 10, 10),
    head: lathe(0.11, (t) => 0.068 * Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.95)) ** 0.6, () => C.tete, 8, 10),
    bodyMat: std({ vertexColors: true, roughness: 0.7 }),
    eyeMat: std({ color: C.oeil, roughness: 0.25 }),
    legMat: std({ color: C.patte, roughness: 0.8 }),
    wingMat: prepare(new THREE.MeshStandardMaterial({ map: wingTexture(), transparent: true, depthWrite: false,
      side: THREE.DoubleSide, roughness: 0.3 })),
    wingGeo,
  };
  return shared;
}

export function makeBee(length, prepare = (m) => m) {
  const P = parts(prepare);
  const root = new THREE.Group();                   // position et cap (posés par le hero)
  const body = new THREE.Group();
  body.scale.setScalar(length);
  root.add(body);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); body.add(m); return m; };
  add(P.head, P.bodyMat, 0, 0, 0.36);               // tête (de 0,36 à 0,23)
  add(P.thorax, P.bodyMat, 0, 0.01, 0.22);          // thorax (de 0,22 à -0,02)
  const abd = add(P.abd, P.bodyMat, 0, 0.0, -0.01);  // abdomen (de -0,01 à -0,39), un peu relevé
  abd.rotation.x = 0.12;
  // yeux en amande, sur les côtés de la tête
  for (const s of [-1, 1]) {
    const e = add(new THREE.SphereGeometry(0.032, 8, 6), P.eyeMat, s * 0.05, 0.015, 0.31);
    e.scale.set(0.45, 0.9, 1.25);
    // antennes fines, coudées
    const ant = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.02, 0.04, 0.35), new THREE.Vector3(s * 0.035, 0.1, 0.42),
      new THREE.Vector3(s * 0.08, 0.1, 0.52)]);
    body.add(new THREE.Mesh(new THREE.TubeGeometry(ant, 6, 0.006, 4), P.legMat));
  }
  // pattes fines, repliées sous le corps
  for (const s of [-1, 1]) {
    for (const [z, back] of [[0.18, 0.1], [0.1, 0.0], [0.02, -0.2]]) {
      const leg = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.04, -0.07, z), new THREE.Vector3(s * 0.09, -0.1, z + back * 0.3),
        new THREE.Vector3(s * 0.07, -0.15, z + back * 0.7)]);
      body.add(new THREE.Mesh(new THREE.TubeGeometry(leg, 5, 0.008, 3), P.legMat));
    }
  }
  // ailes : deux paires, attachées au dos du thorax, couchées vers l'arrière
  const wings = [];
  for (const s of [-1, 1]) {
    for (const [len, z, ang] of [[0.46, 0.17, 0.42], [0.32, 0.1, 0.62]]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.04, 0.1, z);
      const w = new THREE.Mesh(P.wingGeo, P.wingMat);
      w.scale.set(s * len, 1, len * 1.05);
      w.rotation.y = s * ang;                       // couchées vers l'arrière
      pivot.add(w);
      body.add(pivot);
      wings.push({ pivot, s });
    }
  }
  root.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  let flip = 0, ph = Math.random() * 6;
  // le battement : deux positions qui alternent (l'œil n'en voit qu'un flou) ; posée, elle les replie sur le dos
  function buzz(dt, landed = 0) {
    flip ^= 1;
    ph += dt;
    const up = (flip ? 0.6 : -0.25) * (1 - landed) + 0.06 * landed;
    // posée : les ailes se replient sur l'abdomen (vers l'arrière)
    for (const { pivot, s } of wings) pivot.rotation.set(0, s * 0.85 * landed, s * up);
    body.position.y = (1 - landed) * 0.03 * length * Math.sin(ph * 31);
  }
  return { root, buzz };
}
