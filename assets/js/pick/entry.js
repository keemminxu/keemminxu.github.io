// 참가자 입력 검사·정규화 — DOM 의존 없음
export const digits = (s) => String(s ?? '').replace(/\D/g, '');

export const GENDERS = ['남', '여'];

export function anyField(fields) {
  return !!(fields && (fields.name || fields.phone || fields.birth || fields.gender));
}

export function formatPhone(s) {
  const d = digits(s);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

export function isValidPhone(s) {
  return /^01[016789]\d{7,8}$/.test(digits(s));
}

export function isValidBirth(s, today = new Date()) {
  const d = digits(s);
  if (d.length !== 8) return false;
  const y = +d.slice(0, 4), m = +d.slice(4, 6), day = +d.slice(6, 8);
  if (y < 1900 || y > today.getFullYear()) return false;
  const dt = new Date(y, m - 1, day);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day && dt <= today;
}

// 관리자 기록 표(미러링 화면)용 끝자리
export const lastDigits = (s, n = 4) => digits(s).slice(-n);

// 휴대폰 입력칸에 보이는 값: 010-****-5678처럼 가운데 4자리만 가린다(미러링 화면용, 입력하는 중에도 같은 규칙)
export function maskPhoneInput(s) {
  const d = digits(s);
  return [d.slice(0, 3), '*'.repeat(Math.max(0, Math.min(d.length, 7) - 3)), d.slice(7)].filter(Boolean).join('-');
}

// 가린 칸은 글자를 직접 고칠 수 없어서 실제 숫자를 따로 들고 맨 뒤에서만 붙이고 지운다.
// inputType은 beforeinput 이벤트 값, all은 칸 전체가 선택된 상태(전체 선택 후 입력·지우기는 통째로 바꾼다)
export function editDigits(cur, { inputType = '', data = '', all = false } = {}, max = 11) {
  if (inputType.startsWith('delete')) {
    if (all || /^delete(Word|SoftLine|HardLine)Backward$/.test(inputType)) return '';
    return inputType === 'deleteContentBackward' ? cur.slice(0, -1) : cur;
  }
  if (inputType.startsWith('insert')) {
    const add = digits(data);
    return add ? ((all ? '' : cur) + add).slice(0, max) : cur;
  }
  return cur;
}

export function validateEntry(fields, input, today = new Date()) {
  const errors = {};
  const value = { name: '', phone: '', birth: '', gender: '' };
  if (fields.name) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 20) errors.name = '이름을 1~20자로 입력해 주세요.';
    else value.name = name;
  }
  if (fields.phone) {
    if (!isValidPhone(input.phone)) errors.phone = '휴대폰 번호를 확인해 주세요. (예: 01012345678)';
    else value.phone = formatPhone(input.phone);
  }
  if (fields.birth) {
    if (!isValidBirth(input.birth, today)) errors.birth = '생년월일 8자리를 확인해 주세요. (예: 19990101)';
    else value.birth = digits(input.birth);
  }
  if (fields.gender) {
    if (!GENDERS.includes(input.gender)) errors.gender = '성별을 골라 주세요.';
    else value.gender = input.gender;
  }
  if (anyField(fields) && !input.consent) errors.consent = '개인정보 수집·이용에 동의해야 참여할 수 있어요.';
  return { ok: Object.keys(errors).length === 0, errors, value };
}
