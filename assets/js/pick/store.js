// 재고·기록·설정 저장소 — localStorage 호환 어댑터를 주입받는다(Node 테스트 가능)
import { PRIZE_KEYS, totalLeft } from './draw.js';

export const STORAGE_KEY = 'eunkk-pick-v1';

// 저장본도 주소 수량도 없을 때의 경품별 수량(관리자 화면에서 바꾼다)
export const DEFAULT_STOCK = 100;

export function defaultState() {
  return {
    settings: {
      title: '은크크 Pick',
      pin: '0000', // 실수 방지용. 보안 장치 아님
      fields: { name: false, phone: false, birth: false },
      consent: { org: '', purpose: '', retention: '', contact: '' },
      sound: true,
      showStock: true, // 화면 오른쪽 남은 개수 표시
    },
    stock: {
      towel: { label: '수건', total: DEFAULT_STOCK, left: DEFAULT_STOCK },
      cup: { label: '컵', total: DEFAULT_STOCK, left: DEFAULT_STOCK },
      bag: { label: '장바구니', total: DEFAULT_STOCK, left: DEFAULT_STOCK },
    },
    draws: [],
  };
}

const toCount = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// '?towel=30&cup=20&bag=25' → { towel: 30, cup: 20, bag: 25 }. 경품 키가 하나도 없으면 null.
export function parseSeed(search) {
  const p = new URLSearchParams(search || '');
  const out = {};
  let any = false;
  for (const k of PRIZE_KEYS) {
    const v = p.get(k);
    if (v !== null) any = true;
    out[k] = v === null ? 0 : toCount(v);
  }
  return any ? out : null;
}

// 저장본에 빠진 키를 기본값으로 채운다(버전이 바뀌어도 깨지지 않게)
export function normalize(d) {
  const def = defaultState();
  const s = d && typeof d === 'object' ? d : {};
  const settings = { ...def.settings, ...(s.settings || {}) };
  settings.fields = { ...def.settings.fields, ...((s.settings && s.settings.fields) || {}) };
  settings.consent = { ...def.settings.consent, ...((s.settings && s.settings.consent) || {}) };
  const stock = {};
  for (const k of PRIZE_KEYS) {
    const src = (s.stock && s.stock[k]) || {};
    stock[k] = { label: def.stock[k].label, total: toCount(src.total), left: toCount(src.left) };
  }
  const draws = Array.isArray(s.draws) ? s.draws.filter((r) => r && PRIZE_KEYS.includes(r.prize)) : [];
  return { settings, stock, draws };
}

export function isoLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

// 엑셀 수식 주입 방지 + 쉼표·따옴표·줄바꿈 이스케이프
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(state) {
  const rows = [['순번', '시각', '경품', '이름', '휴대폰', '생년월일']];
  for (const d of state.draws) {
    rows.push([d.no, d.at, state.stock[d.prize] ? state.stock[d.prize].label : d.prize, d.name, d.phone, d.birth]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function createStore({ storage, search = '', now = () => new Date() } = {}) {
  const listeners = new Set();
  let ok = true;

  function load() {
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function save() {
    if (!storage) { ok = false; return false; }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      ok = true;
    } catch (e) {
      ok = false;
    }
    return ok;
  }

  const emit = () => listeners.forEach((fn) => fn(state));

  const seed = parseSeed(search);
  const saved = load();
  let state;
  let seededFromUrl = false;
  if (saved) {
    state = saved;
  } else {
    state = defaultState();
    if (seed) {
      for (const k of PRIZE_KEYS) { state.stock[k].total = seed[k]; state.stock[k].left = seed[k]; }
      seededFromUrl = true;
    }
    save();
  }

  const api = {
    get state() { return state; },
    get ok() { return ok; },
    seededFromUrl,
    ignoredSeed: !!(saved && seed),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    save,
    totalLeft: () => totalLeft(state.stock),
    totalStock: () => PRIZE_KEYS.reduce((s, k) => s + state.stock[k].total, 0),

    // 결과를 연출 전에 확정·저장한다. 저장 실패 시 메모리 변경을 되돌리고 예외.
    commitDraw(prize, entry = {}) {
      const s = state.stock[prize];
      if (!s || s.left <= 0) throw new Error('재고 없음: ' + prize);
      const last = state.draws[state.draws.length - 1];
      const rec = {
        no: last ? last.no + 1 : 1,
        at: isoLocal(now()),
        prize,
        name: entry.name || '',
        phone: entry.phone || '',
        birth: entry.birth || '',
        shown: false,
      };
      s.left -= 1;
      state.draws.push(rec);
      if (!save()) {
        s.left += 1;
        state.draws.pop();
        throw new Error('저장 실패');
      }
      emit();
      return rec;
    },

    markShown(no) {
      const rec = state.draws.find((r) => r.no === no);
      if (rec && !rec.shown) { rec.shown = true; save(); }
    },

    pendingDraw() {
      const last = state.draws[state.draws.length - 1];
      return last && !last.shown ? last : null;
    },

    undoLast() {
      const rec = state.draws.pop();
      if (!rec) return null;
      state.stock[rec.prize].left += 1;
      save(); emit();
      return rec;
    },

    purgePersonal() {
      for (const r of state.draws) { r.name = ''; r.phone = ''; r.birth = ''; }
      save(); emit();
    },

    resetAll() {
      state.draws = [];
      for (const k of PRIZE_KEYS) state.stock[k].left = state.stock[k].total;
      save(); emit();
    },

    // 관리자 수정: 남은 수량이 총수량보다 크면 총수량을 맞춰 올린다
    setStock(key, total, left) {
      const s = state.stock[key];
      if (!s) return;
      s.left = toCount(left);
      s.total = Math.max(toCount(total), s.left);
      save(); emit();
    },

    updateSettings(patch) {
      const cur = state.settings;
      state.settings = {
        ...cur,
        ...patch,
        fields: { ...cur.fields, ...(patch.fields || {}) },
        consent: { ...cur.consent, ...(patch.consent || {}) },
      };
      save(); emit();
    },

    toCSV: () => toCSV(state),
  };
  return api;
}
