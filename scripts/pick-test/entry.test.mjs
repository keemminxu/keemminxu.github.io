// entry.js 테스트
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { validateEntry, formatPhone, isValidBirth, lastDigits } from '../../assets/js/pick/entry.js';

const today = new Date(2026, 10, 21);
test('항목이 모두 꺼져 있으면 동의 없이 통과', () => {
  const v = validateEntry({ name: false, phone: false, birth: false }, {}, today);
  assert.equal(v.ok, true);
});

test('켜진 항목 검사 + 동의 필수', () => {
  const f = { name: true, phone: true, birth: true };
  const bad = validateEntry(f, { name: ' ', phone: '0101234', birth: '20261301', consent: false }, today);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['birth', 'consent', 'name', 'phone']);
  const good = validateEntry(f, { name: ' 김민수 ', phone: '010 1234 5678', birth: '1999-01-01', consent: true }, today);
  assert.equal(good.ok, true);
  assert.deepEqual(good.value, { name: '김민수', phone: '010-1234-5678', birth: '19990101' });
});

test('생년월일: 없는 날짜·미래 날짜 거부', () => {
  assert.equal(isValidBirth('19990230', today), false);
  assert.equal(isValidBirth('20261122', today), false);
  assert.equal(isValidBirth('20261121', today), true);
});

test('전화번호 포맷과 끝자리', () => {
  assert.equal(formatPhone('0111234567'), '011-123-4567');
  assert.equal(lastDigits('010-1234-5678'), '5678');
});
