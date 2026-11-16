// 참가자 입력 검사·정규화 — DOM 의존 없음
export const digits = (s) => String(s ?? '').replace(/\D/g, '');

export function anyField(fields) {
  return !!(fields && (fields.name || fields.phone || fields.birth));
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

// 미러링 화면에 번호 전체가 보이지 않게, 확인용 끝자리만
export const lastDigits = (s, n = 4) => digits(s).slice(-n);

export function validateEntry(fields, input, today = new Date()) {
  const errors = {};
  const value = { name: '', phone: '', birth: '' };
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
  if (anyField(fields) && !input.consent) errors.consent = '개인정보 수집·이용에 동의해야 참여할 수 있어요.';
  return { ok: Object.keys(errors).length === 0, errors, value };
}
