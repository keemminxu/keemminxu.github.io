// physics.js 테스트
import assert from 'node:assert/strict';
import { test, rng } from './harness.mjs';
import { createPhysics, capsuleRadius } from '../../assets/js/pick/physics.js';

const C = [0, 2.15, 0], R = 1;

test('capsuleRadius: 개수에 맞춰 줄고 범위로 제한된다', () => {
  assert.equal(capsuleRadius(0, R), 0.2);
  assert.equal(capsuleRadius(3, R), 0.2);
  assert.ok(Math.abs(capsuleRadius(100, R) - Math.cbrt(0.35 / 100)) < 1e-9);
  assert.equal(capsuleRadius(100000, R), 0.09);
});

function stats(ph) {
  const r = ph.radius, b = ph.bodies;
  let outside = 0, maxPen = 0;
  for (const p of b) {
    const d = Math.hypot(p.x - C[0], p.y - C[1], p.z - C[2]);
    if (d > R - r + 1e-6) outside++;
  }
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const d = Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y, b[i].z - b[j].z);
    maxPen = Math.max(maxPen, (2 * r - d) / (2 * r));
  }
  return { outside, maxPen };
}

test('200개: 가라앉은 뒤 돔 밖으로 나가지 않고 겹침이 작다', () => {
  const ph = createPhysics({ center: C, radius: R, rand: rng(7) });
  ph.setRadius(capsuleRadius(200, R));
  ph.fill(200);
  for (let i = 0; i < 300; i++) ph.step();
  const s = stats(ph);
  console.log('   200개 최대 겹침 비율', s.maxPen.toFixed(3));
  assert.equal(s.outside, 0);
  assert.ok(s.maxPen < 0.15, 'maxPen ' + s.maxPen);
});

test('교반하는 동안에도 돔 밖으로 나가지 않는다', () => {
  const ph = createPhysics({ center: C, radius: R, rand: rng(9) });
  ph.setRadius(capsuleRadius(60, R));
  ph.fill(60);
  let maxRise = -Infinity;
  const y0 = Math.max(...ph.bodies.map((b) => b.y));
  for (let k = 0; k < 8; k++) {
    ph.stir();
    for (let i = 0; i < 20; i++) { ph.step(); maxRise = Math.max(maxRise, ...ph.bodies.map((b) => b.y)); }
  }
  assert.equal(stats(ph).outside, 0);
  assert.ok(maxRise > y0, '교반으로 캡슐이 들썩여야 한다');
});

test('removeNearest·removeTop·dropIn', () => {
  const ph = createPhysics({ center: C, radius: R, rand: rng(3) });
  ph.setRadius(capsuleRadius(20, R));
  ph.fill(20);
  const exit = [C[0], C[1] - R, C[2]];
  const before = ph.bodies.map((b) => Math.hypot(b.x - exit[0], b.y - exit[1], b.z - exit[2]));
  const got = ph.removeNearest(...exit);
  const gd = Math.hypot(got.x - exit[0], got.y - exit[1], got.z - exit[2]);
  assert.equal(gd, Math.min(...before));
  assert.equal(ph.bodies.length, 19);
  const topY = Math.max(...ph.bodies.map((b) => b.y));
  assert.equal(ph.removeTop().y, topY);
  ph.dropIn(2);
  assert.equal(ph.bodies.length, 19);
  assert.equal(ph.bodies[18].color, 2);
});

test('쿼터니언은 단위 길이를 유지한다', () => {
  const ph = createPhysics({ center: C, radius: R, rand: rng(5) });
  ph.setRadius(capsuleRadius(30, R));
  ph.fill(30);
  for (let k = 0; k < 5; k++) { ph.stir(); for (let i = 0; i < 30; i++) ph.step(); }
  for (const b of ph.bodies) assert.ok(Math.abs(Math.hypot(b.qx, b.qy, b.qz, b.qw) - 1) < 1e-6);
});
