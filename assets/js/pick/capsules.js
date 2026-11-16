// 돔 속 캡슐 — physics.js 결과를 툰 인스턴스로 그린다(색 반구 + 크림 반구 + 잉크 외곽선 + 하이라이트)
import * as THREE from 'three';
import { createPhysics, capsuleRadius, STEP, MAX_CAPSULES } from './physics.js';
import { PAL, INK, toonMat } from './toon.js';

export const CAPSULE_COLORS = [PAL.pink, PAL.green500, PAL.orange, PAL.yellow];
const OUTLINE = 1.14; // 반지름 대비 외곽선 구 크기
// 하이라이트는 캡슐 회전과 무관하게 항상 빛 쪽(왼쪽 위 앞)에 붙는다
const SHINE_DIR = new THREE.Vector3(-0.35, 0.45, 0.82).normalize();

// 반지름 1 기준 반구 두 개. 인스턴스·히어로 캡슐이 함께 쓴다.
export function capsuleGeometries() {
  return {
    top: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    bottom: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  };
}

export function createCapsules(scene, { center, radius, rand = Math.random }) {
  const ph = createPhysics({ center: [center.x, center.y, center.z], radius, rand });
  const geo = capsuleGeometries();
  const top = new THREE.InstancedMesh(geo.top, toonMat(0xffffff), MAX_CAPSULES);
  const bottom = new THREE.InstancedMesh(geo.bottom, toonMat(PAL.cream), MAX_CAPSULES);
  const outline = new THREE.InstancedMesh(
    new THREE.SphereGeometry(OUTLINE, 16, 10),
    new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }),
    MAX_CAPSULES,
  );
  const shine = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_CAPSULES);
  for (const m of [top, bottom, outline, shine]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
  }
  const pickColor = () => Math.floor(rand() * CAPSULE_COLORS.length);
  const col = new THREE.Color(), mat = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const sp = new THREE.Vector3(), sq = new THREE.Quaternion(), ss = new THREE.Vector3();
  let acc = 0, filled = false;

  function sync() {
    const n = ph.bodies.length;
    top.count = bottom.count = outline.count = shine.count = n;
    const r = ph.radius;
    s.setScalar(r);
    ss.set(r * 0.28, r * 0.18, r * 0.06);
    for (let i = 0; i < n; i++) {
      const b = ph.bodies[i];
      p.set(b.x, b.y, b.z);
      q.set(b.qx, b.qy, b.qz, b.qw);
      mat.compose(p, q, s);
      top.setMatrixAt(i, mat);
      bottom.setMatrixAt(i, mat);
      outline.setMatrixAt(i, mat);
      top.setColorAt(i, col.setHex(CAPSULE_COLORS[b.color]));
      sp.copy(SHINE_DIR).multiplyScalar(r).add(p); // 표면 위에 납작하게(sq는 항등 회전)
      mat.compose(sp, sq, ss);
      shine.setMatrixAt(i, mat);
    }
    for (const m of [top, bottom, outline, shine]) m.instanceMatrix.needsUpdate = true;
    if (top.instanceColor) top.instanceColor.needsUpdate = true;
  }

  return {
    get radius() { return ph.radius; },
    get count() { return ph.bodies.length; },
    // 남은 수량에 맞춘다. 처음이거나 차이가 크면 새로 채우고, 작으면 하나씩 떨어뜨리거나 뺀다.
    setCount(n) {
      n = Math.max(0, Math.min(MAX_CAPSULES, n | 0));
      const cur = ph.bodies.length;
      if (!filled || Math.abs(n - cur) > 12) {
        ph.setRadius(capsuleRadius(n, radius));
        ph.fill(n, pickColor);
        filled = true;
      } else {
        for (let i = cur; i < n; i++) ph.dropIn(pickColor());
        for (let i = n; i < cur; i++) ph.removeTop();
      }
      sync();
    },
    // 배출구 쪽(돔 바닥)에서 가장 가까운 캡슐을 꺼낸다
    takeNearest(x, y, z) {
      const b = ph.removeNearest(x, y, z);
      sync();
      return b;
    },
    stir(seconds) { ph.stir(seconds); },
    update(dt) {
      acc += Math.min(dt, 0.1);
      while (acc >= STEP) { ph.step(); acc -= STEP; }
      sync();
    },
  };
}
