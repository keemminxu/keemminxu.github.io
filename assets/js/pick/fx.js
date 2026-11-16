// 개봉 이펙트(툰) — 별 배지·충격파·연기 퍼프·외곽선 색종이·반짝이. 화면 플래시와 집중선은 ui.impact()가 맡는다.
import * as THREE from 'three';
import { PAL, INK } from './toon.js';

const INK_CSS = '#14231a';
const CONFETTI_COLORS = [PAL.yellow, PAL.pink, PAL.orange, PAL.green500, PAL.cream, 0x8fd3ff];
const PER_SHAPE = 55;
const PUFFS = 10;
const TWINKLES = 9;

const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

function starPath(g, cx, cy, n, R, r, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rad = i % 2 ? r : R;
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}

// 흰 면 + 잉크 테두리 도형 텍스처(인스턴스 색이 흰 면만 물들인다)
function shapeTexture(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.lineJoin = g.lineCap = 'round';
  g.lineWidth = size * 0.09;
  g.strokeStyle = INK_CSS;
  g.fillStyle = '#ffffff';
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SHAPES = {
  star: (g, s) => { starPath(g, s / 2, s / 2, 5, s * 0.42, s * 0.18); g.fill(); g.stroke(); },
  circle: (g, s) => { g.beginPath(); g.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); g.fill(); g.stroke(); },
  tri: (g, s) => { starPath(g, s / 2, s * 0.55, 3, s * 0.38, s * 0.38 * 0.5, -Math.PI / 2); g.fill(); g.stroke(); },
  squiggle: (g, s) => {
    const path = () => { g.beginPath(); g.moveTo(s * 0.12, s * 0.5); g.bezierCurveTo(s * 0.3, s * 0.2, s * 0.4, s * 0.8, s * 0.55, s * 0.5); g.bezierCurveTo(s * 0.7, s * 0.2, s * 0.8, s * 0.7, s * 0.88, s * 0.45); };
    g.lineWidth = s * 0.2; path(); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.09; path(); g.stroke();
  },
};
const sparkleTexture = () => shapeTexture((g, s) => { starPath(g, s / 2, s / 2, 4, s * 0.44, s * 0.12, 0); g.fill(); g.stroke(); });
const puffTexture = () => shapeTexture((g, s) => {
  g.fillStyle = '#fbf6e8';
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2); g.fill(); g.stroke();
});

function starMesh(n, R, r, color) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const rad = i % 2 ? r : R;
    s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
}

