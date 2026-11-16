// 캡슐(구) 물리 — 고정 스텝 Verlet + 위치 보정(PBD). three 의존 없음.
export const STEP = 1 / 60;
export const ITER = 4;
export const STIR = { seconds: 0.2, accel: 14 };
export const MAX_CAPSULES = 200;

// 돔(반지름 R)이 대략 φ만큼 차도록 캡슐 반지름을 정한다
export function capsuleRadius(n, R, phi = 0.35) {
  const min = 0.09 * R, max = 0.2 * R;
  if (n <= 0) return max;
  return Math.min(max, Math.max(min, R * Math.cbrt(phi / n)));
}

// Shoemake 균일 랜덤 쿼터니언
export function randomQuat(rand) {
  const u1 = rand(), u2 = rand() * Math.PI * 2, u3 = rand() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

export function createPhysics({ center, radius, rand = Math.random, gravity = 9.8 }) {
  const [cx, cy, cz] = center;
  const R = radius;
  const bodies = [];
  let r = capsuleRadius(0, R);
  let stirLeft = 0;

  function spawn(x, y, z, color = 0) {
    const [qx, qy, qz, qw] = randomQuat(rand);
    const b = { x, y, z, px: x, py: y, pz: z, qx, qy, qz, qw, color };
    bodies.push(b);
    return b;
  }

  function randomInside() {
    const lim = (R - r) * 0.9;
    for (;;) {
      const x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1;
      if (x * x + y * y + z * z <= 1) return [cx + x * lim, cy + y * lim, cz + z * lim];
    }
  }

  function rotate(b, ax, ay, az, angle) {
    // q = axisAngle(axis, angle) * q
    const h = angle * 0.5, s = Math.sin(h);
    const rx = ax * s, ry = ay * s, rz = az * s, rw = Math.cos(h);
    const { qx, qy, qz, qw } = b;
    b.qx = rw * qx + rx * qw + ry * qz - rz * qy;
    b.qy = rw * qy - rx * qz + ry * qw + rz * qx;
    b.qz = rw * qz + rx * qy - ry * qx + rz * qw;
    b.qw = rw * qw - rx * qx - ry * qy - rz * qz;
    const n = Math.hypot(b.qx, b.qy, b.qz, b.qw) || 1;
    b.qx /= n; b.qy /= n; b.qz /= n; b.qw /= n;
  }

  function step(dt = STEP) {
    const g = gravity * dt * dt;
    const damp = 0.992;
    for (const b of bodies) {
      const vx = (b.x - b.px) * damp, vy = (b.y - b.py) * damp, vz = (b.z - b.pz) * damp;
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.x += vx; b.y += vy - g; b.z += vz;
    }
    if (stirLeft > 0) {
      // 돔 아래쪽 캡슐에 수평 회전 + 위쪽 가속(Verlet: 이번 스텝 변위에 a·dt² 추가)
      const a = STIR.accel * dt * dt;
      for (const b of bodies) {
        if (b.y > cy) continue;
        const dx = b.x - cx, dz = b.z - cz;
        const h = Math.hypot(dx, dz) || 1;
        b.x += (-dz / h) * a; b.z += (dx / h) * a;
        b.y += (0.4 + rand() * 0.8) * a;
      }
      stirLeft -= dt;
    }
    const d = 2 * r, d2 = d * d, lim = R - r, lim2 = lim * lim;
    const n = bodies.length;
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < n; j++) {
          const b = bodies[j];
          let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const q = dx * dx + dy * dy + dz * dz;
          if (q >= d2 || q < 1e-12) continue;
          const len = Math.sqrt(q);
          const push = ((d - len) * 0.5) / len;
          dx *= push; dy *= push; dz *= push;
          a.x -= dx; a.y -= dy; a.z -= dz;
          b.x += dx; b.y += dy; b.z += dz;
        }
      }
      for (const b of bodies) {
        const dx = b.x - cx, dy = b.y - cy, dz = b.z - cz;
        const q = dx * dx + dy * dy + dz * dz;
        if (q > lim2) {
          const s = lim / Math.sqrt(q);
          b.x = cx + dx * s; b.y = cy + dy * s; b.z = cz + dz * s;
        }
      }
    }
    // 굴림 회전: 수평 이동량 / r 만큼 cross(up, v) 축으로
    for (const b of bodies) {
      const vx = b.x - b.px, vz = b.z - b.pz;
      const sp = Math.hypot(vx, vz);
      if (sp > 1e-6) rotate(b, vz / sp, 0, -vx / sp, sp / r);
    }
  }

  return {
    bodies,
    get radius() { return r; },
    setRadius(nr) { r = nr; },
    // n개를 무작위로 채우고 미리 가라앉힌다
    fill(n, colorFn = () => 0, settleSteps = 240) {
      bodies.length = 0;
      for (let i = 0; i < n; i++) {
        const [x, y, z] = randomInside();
        spawn(x, y, z, colorFn(i));
      }
      for (let i = 0; i < settleSteps; i++) step();
    },
    // 돔 위쪽에서 하나 떨어뜨린다(보충·재고 증가)
    dropIn(color = 0) {
      const j = () => (rand() * 2 - 1) * (R - r) * 0.3;
      return spawn(cx + j(), cy + (R - r) * 0.7, cz + j(), color);
    },
    // 배출구(점)에 가장 가까운 캡슐을 빼서 돌려준다
    removeNearest(px, py, pz) {
      let best = -1, bd = Infinity;
      bodies.forEach((b, i) => {
        const q = (b.x - px) ** 2 + (b.y - py) ** 2 + (b.z - pz) ** 2;
        if (q < bd) { bd = q; best = i; }
      });
      return best < 0 ? null : bodies.splice(best, 1)[0];
    },
    // 재고 감소 반영: 가장 위에 있는 캡슐부터 뺀다
    removeTop() {
      let best = -1, by = -Infinity;
      bodies.forEach((b, i) => { if (b.y > by) { by = b.y; best = i; } });
      return best < 0 ? null : bodies.splice(best, 1)[0];
    },
    stir(seconds = STIR.seconds) { stirLeft = Math.max(stirLeft, seconds); },
    step,
  };
}
