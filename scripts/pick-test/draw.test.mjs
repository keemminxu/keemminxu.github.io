// draw.js 테스트
import assert from 'node:assert/strict';
import { test, rng } from './harness.mjs';
import { PRIZE_KEYS, pickPrize, totalLeft } from '../../assets/js/pick/draw.js';

const stock = (t, c, b) => ({ towel: { left: t }, cup: { left: c }, bag: { left: b } });

test('합이 0이면 null', () => {
  assert.equal(pickPrize(stock(0, 0, 0), () => 0.5), null);
});

test('재고 0인 경품은 나오지 않는다', () => {
  const r = rng(1);
  for (let i = 0; i < 2000; i++) assert.notEqual(pickPrize(stock(5, 0, 5), r), 'cup');
});

test('경계값: rand=0 → 첫 재고 경품, rand≈1 → 마지막 재고 경품', () => {
  assert.equal(pickPrize(stock(0, 3, 2), () => 0), 'cup');
  assert.equal(pickPrize(stock(3, 2, 0), () => 0.9999999999), 'cup');
});

test('10만 회 분포가 남은 수량 비율 ±1%p', () => {
  const r = rng(42);
  const s = stock(30, 10, 20);
  const n = 100000;
  const cnt = { towel: 0, cup: 0, bag: 0 };
  for (let i = 0; i < n; i++) cnt[pickPrize(s, r)]++;
  assert.ok(Math.abs(cnt.towel / n - 0.5) < 0.01, 'towel ' + cnt.towel / n);
  assert.ok(Math.abs(cnt.cup / n - 1 / 6) < 0.01, 'cup ' + cnt.cup / n);
  assert.ok(Math.abs(cnt.bag / n - 1 / 3) < 0.01, 'bag ' + cnt.bag / n);
});

test('totalLeft는 음수·누락을 0으로 본다', () => {
  assert.equal(totalLeft({ towel: { left: -3 }, cup: { left: 2 } }), 2);
  assert.deepEqual(PRIZE_KEYS, ['towel', 'cup', 'bag']);
});
