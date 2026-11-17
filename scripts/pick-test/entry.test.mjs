// entry.js 테스트
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { validateEntry, formatPhone, isValidBirth, parseBirth, lastDigits, maskPhoneInput, editDigits, anyField } from '../../assets/js/pick/entry.js';
import { CONSENT_KEYS, CONSENT_SECTIONS } from '../../assets/js/pick/consent.js';

const today = new Date(2026, 10, 21);
const AGREED = { collect: true, share: true, photo: true };
test('항목이 모두 꺼져 있으면 동의 없이 통과', () => {
  const v = validateEntry({ name: false, phone: false, birth: false }, {}, today);
  assert.equal(v.ok, true);
});

test('켜진 항목 검사 + 동의 필수', () => {
  const f = { name: true, phone: true, birth: true };
  const bad = validateEntry(f, { name: ' ', phone: '0101234', birth: '991301', consent: {} }, today);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['birth', 'consent', 'name', 'phone']);
  const good = validateEntry(f, { name: ' 김민수 ', phone: '010 1234 5678', birth: '990101', consent: AGREED }, today);
  assert.equal(good.ok, true);
  assert.deepEqual(good.value, { name: '김민수', phone: '010-1234-5678', birth: '19990101', gender: '' }, '생년월일은 8자리로 저장');
});

test('동의서: 필수 세 항목(수집·이용, 제3자 제공, 사진·영상)을 모두 체크해야 한다', () => {
  assert.deepEqual(CONSENT_KEYS, ['collect', 'share', 'photo']);
  assert.ok(CONSENT_SECTIONS.every((s) => s.items.length > 0 && s.title.includes('(필수)')));
  const f = { name: true };
  for (const k of CONSENT_KEYS) {
    const v = validateEntry(f, { name: '가', consent: { ...AGREED, [k]: false } }, today);
    assert.deepEqual(Object.keys(v.errors), ['consent'], k + ' 빠지면 거부');
  }
  assert.equal(validateEntry(f, { name: '가', consent: true }, today).ok, false, '예전 방식(체크 하나)은 통과 못 함');
  assert.equal(validateEntry(f, { name: '가', consent: AGREED }, today).ok, true);
});

test('생년월일 6자리: 2000년대로 보고 미래면 1900년대, 8자리도 받는다', () => {
  assert.equal(parseBirth('990101', today), '19990101');
  assert.equal(parseBirth('050101', today), '20050101', '앞자리 0 유지');
  assert.equal(parseBirth('261121', today), '20261121');
  assert.equal(parseBirth('261122', today), '19261122', '2026-11-22는 미래라 1926년');
  assert.equal(parseBirth('990230', today), '', '없는 날짜');
  assert.equal(parseBirth('99010', today), '');
  assert.equal(parseBirth('1999-01-01', today), '19990101');
  assert.equal(parseBirth('20261122', today), '', '8자리 미래 날짜');
});

test('성별: 켜면 남·여 중 하나를 골라야 한다', () => {
  const f = { gender: true };
  assert.equal(anyField(f), true, '성별만 켜도 참가자 정보 화면을 띄운다');
  const none = validateEntry(f, { gender: '', consent: AGREED }, today);
  assert.deepEqual(Object.keys(none.errors), ['gender']);
  assert.equal(validateEntry(f, { gender: '기타', consent: AGREED }, today).ok, false);
  const ok = validateEntry(f, { gender: '여', consent: AGREED }, today);
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