export function createFx(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  // 경품 뒤 별 배지(잉크 별 위에 노란 별)
  const badge = new THREE.Group();
  badge.add(starMesh(14, 1.0, 0.8, INK), starMesh(14, 0.93, 0.74, PAL.yellow));
  badge.children[1].position.z = 0.005;
  root.add(badge);

  // 충격파 링(잉크 테두리 크림 링)
  const shock = new THREE.Group();
  const ringMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  shock.add(new THREE.Mesh(new THREE.RingGeometry(0.86, 1.04, 64), ringMat(INK)), new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), ringMat(PAL.cream)));
  shock.children[1].position.z = 0.005;
  root.add(shock);

  // 연기 퍼프
  const puffMat = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const sp = new THREE.Sprite(puffMat);
    const a = (i / PUFFS) * Math.PI * 2 + Math.random() * 0.3;
    root.add(sp);
    return { sp, dir: new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8, 0), speed: 1.4 + Math.random() * 0.8 };
  });

  // 외곽선 색종이: 도형마다 InstancedMesh 하나
  const col = new THREE.Color();
  const confetti = Object.values(SHAPES).map((draw) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.11, 0.11),
      new THREE.MeshBasicMaterial({ map: shapeTexture(draw), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      PER_SHAPE,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let i = 0; i < PER_SHAPE; i++) mesh.setColorAt(i, col.setHex(CONFETTI_COLORS[(i * 7) % CONFETTI_COLORS.length]));
    root.add(mesh);
    const bits = Array.from({ length: PER_SHAPE }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, phase: Math.random() * 6 }));
    return { mesh, bits };
  });

  // 4각 반짝이(경품 주변에서 번갈아 톡톡)
  const twMat = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, color: PAL.yellow });
  const twinkles = Array.from({ length: TWINKLES }, (_, i) => {
    const sp = new THREE.Sprite(twMat);
    root.add(sp);
    return { sp, t: -i * 0.17, pos: new THREE.Vector3() };
  });

  let since = 0, time = 0;
  const center = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();

  function placeTwinkle(tw) {
    const a = Math.random() * Math.PI * 2, rad = 0.55 + Math.random() * 0.35;
    tw.pos.set(center.x + Math.cos(a) * rad, center.y + Math.sin(a) * rad * 0.85, center.z + 0.15);
  }

  return {
    burst(pos) {
      center.copy(pos);
      since = 0;
      root.visible = true;
      badge.position.copy(pos).setZ(pos.z - 0.45);
      shock.position.copy(pos).setZ(pos.z - 0.2);
      for (const pf of puffs) pf.sp.position.copy(pos);
      for (const { bits } of confetti) {
        for (const b of bits) {
          const a = Math.random() * Math.PI * 2, up = 2.4 + Math.random() * 2.8, out = 0.9 + Math.random() * 2.3;
          b.p.copy(pos);
          b.v.set(Math.cos(a) * out, up, Math.sin(a) * out * 0.3);
          b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          b.w.set((Math.random() * 2 - 1) * 6, (Math.random() * 2 - 1) * 3, (Math.random() * 2 - 1) * 8);
          b.life = 2.4 + Math.random() * 1.0;
        }
      }
      for (const tw of twinkles) placeTwinkle(tw);
    },
    clear() { root.visible = false; },
    update(dt) {
      time += dt;
      if (!root.visible) return;
      since += dt;
      // 별 배지: 튀어나와 자리 잡고 천천히 돈다
      const kb = Math.min(1, since / 0.45);
      badge.scale.setScalar(Math.max(0.001, 0.82 * easeOutBack(kb)));
      badge.rotation.z = -since * 0.25;
      // 충격파: 0.45초에 퍼지며 사라짐
      const ks = Math.min(1, since / 0.45);
      shock.visible = ks < 1;
      shock.scale.setScalar(0.3 + 1.6 * easeOutCubic(ks));
      for (const mm of shock.children) mm.material.opacity = 1 - ks;
      // 연기 퍼프: 바깥으로 튀며 커졌다 작아짐
      const kp = Math.min(1, since / 0.7);
      for (const pf of puffs) {
        pf.sp.visible = kp < 1;
        pf.sp.position.copy(center).addScaledVector(pf.dir, pf.speed * 0.55 * easeOutCubic(kp));
        pf.sp.scale.setScalar(0.32 * Math.sin(Math.PI * Math.min(1, kp * 1.1)));
      }
      // 색종이: 중력 + 공기 저항 + 좌우 팔랑임
      for (const { mesh, bits } of confetti) {
        for (let i = 0; i < bits.length; i++) {
          const b = bits[i];
          if (b.life > 0) {
            b.life -= dt;
            b.v.y -= 3.4 * dt;
            b.v.multiplyScalar(1 - 1.4 * dt);
            b.p.addScaledVector(b.v, dt);
            b.p.x += Math.sin(time * 6 + b.phase) * 0.004;
            b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt;
          }
          q.setFromEuler(b.r);
          sc.setScalar(b.life > 0 ? Math.min(1, b.life * 2) : 0);
          m.compose(b.p, q, sc);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      // 반짝이: 0.5초 주기로 톡 나타났다 사라지고 자리를 옮긴다
      for (const tw of twinkles) {
        tw.t += dt;
        if (tw.t >= 0.5) { tw.t -= 0.9; placeTwinkle(tw); }
        const k = tw.t > 0 ? Math.sin((tw.t / 0.5) * Math.PI) : 0;
        tw.sp.visible = since > 0.3 && k > 0;
        tw.sp.position.copy(tw.pos);
        tw.sp.scale.setScalar(0.17 * k);
        tw.sp.material.rotation = time;
      }
    },
  };
}
