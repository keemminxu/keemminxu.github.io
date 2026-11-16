// entry.js 테스트
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { validateEntry, formatPhone, isValidBirth, lastDigits, maskPhoneInput, editDigits, anyField } from '../../assets/js/pick/entry.js';

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
  assert.deepEqual(good.value, { name: '김민수', phone: '010-1234-5678', birth: '19990101', gender: '' });
});

test('성별: 켜면 남·여 중 하나를 골라야 한다', () => {
  const f = { gender: true };
  assert.equal(anyField(f), true, '성별만 켜도 참가자 정보 화면을 띄운다');
  const none = validateEntry(f, { gender: '', consent: true }, today);
  assert.deepEqual(Object.keys(none.errors), ['gender']);
  assert.equal(validateEntry(f, { gender: '기타', consent: true }, today).ok, false);
  const ok = validateEntry(f, { gender: '여', consent: true }, today);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.gender, '여');
});

test('휴대폰 입력칸 표시: 가운데 4자리만 가린다', () => {
  assert.equal(maskPhoneInput(''), '');
  assert.equal(maskPhoneInput('010'), '010');
  assert.equal(maskPhoneInput('0101'), '010-*');
  assert.equal(maskPhoneInput('0101234'), '010-****');
  assert.equal(maskPhoneInput('01012345'), '010-****-5');
  assert.equal(maskPhoneInput('01012345678'), '010-****-5678');
});

test('휴대폰 입력 편집: 숫자만 맨 뒤에 붙이고 지운다', () => {
  assert.equal(editDigits('010', { inputType: 'insertText', data: '1' }), '0101');
  assert.equal(editDigits('010', { inputType: 'insertText', data: 'a' }), '010', '숫자가 아니면 무시');
  assert.equal(editDigits('', { inputType: 'insertFromPaste', data: '010-1234-5678' }), '01012345678');
  assert.equal(editDigits('0101234567', { inputType: 'insertText', data: '89' }), '01012345678', '11자리까지만');
  assert.equal(editDigits('0101', { inputType: 'deleteContentBackward' }), '010');
  assert.equal(editDigits('0101', { inputType: 'deleteWordBackward' }), '');
  assert.equal(editDigits('0101', { inputType: 'deleteContentBackward', all: true }), '', '전체 선택 후 지우기');
  assert.equal(editDigits('0101', { inputType: 'insertText', data: '0', all: true }), '0', '전체 선택 후 입력은 새로 시작');
  assert.equal(editDigits('0101', { inputType: 'historyUndo' }), '0101');
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
