// 돔 속 캡슐 — physics.js 결과를 InstancedMesh 2개(색 반구 + 흰 반구)로 그린다
import * as THREE from 'three';
import { createPhysics, capsuleRadius, STEP, MAX_CAPSULES } from './physics.js';

export const CAPSULE_COLORS = [0xf4a6c0, 0x2f8f4e, 0xf39a52, 0xffe14d];

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
  const top = new THREE.InstancedMesh(geo.top, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }), MAX_CAPSULES);
  const bottom = new THREE.InstancedMesh(geo.bottom, new THREE.MeshStandardMaterial({ color: 0xf6f1e3, roughness: 0.4 }), MAX_CAPSULES);
  for (const m of [top, bottom]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
  }
  const pickColor = () => Math.floor(rand() * CAPSULE_COLORS.length);
  const col = new THREE.Color(), mat = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let acc = 0, filled = false;

  function sync() {
    const n = ph.bodies.length;
    top.count = bottom.count = n;
    s.setScalar(ph.radius);
    for (let i = 0; i < n; i++) {
      const b = ph.bodies[i];
      p.set(b.x, b.y, b.z);
      q.set(b.qx, b.qy, b.qz, b.qw);
      mat.compose(p, q, s);
      top.setMatrixAt(i, mat);
      bottom.setMatrixAt(i, mat);
      top.setColorAt(i, col.setHex(CAPSULE_COLORS[b.color]));
    }
    top.instanceMatrix.needsUpdate = true;
    bottom.instanceMatrix.needsUpdate = true;
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
