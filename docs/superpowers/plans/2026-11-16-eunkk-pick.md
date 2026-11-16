# 은크크 Pick 디지털 뽑기 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블로그(`keemminxu.com/eunkk-pick/`)에 3D 캡슐 가챠 머신 페이지를 만든다. 남은 굿즈 수량만큼 캡슐이 돔에 들어 있고, 손잡이를 한 바퀴 돌리면 캡슐 하나가 나와 열리면서 이펙트와 함께 수건·컵·장바구니 중 하나가 나타난다.

**Architecture:** 빌드 단계 없는 정적 페이지 1개 + ES 모듈. 순수 로직(`draw`·`entry`·`store`·`physics`)은 DOM·three 의존이 없어 Node로 테스트하고, 화면(`ui`)과 3D(`machine`·`capsules`·`fx`·`stage`)는 그 위에 얹는다. 상태는 부스 노트북 브라우저의 localStorage 한 곳에만 있고, 뽑기 결과는 연출 전에 저장한다.

**Tech Stack:** Jekyll(GitHub Pages), vendored three.js 0.185.1(`GLTFLoader` + meshopt), Web Audio, Node 22(테스트), playwright-core + 로컬 Chrome(헤드리스 검증), gltf-transform CLI 4.4.2(GLB 최적화)

**설계 문서:** `docs/superpowers/specs/2026-11-16-eunkk-pick-design.md`

---

## 이 계획에서 설계를 구체화한 부분

- 설계의 `stage.js`를 역할별로 나눴다: `machine.js`(머신 도형), `capsules.js`(캡슐 렌더 + 물리 연결), `fx.js`(이펙트), `sfx.js`(효과음), `stage.js`(렌더러·입력·연출 순서). 입력 검사는 `entry.js`로 분리했다.
- 개봉 연출은 카메라를 움직이는 대신, 카메라는 고정하고 캡슐을 트레이에서 화면 앞 쇼케이스 지점(`SHOWCASE`)으로 들어 올린다. HUD 배치가 흔들리지 않는다.
- 테스트는 모듈별 파일(`scripts/pick-test/*.test.mjs`) + 실행기(`scripts/pick-test.mjs`)로 나눴다. 기존 `scripts/dash-test.mjs`처럼 의존성은 없다.
- 이 계획의 모든 코드는 2026-11-16에 스크래치패드 프로토타입으로 실행해 확인했다. 순수 로직 테스트 27개 통과, 헤드리스 Chrome 검증 23개 통과(1920×1080, 콘솔 오류 0). 200개 캡슐의 최대 겹침 비율은 0.042였다.

## 작업 규칙

- 브랜치는 `feature/eunkk-pick`(이미 만들어져 있고 설계 문서 커밋이 있다). main에서 작업하지 않는다.
- 커밋 메시지 접두어는 저장소 관례(`[FEAT]`, `[DOCS]`, `[ASSET]` 등)를 따르고, **`Co-Authored-By` 트레일러를 넣지 않는다.**
- `git add`는 항상 경로를 지정한다. 작업과 무관한 미추적 파일 `assets/images/wezterm-terminal-for-unreal-engine-developers/1.png`를 함께 올리지 않는다.
- 명령은 Git Bash 기준, 작업 디렉터리는 `E:/project/dev-blog`.
- `$SCRATCH`는 세션 스크래치패드 경로다(예: `C:/Users/keemm/AppData/Local/Temp/claude/E--project-dev-blog/<세션 ID>/scratchpad`). 검증 도구와 GLB 작업 폴더는 저장소 밖인 여기에 둔다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `eunkk-pick/index.html` | Jekyll 페이지(`layout: null`, `permalink: /eunkk-pick/`, `sitemap: false`, noindex). 마크업, CSS, importmap |
| `assets/js/pick/draw.js` | `PRIZE_KEYS`, `totalLeft`, `pickPrize`(남은 수량 비례) |
| `assets/js/pick/entry.js` | 참가자 입력 검사·정규화(`validateEntry`, `lastDigits` 등) |
| `assets/js/pick/store.js` | 상태·localStorage·URL 초기 재고·기록·CSV·파기·취소 |
| `assets/js/pick/physics.js` | 구 물리(Verlet + 위치 보정), 캡슐 반지름, `MAX_CAPSULES` |
| `assets/js/pick/sfx.js` | Web Audio 합성 효과음 |
| `assets/js/pick/ui.js` | HUD, 화면 전환, 정보 입력, 결과, 관리자 패널 |
| `assets/js/pick/main.js` | 진입점, 상태 머신, 키보드 |
| `assets/js/pick/machine.js` | 머신 도형과 좌표 상수 |
| `assets/js/pick/capsules.js` | 캡슐 InstancedMesh + 물리 동기화 |
| `assets/js/pick/fx.js` | 섬광·빛줄기·후광·색종이·반짝이 |
| `assets/js/pick/stage.js` | 렌더러, 카메라, 손잡이 입력, 배출·개봉 연출, 경품 GLB |
| `assets/glb/pick/{towel,cup,bag}.glb` | 최적화한 경품 메시(Task 10) |
| `scripts/pick-test.mjs`, `scripts/pick-test/*.mjs` | 순수 로직 테스트 |

상태 머신(`main.js`): `boot → setup | locked → (entry) → ready → busy → result → locked … | soldout`

---

### Task 1: 추첨 로직 `draw.js`

**Files:**
- Create: `scripts/pick-test/harness.mjs`
- Create: `scripts/pick-test/draw.test.mjs`
- Create: `scripts/pick-test.mjs`
- Create: `assets/js/pick/draw.js`

- [ ] **Step 1: 테스트 공용 도구 작성**

`scripts/pick-test/harness.mjs`:

```js
// 은크크 Pick 테스트 공용 도구 (의존성 없음)
let passed = 0, failed = 0;

export function test(name, fn) {
  try { fn(); passed++; console.log('ok -', name); }
  catch (e) { failed++; console.error('FAIL -', name, '\n ', e.message); process.exitCode = 1; }
}

export function summary() {
  console.log(`\n${passed} passed${failed ? `, ${failed} failed` : ''}`);
}

// 시드 고정 PRNG (mulberry32)
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// localStorage 흉내
export function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`scripts/pick-test/draw.test.mjs`:

```js
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
```

`scripts/pick-test.mjs`:

```js
// node scripts/pick-test.mjs — 은크크 Pick 순수 로직 테스트 (의존성 없음)
import './pick-test/draw.test.mjs';
import { summary } from './pick-test/harness.mjs';

summary();
```

- [ ] **Step 3: 실패 확인**

Run: `node scripts/pick-test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` (`assets/js/pick/draw.js`를 찾지 못함)

- [ ] **Step 4: 구현**

`assets/js/pick/draw.js`:

```js
// 남은 수량 비례 추첨 — DOM·three 의존 없는 순수 함수
export const PRIZE_KEYS = ['towel', 'cup', 'bag'];

const leftOf = (stock, k) => Math.max(0, (stock[k] && stock[k].left) | 0);

export function totalLeft(stock) {
  return PRIZE_KEYS.reduce((sum, k) => sum + leftOf(stock, k), 0);
}

// 확률 = left_i / Σleft. 남은 게 없으면 null.
export function pickPrize(stock, rand = Math.random) {
  const total = totalLeft(stock);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const k of PRIZE_KEYS) {
    const left = leftOf(stock, k);
    if (r < left) return k;
    r -= left;
  }
  // 부동소수 오차로 끝까지 온 경우: 재고가 남은 마지막 경품
  for (let i = PRIZE_KEYS.length - 1; i >= 0; i--) {
    if (leftOf(stock, PRIZE_KEYS[i]) > 0) return PRIZE_KEYS[i];
  }
  return null;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node scripts/pick-test.mjs`
Expected: 마지막 줄 `5 passed`, `FAIL` 없음

- [ ] **Step 6: 커밋**

```bash
git add scripts/pick-test.mjs scripts/pick-test/harness.mjs scripts/pick-test/draw.test.mjs assets/js/pick/draw.js
git commit -m "[FEAT] 은크크 Pick 남은 수량 비례 추첨"
```

---

### Task 2: 참가자 입력 검사 `entry.js`

**Files:**
- Create: `scripts/pick-test/entry.test.mjs`
- Modify: `scripts/pick-test.mjs`
- Create: `assets/js/pick/entry.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/pick-test/entry.test.mjs`:

```js
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
```

`scripts/pick-test.mjs` 전체를 아래로 바꾼다:

```js
// node scripts/pick-test.mjs — 은크크 Pick 순수 로직 테스트 (의존성 없음)
import './pick-test/draw.test.mjs';
import './pick-test/entry.test.mjs';
import { summary } from './pick-test/harness.mjs';

summary();
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/pick-test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` (`assets/js/pick/entry.js`)

- [ ] **Step 3: 구현**

`assets/js/pick/entry.js`:

```js
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
```

- [ ] **Step 4: 통과 확인**

Run: `node scripts/pick-test.mjs`
Expected: `9 passed`

- [ ] **Step 5: 커밋**

```bash
git add scripts/pick-test.mjs scripts/pick-test/entry.test.mjs assets/js/pick/entry.js
git commit -m "[FEAT] 은크크 Pick 참가자 입력 검사"
```

---

### Task 3: 저장소 `store.js`

**Files:**
- Create: `scripts/pick-test/store.test.mjs`
- Modify: `scripts/pick-test.mjs`
- Create: `assets/js/pick/store.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/pick-test/store.test.mjs`:

```js
// store.js 테스트
import assert from 'node:assert/strict';
import { test, memStorage } from './harness.mjs';
import { createStore, parseSeed, toCSV, normalize, STORAGE_KEY } from '../../assets/js/pick/store.js';

test('parseSeed: 키가 없으면 null, 잘못된 값은 0', () => {
  assert.equal(parseSeed(''), null);
  assert.equal(parseSeed('?foo=1'), null);
  assert.deepEqual(parseSeed('?towel=30&cup=abc'), { towel: 30, cup: 0, bag: 0 });
});

test('저장본이 없을 때만 URL 파라미터로 재고를 채운다', () => {
  const storage = memStorage();
  const a = createStore({ storage, search: '?towel=3&cup=2&bag=1' });
  assert.equal(a.seededFromUrl, true);
  assert.equal(a.state.stock.towel.left, 3);
  a.commitDraw('towel');
  const b = createStore({ storage, search: '?towel=3&cup=2&bag=1' });
  assert.equal(b.seededFromUrl, false);
  assert.equal(b.ignoredSeed, true);
  assert.equal(b.state.stock.towel.left, 2, '다시 열어도 재고가 되돌아가지 않는다');
});

test('commitDraw: 재고 감소 + 기록 + 즉시 저장, shown=false', () => {
  const storage = memStorage();
  const s = createStore({ storage, search: '?cup=2', now: () => new Date(2026, 10, 21, 11, 3, 12) });
  const rec = s.commitDraw('cup', { name: '가' });
  assert.equal(rec.no, 1);
  assert.equal(rec.shown, false);
  assert.match(rec.at, /^2026-11-21T11:03:12[+-]\d\d:\d\d$/);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).stock.cup.left, 1);
  assert.equal(s.pendingDraw().no, 1);
  s.markShown(1);
  assert.equal(s.pendingDraw(), null);
});

test('commitDraw: 재고 없으면 예외', () => {
  const s = createStore({ storage: memStorage(), search: '?cup=1' });
  assert.throws(() => s.commitDraw('towel'), /재고 없음/);
});

test('commitDraw: 저장 실패 시 롤백 후 예외', () => {
  const storage = memStorage();
  const s = createStore({ storage, search: '?cup=2' });
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => s.commitDraw('cup'), /저장 실패/);
  assert.equal(s.state.stock.cup.left, 2);
  assert.equal(s.state.draws.length, 0);
  assert.equal(s.ok, false);
});

test('저장소가 없으면 ok=false', () => {
  const s = createStore({ storage: null, search: '?cup=2' });
  assert.equal(s.ok, false);
});

test('undoLast: 기록 삭제 + 재고 복구', () => {
  const s = createStore({ storage: memStorage(), search: '?bag=2' });
  s.commitDraw('bag');
  const rec = s.undoLast();
  assert.equal(rec.prize, 'bag');
  assert.equal(s.state.stock.bag.left, 2);
  assert.equal(s.state.draws.length, 0);
  assert.equal(s.undoLast(), null);
});

test('purgePersonal: 개인정보만 지우고 시각·경품은 남긴다', () => {
  const s = createStore({ storage: memStorage(), search: '?bag=2' });
  s.commitDraw('bag', { name: '가', phone: '010-1234-5678', birth: '19990101' });
  s.purgePersonal();
  const r = s.state.draws[0];
  assert.deepEqual([r.name, r.phone, r.birth, r.prize], ['', '', '', 'bag']);
  assert.ok(r.at);
});

test('resetAll: 기록 삭제 + left=total', () => {
  const s = createStore({ storage: memStorage(), search: '?towel=2&cup=1' });
  s.commitDraw('towel'); s.commitDraw('cup');
  s.resetAll();
  assert.equal(s.state.draws.length, 0);
  assert.equal(s.totalLeft(), 3);
});

test('setStock: 남은 수량이 총수량보다 크면 총수량을 올린다', () => {
  const s = createStore({ storage: memStorage() });
  s.setStock('cup', 5, 8);
  assert.deepEqual([s.state.stock.cup.total, s.state.stock.cup.left], [8, 8]);
  assert.equal(s.totalStock(), 8);
});

test('onChange: 변경 시 호출', () => {
  const s = createStore({ storage: memStorage(), search: '?cup=1' });
  let calls = 0;
  s.onChange(() => calls++);
  s.commitDraw('cup');
  s.updateSettings({ fields: { phone: true } });
  assert.equal(calls, 2);
  assert.equal(s.state.settings.fields.phone, true);
  assert.equal(s.state.settings.fields.name, false, '중첩 객체는 병합');
});

test('normalize: 빠진 키 보충, 알 수 없는 경품 기록 제거', () => {
  const n = normalize({ stock: { cup: { total: '3', left: 2 } }, draws: [{ prize: 'x' }, { prize: 'cup', no: 1 }] });
  assert.equal(n.stock.cup.total, 3);
  assert.equal(n.stock.towel.left, 0);
  assert.equal(n.draws.length, 1);
  assert.equal(n.settings.pin, '0000');
});

test('toCSV: BOM, 헤더, 라벨, 이스케이프, 수식 주입 방지', () => {
  const st = normalize({});
  st.draws = [
    { no: 1, at: 't1', prize: 'cup', name: '김,민수', phone: '', birth: '' },
    { no: 2, at: 't2', prize: 'bag', name: '=1+1', phone: '"x"', birth: '' },
  ];
  const csv = toCSV(st);
  assert.ok(csv.startsWith('\uFEFF순번,시각,경품,이름,휴대폰,생년월일\r\n'));
  assert.ok(csv.includes('1,t1,컵,"김,민수",,'));
  assert.ok(csv.includes("2,t2,장바구니,'=1+1,\"\"\"x\"\"\","));
});
```

`scripts/pick-test.mjs` 전체를 아래로 바꾼다:

```js
// node scripts/pick-test.mjs — 은크크 Pick 순수 로직 테스트 (의존성 없음)
import './pick-test/draw.test.mjs';
import './pick-test/entry.test.mjs';
import './pick-test/store.test.mjs';
import { summary } from './pick-test/harness.mjs';

summary();
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/pick-test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` (`assets/js/pick/store.js`)

- [ ] **Step 3: 구현**

`assets/js/pick/store.js`:

```js
// 재고·기록·설정 저장소 — localStorage 호환 어댑터를 주입받는다(Node 테스트 가능)
import { PRIZE_KEYS, totalLeft } from './draw.js';

export const STORAGE_KEY = 'eunkk-pick-v1';

export function defaultState() {
  return {
    settings: {
      title: '은크크 Pick',
      pin: '0000', // 실수 방지용. 보안 장치 아님
      fields: { name: false, phone: false, birth: false },
      consent: { org: '', purpose: '', retention: '', contact: '' },
      sound: true,
    },
    stock: {
      towel: { label: '수건', total: 0, left: 0 },
      cup: { label: '컵', total: 0, left: 0 },
      bag: { label: '장바구니', total: 0, left: 0 },
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
```

핵심 규칙(테스트가 지키는 것):
- URL 파라미터는 **저장본이 없을 때만** 재고 초기값이 된다. 저장본이 있으면 `ignoredSeed = true`.
- `commitDraw`는 저장까지 끝낸 뒤에야 기록을 돌려준다. 저장이 실패하면 메모리 변경을 되돌리고 `'저장 실패'` 예외.
- CSV는 BOM + CRLF, 쉼표·따옴표 이스케이프, `= + - @`로 시작하는 값 앞에 `'`(엑셀 수식 주입 방지).

- [ ] **Step 4: 통과 확인**

Run: `node scripts/pick-test.mjs`
Expected: `22 passed`

- [ ] **Step 5: 커밋**

```bash
git add scripts/pick-test.mjs scripts/pick-test/store.test.mjs assets/js/pick/store.js
git commit -m "[FEAT] 은크크 Pick 재고·기록 저장소"
```

---

### Task 4: 캡슐 물리 `physics.js`

**Files:**
- Create: `scripts/pick-test/physics.test.mjs`
- Modify: `scripts/pick-test.mjs`
- Create: `assets/js/pick/physics.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/pick-test/physics.test.mjs`:

```js
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
```

`scripts/pick-test.mjs` 전체를 아래로 바꾼다(최종본):

```js
// node scripts/pick-test.mjs — 은크크 Pick 순수 로직 테스트 (의존성 없음)
import './pick-test/draw.test.mjs';
import './pick-test/entry.test.mjs';
import './pick-test/store.test.mjs';
import './pick-test/physics.test.mjs';
import { summary } from './pick-test/harness.mjs';

summary();
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/pick-test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` (`assets/js/pick/physics.js`)

- [ ] **Step 3: 구현**

`assets/js/pick/physics.js`:

```js
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
```

메모: 캡슐은 구로 근사한다. 돔 반지름 `R`=1에서 캡슐 반지름은 `R·∛(0.35/N)`을 `[0.09R, 0.2R]`로 제한한다. 200개 기준 위치 보정 4회로 최대 겹침이 지름의 약 4%다.

- [ ] **Step 4: 통과 확인**

Run: `node scripts/pick-test.mjs`
Expected: `   200개 최대 겹침 비율 0.0xx` 출력 후 마지막 줄 `27 passed`

- [ ] **Step 5: 커밋**

```bash
git add scripts/pick-test.mjs scripts/pick-test/physics.test.mjs assets/js/pick/physics.js
git commit -m "[FEAT] 은크크 Pick 캡슐 물리"
```

---

### Task 5: 효과음 `sfx.js`

Web Audio는 Node에서 돌릴 수 없어 단위 테스트 대신 Task 9의 브라우저 검증과 Task 11 리허설에서 귀로 확인한다.

**Files:**
- Create: `assets/js/pick/sfx.js`

- [ ] **Step 1: 구현**

`assets/js/pick/sfx.js`:

```js
// 효과음 — Web Audio 합성(음원 파일 없음). 첫 사용자 입력에서 unlock() 해야 소리가 난다.
export function createSfx() {
  let ctx = null, master = null, noiseBuf = null, enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function envelope(g, t0, dur, vol) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone({ type = 'sine', f0, f1 = f0, t = 0, dur, vol = 0.3 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    envelope(g, t0, dur, vol);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise({ t = 0, dur, vol = 0.3, type = 'bandpass', freq = 1200, q = 1 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    envelope(g, t0, dur, vol);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    get enabled() { return enabled; },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled && ctx && ctx.state === 'running') ctx.suspend();
    },
    unlock() { ensure(); },
    click() { tone({ type: 'square', f0: 1800, f1: 900, dur: 0.035, vol: 0.12 }); noise({ dur: 0.03, vol: 0.15, freq: 3000 }); },
    roll(dur = 1.2) {
      for (let i = 0; i < 8; i++) noise({ t: (i * dur) / 8, dur: 0.09, vol: 0.18, freq: 500 + Math.random() * 400, q: 3 });
    },
    thunk() { tone({ f0: 160, f1: 60, dur: 0.18, vol: 0.5 }); noise({ dur: 0.06, vol: 0.2, freq: 400 }); },
    tick() { tone({ type: 'triangle', f0: 900, dur: 0.025, vol: 0.12 }); },
    pop() { noise({ dur: 0.12, vol: 0.35, type: 'highpass', freq: 1500 }); tone({ f0: 500, f1: 1400, dur: 0.12, vol: 0.25 }); },
    fanfare() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ type: 'triangle', f0: f, t: i * 0.11, dur: i === 3 ? 0.5 : 0.12, vol: 0.22 }));
    },
  };
}
```

- [ ] **Step 2: 커밋**

```bash
git add assets/js/pick/sfx.js
git commit -m "[FEAT] 은크크 Pick 합성 효과음"
```

---

### Task 6: 페이지·화면·상태 머신 (2D로 먼저 동작)

이 시점에는 `stage.js`가 없어서 `main.js`의 동적 import가 실패하고 **2D 모드**(`body.no3d`)로 돈다. 3D가 안 되는 기기에서 쓰는 대체 경로를 먼저 확인하는 셈이다.

**Files:**
- Create: `eunkk-pick/index.html`
- Create: `assets/js/pick/ui.js`
- Create: `assets/js/pick/main.js`

- [ ] **Step 1: 페이지 작성**

`eunkk-pick/index.html`:

```html
---
layout: null
permalink: /eunkk-pick/
sitemap: false
---
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>은크크 Pick</title>
<style>
  @font-face {
    font-family: 'ChaiHwaljjak';
    src: url('/assets/fonts/ChaiHwaljjak/ChaiHwaljjak-Bold.woff2') format('woff2');
    font-weight: 700;
    font-display: swap;
  }
  :root {
    --green-900: #0f3d24; --green-700: #1d6b3c; --green-500: #2f8f4e;
    --yellow: #ffe14d; --cream: #f6f1e3; --pink: #f4a6c0; --orange: #f39a52; --ink: #14231a; --red: #d64545;
    --display: 'ChaiHwaljjak', 'Malgun Gothic', sans-serif;
    --ui: 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body {
    background: radial-gradient(ellipse at 50% 38%, var(--green-500) 0%, var(--green-700) 45%, var(--green-900) 100%);
    color: var(--cream); font-family: var(--ui); user-select: none;
  }
  #stage { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; touch-action: none; }
  body.no3d #stage { display: none; }

  .brand { position: fixed; left: 3vw; top: 3.5vh; }
  .brand h1 { margin: 0; font: 700 4.4vw/1 var(--display); color: var(--cream); letter-spacing: -0.02em; }
  .brand h1 b { color: var(--yellow); }
  .brand p { margin: 1.2vh 0 0; font-size: 1.3vw; opacity: 0.85; }

  .stock { position: fixed; right: 3vw; top: 50%; transform: translateY(-50%); display: grid; gap: 1.6vh; width: 15vw; }
  .card { background: var(--cream); color: var(--ink); border-radius: 1.2vw; padding: 1.4vh 1.2vw 1.6vh; display: grid; grid-template-columns: 1fr auto; align-items: baseline; border-left: 0.7vw solid var(--pink); }
  .card.orange { border-left-color: var(--orange); }
  .card.yellow { border-left-color: var(--yellow); }
  .card .label { font-size: 1.3vw; font-weight: 700; }
  .card .num { font: 700 3.6vw/1 var(--display); color: var(--green-700); text-align: right; }
  .card .unit { grid-column: 1 / -1; font-size: 0.9vw; opacity: 0.7; text-align: right; }
  .card .bar { grid-column: 1 / -1; height: 0.6vh; background: #e2dccb; border-radius: 1vh; overflow: hidden; margin-top: 0.8vh; }
  .card .bar i { display: block; height: 100%; background: var(--green-500); transition: width 0.4s; }
  .card.empty { opacity: 0.45; }

  .action, .result { position: fixed; left: 50%; bottom: 4vh; transform: translateX(-50%); text-align: center; }
  .hint { margin: 0 0 1.4vh; font-size: 1.5vw; font-weight: 700; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
  .btn-primary, .btn-ghost, .btn-danger { font: 700 1.1rem var(--ui); border: 0; border-radius: 999px; padding: 0.8em 1.6em; cursor: pointer; }
  .btn-primary { background: var(--yellow); color: var(--ink); box-shadow: 0 6px 0 #c9a91a; }
  .btn-primary:active { transform: translateY(3px); box-shadow: 0 3px 0 #c9a91a; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .action .btn-primary, .result .btn-primary { font-size: 1.6vw; }
  .btn-ghost { background: transparent; color: inherit; border: 2px solid currentColor; }
  .btn-danger { background: var(--red); color: #fff; }
  .btn-danger[data-armed] { background: #8f1f1f; }

  .result { background: rgba(15, 61, 36, 0.85); border: 3px solid var(--yellow); border-radius: 2vw; padding: 2.2vh 3vw; min-width: 36vw; }
  .result-title { margin: 0; font: 700 4.4vw/1.1 var(--display); color: var(--yellow); }
  .result-sub { margin: 1vh 0 2vh; font-size: 1.4vw; }

  .loading { position: fixed; inset: 0; display: grid; place-items: center; font: 700 2vw var(--display); }

  .ov { position: fixed; inset: 0; background: rgba(6, 24, 13, 0.72); display: grid; place-items: center; z-index: 10; }
  .panel { background: var(--cream); color: var(--ink); border-radius: 24px; padding: 32px 36px; width: min(720px, 92vw); max-height: 92vh; overflow: auto; user-select: text; }
  .panel.narrow { width: min(420px, 92vw); }
  .panel.center { text-align: center; }
  .panel h2 { margin: 0 0 20px; font: 700 2rem var(--display); color: var(--green-700); }
  .panel h2.big { font-size: 3rem; }
  .panel p { font-size: 1.1rem; line-height: 1.6; }
  .field { display: grid; gap: 6px; margin-bottom: 16px; font-size: 1.1rem; font-weight: 700; }
  .field input, .panel input:not([type=checkbox]) { font: 400 1.3rem var(--ui); padding: 10px 14px; border: 2px solid #cfc7b0; border-radius: 12px; background: #fff; color: var(--ink); width: 100%; }
  .mask-hint { font-weight: 400; color: var(--green-700); min-height: 1.2em; }
  .consent { background: #ece5d1; border-radius: 12px; padding: 12px 16px; margin: 8px 0 16px; }
  .consent p { margin: 0 0 8px; font-size: 0.95rem; }
  .check { display: flex; gap: 8px; align-items: center; font-weight: 700; cursor: pointer; }
  .check input { width: 22px; height: 22px; }
  .err { color: var(--red); font-size: 0.95rem; margin: 4px 0 0; min-height: 1.1em; font-weight: 400; }
  .row-btns { display: flex; gap: 12px; justify-content: flex-end; margin-top: 12px; }
  .row-btns.wrap { flex-wrap: wrap; justify-content: flex-start; }

  .banner { position: fixed; top: 0; left: 0; right: 0; background: var(--red); color: #fff; padding: 12px 20px; font-weight: 700; text-align: center; z-index: 20; }
  .toast { position: fixed; top: 3vh; left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--cream); padding: 10px 22px; border-radius: 999px; font-weight: 700; z-index: 30; }
  .gear { position: fixed; right: 14px; bottom: 12px; background: none; border: 0; color: var(--cream); font-size: 22px; opacity: 0.35; cursor: pointer; z-index: 5; }
  .gear:hover { opacity: 1; }

  .admin { position: fixed; top: 0; right: 0; bottom: 0; width: min(600px, 100vw); background: var(--cream); color: var(--ink); overflow: auto; padding: 24px 28px 40px; z-index: 15; box-shadow: -12px 0 40px rgba(0, 0, 0, 0.35); user-select: text; }
  .admin-head { display: flex; justify-content: space-between; align-items: center; }
  .admin h2 { margin: 0; font: 700 1.8rem var(--display); color: var(--green-700); }
  .admin h3 { margin: 24px 0 10px; font-size: 1.1rem; }
  .admin label:not(.check) { display: grid; gap: 4px; margin-bottom: 10px; font-size: 0.95rem; font-weight: 700; }
  .admin input:not([type=checkbox]) { font-size: 1rem; padding: 8px 10px; }
  .admin .check { margin-bottom: 8px; }
  .admin table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  .admin th, .admin td { padding: 6px 8px; border-bottom: 1px solid #ddd4bd; text-align: left; }
  .stock-edit th { white-space: nowrap; }
  .stock-edit input { width: 100%; }
  .btn-primary.wide { width: 100%; margin-top: 8px; font-size: 1.1rem; }
</style>
</head>
<body>
<canvas id="stage" aria-label="캡슐 뽑기 머신"></canvas>

<header class="brand">
  <h1 id="brandTitle">은크크 <b>Pick</b></h1>
  <p>대조시장 참여 점포 영수증 1장 = 뽑기 1회</p>
</header>

<aside class="stock" id="stock" aria-live="polite"></aside>

<div class="action" id="action" hidden>
  <p class="hint" id="hint"></p>
  <button class="btn-primary" id="primaryBtn" type="button"></button>
</div>

<section class="result" id="result" hidden aria-live="assertive">
  <p class="result-title"><span id="resultName"></span> 당첨!</p>
  <p class="result-sub">부스 스태프에게 굿즈를 받아 가세요</p>
  <button class="btn-primary" id="nextBtn" type="button">다음 참가자 <span id="nextCount"></span></button>
</section>

<div class="loading" id="loading">머신을 준비하고 있어요…</div>

<div class="ov" id="entryOv" hidden>
  <form class="panel" id="entryForm" novalidate autocomplete="off">
    <h2>참가자 정보</h2>
    <div id="entryFields"></div>
    <div class="consent">
      <p id="consentText"></p>
      <label class="check"><input type="checkbox" id="consentChk"> 개인정보 수집·이용에 동의해요</label>
      <p class="err" data-err="consent"></p>
    </div>
    <p class="err" id="consentMissing" hidden>관리자 화면에서 개인정보 동의 문구(수집 주체·목적·보유 기간)를 먼저 입력해 주세요.</p>
    <div class="row-btns">
      <button type="button" class="btn-ghost" id="entryCancel">취소</button>
      <button type="submit" class="btn-primary" id="entrySubmit">뽑으러 가기</button>
    </div>
  </form>
</div>

<div class="ov" id="soldoutOv" hidden>
  <div class="panel center"><h2 class="big">모든 굿즈가 소진됐어요</h2><p>참여해 주셔서 고맙습니다!</p></div>
</div>

<div class="ov" id="setupOv" hidden>
  <div class="panel center">
    <h2>재고를 먼저 입력해 주세요</h2>
    <p>관리자 화면에서 수건·컵·장바구니 수량을 넣으면 시작할 수 있어요.<br>
      처음 열 때 주소 뒤에 <code>?towel=30&amp;cup=20&amp;bag=25</code>처럼 붙여도 돼요.</p>
    <button class="btn-primary" id="setupAdmin" type="button">관리자 열기</button>
  </div>
</div>

<div class="banner" id="storeWarn" hidden>이 브라우저에 기록을 저장할 수 없어요. 시크릿 창이 아닌지 확인하고 새로 고쳐 주세요. 저장되기 전까지 뽑기를 잠가 둘게요.</div>
<div class="toast" id="toast" hidden></div>
<button class="gear" id="gear" type="button" aria-label="관리자 화면">⚙</button>

<div class="ov" id="pinOv" hidden>
  <form class="panel narrow" id="pinForm" autocomplete="off">
    <h2>관리자 비밀번호</h2>
    <input id="pinInput" type="password" inputmode="numeric" maxlength="8" aria-label="비밀번호">
    <p class="err" id="pinErr"></p>
    <div class="row-btns">
      <button type="button" class="btn-ghost" id="pinCancel">취소</button>
      <button type="submit" class="btn-primary">열기</button>
    </div>
  </form>
</div>

<aside class="admin" id="admin" hidden>
  <div class="admin-head"><h2>관리자</h2><button type="button" class="btn-ghost" id="adminClose">닫기</button></div>
  <h3>재고</h3>
  <table class="stock-edit">
    <thead><tr><th>경품</th><th>총수량</th><th>남은 수량</th></tr></thead>
    <tbody id="stockEdit"></tbody>
  </table>
  <h3>행사</h3>
  <label>제목 <input id="aTitle"></label>
  <label>새 비밀번호 (숫자 4~8자리, 비우면 그대로) <input id="aPin" type="password" inputmode="numeric" maxlength="8"></label>
  <label class="check"><input type="checkbox" id="aSound"> 효과음</label>
  <h3>참가자 정보 수집</h3>
  <label class="check"><input type="checkbox" id="fName"> 이름</label>
  <label class="check"><input type="checkbox" id="fPhone"> 휴대폰</label>
  <label class="check"><input type="checkbox" id="fBirth"> 생년월일</label>
  <label>수집 주체 <input id="cOrg"></label>
  <label>수집 목적 <input id="cPurpose"></label>
  <label>보유 기간 <input id="cRetention"></label>
  <label>문의처 <input id="cContact"></label>
  <p class="err" id="adminErr"></p>
  <button class="btn-primary wide" id="adminSave" type="button">저장</button>
  <h3>기록 <span id="drawCount"></span></h3>
  <div class="row-btns wrap">
    <button type="button" class="btn-ghost" id="csvBtn">CSV 내보내기</button>
    <button type="button" class="btn-danger" id="undoBtn">마지막 뽑기 취소</button>
    <button type="button" class="btn-danger" id="purgeBtn">개인정보 파기</button>
    <button type="button" class="btn-danger" id="resetBtn">전체 초기화</button>
  </div>
  <table class="log">
    <thead><tr><th>#</th><th>시각</th><th>경품</th><th>이름</th><th>휴대폰</th></tr></thead>
    <tbody id="logBody"></tbody>
  </table>
</aside>

<script type="importmap">
  {"imports":{
    "three":"{{ '/assets/vendor/three-0.185.1/three.module.min.js' | relative_url }}",
    "three/addons/":"{{ '/assets/vendor/three-0.185.1/jsm/' | relative_url }}"
  }}
</script>
<script type="module" src="{{ '/assets/js/pick/main.js' | relative_url }}"></script>
</body>
</html>
```

- [ ] **Step 2: 화면 모듈 작성**

`assets/js/pick/ui.js`:

```js
// 화면(DOM) — HUD, 정보 입력, 결과, 오버레이, 관리자 패널
import { anyField, validateEntry, lastDigits } from './entry.js';
import { PRIZE_KEYS } from './draw.js';

const $ = (id) => document.getElementById(id);
const ACCENT = { towel: 'pink', cup: 'orange', bag: 'yellow' };
const AUTO_NEXT_SEC = 20;

// 미러링 화면에 띄우는 관리자 기록용 가리기(CSV에는 원본)
export const maskName = (s) => {
  const a = [...String(s || '')];
  if (a.length <= 1) return a.join('');
  if (a.length === 2) return a[0] + '*';
  return a[0] + '*'.repeat(a.length - 2) + a[a.length - 1];
};
export const maskPhone = (s) => (s ? '***-****-' + lastDigits(s) : '');

const FIELD_DEFS = [
  { key: 'name', label: '이름', attrs: { type: 'text', maxLength: 20 } },
  { key: 'phone', label: '휴대폰 번호', attrs: { type: 'password', inputMode: 'numeric', maxLength: 13 }, masked: true },
  { key: 'birth', label: '생년월일 8자리', attrs: { type: 'password', inputMode: 'numeric', maxLength: 10 }, masked: true },
];

export function createUI({ store, handlers }) {
  let countdown = null, toastTimer = null, adminEnabled = true;

  // ---------- HUD ----------
  function renderTitle() {
    const t = store.state.settings.title || '은크크 Pick';
    const h = $('brandTitle');
    h.textContent = '';
    if (t.endsWith('Pick')) {
      const b = document.createElement('b');
      b.textContent = 'Pick';
      h.append(t.slice(0, -4), b);
    } else {
      h.textContent = t;
    }
    document.title = t;
  }

  function renderStock() {
    const box = $('stock');
    if (!box.children.length) {
      for (const k of PRIZE_KEYS) {
        const card = document.createElement('div');
        card.className = 'card ' + ACCENT[k];
        card.dataset.k = k;
        card.innerHTML = '<span class="label"></span><span class="num"></span><span class="unit">개 남음</span><span class="bar"><i></i></span>';
        box.append(card);
      }
    }
    for (const card of box.children) {
      const s = store.state.stock[card.dataset.k];
      card.querySelector('.label').textContent = s.label;
      card.querySelector('.num').textContent = s.left;
      card.querySelector('.bar i').style.width = (s.total ? (s.left / s.total) * 100 : 0) + '%';
      card.classList.toggle('empty', s.left === 0);
    }
  }

  // ---------- 화면 전환 ----------
  function stopCountdown() {
    if (countdown) { clearInterval(countdown); countdown = null; }
    $('nextCount').textContent = '';
  }

  function startCountdown(sec) {
    let n = sec;
    $('nextCount').textContent = `(${n})`;
    countdown = setInterval(() => {
      n -= 1;
      if (n <= 0) { stopCountdown(); handlers.onNext(); }
      else $('nextCount').textContent = `(${n})`;
    }, 1000);
  }

  function setScreen(name, data) {
    stopCountdown();
    // 숨겨지는 버튼에 포커스가 남으면 스페이스·엔터가 먹히지 않는다
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    document.body.dataset.screen = name;
    $('loading').hidden = name !== 'boot';
    $('action').hidden = !(name === 'locked' || name === 'ready');
    $('result').hidden = name !== 'result';
    $('entryOv').hidden = name !== 'entry';
    $('soldoutOv').hidden = name !== 'soldout';
    $('setupOv').hidden = name !== 'setup';
    const no3d = document.body.classList.contains('no3d');
    if (name === 'locked') {
      $('hint').textContent = '부스에서 영수증을 확인받아 주세요';
      $('primaryBtn').textContent = anyField(store.state.settings.fields) ? '참가하기' : '영수증 확인 완료';
    } else if (name === 'ready') {
      $('hint').textContent = no3d ? '버튼을 눌러 뽑아 주세요' : '손잡이를 시계 방향으로 돌려 주세요 · 드래그 / 스크롤 / 스페이스';
      $('primaryBtn').textContent = no3d ? '뽑기' : '대신 돌려 주기';
    } else if (name === 'entry') {
      openEntry();
    } else if (name === 'result') {
      $('resultName').textContent = store.state.stock[data.prize].label;
      startCountdown(AUTO_NEXT_SEC);
    }
  }

  // ---------- 정보 입력 ----------
  function clearErrors() {
    for (const el of $('entryForm').querySelectorAll('.err[data-err]')) el.textContent = '';
  }

  function openEntry() {
    const { fields, consent } = store.state.settings;
    const box = $('entryFields');
    box.textContent = '';
    for (const def of FIELD_DEFS) {
      if (!fields[def.key]) continue;
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const span = document.createElement('span');
      span.textContent = def.label;
      const input = document.createElement('input');
      input.name = def.key;
      input.autocomplete = 'off';
      Object.assign(input, def.attrs);
      wrap.append(span, input);
      if (def.masked) {
        const hint = document.createElement('small');
        hint.className = 'mask-hint';
        input.addEventListener('input', () => { hint.textContent = input.value ? '끝자리 ' + lastDigits(input.value) : ''; });
        wrap.append(hint);
      }
      const err = document.createElement('p');
      err.className = 'err';
      err.dataset.err = def.key;
      wrap.append(err);
      box.append(wrap);
    }
    const missing = !consent.org || !consent.purpose || !consent.retention;
    $('consentMissing').hidden = !missing;
    $('entrySubmit').disabled = missing;
    const items = FIELD_DEFS.filter((d) => fields[d.key]).map((d) => d.label.replace(' 8자리', '')).join(', ');
    $('consentText').textContent =
      `수집 주체: ${consent.org} · 목적: ${consent.purpose} · 항목: ${items} · 보유 기간: ${consent.retention}` +
      (consent.contact ? ` · 문의: ${consent.contact}` : '') +
      ' · 동의하지 않으면 참여할 수 없어요.';
    $('consentChk').checked = false;
    clearErrors();
    const first = box.querySelector('input');
    if (first) setTimeout(() => first.focus(), 0);
  }

  $('entryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = $('entryForm');
    const get = (n) => (form.elements[n] ? form.elements[n].value : '');
    const res = validateEntry(store.state.settings.fields, {
      name: get('name'), phone: get('phone'), birth: get('birth'), consent: $('consentChk').checked,
    });
    clearErrors();
    if (!res.ok) {
      for (const [k, msg] of Object.entries(res.errors)) {
        const el = form.querySelector(`.err[data-err="${k}"]`);
        if (el) el.textContent = msg;
      }
      return;
    }
    handlers.onEnter(res.value);
  });
  $('entryCancel').addEventListener('click', () => handlers.onCancelEntry());
  $('primaryBtn').addEventListener('click', () => handlers.onPrimary());
  $('nextBtn').addEventListener('click', () => handlers.onNext());

  // ---------- 알림 ----------
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- 관리자 ----------
  function openPin() {
    if (!adminEnabled) return;
    $('pinOv').hidden = false;
    $('pinErr').textContent = '';
    $('pinInput').value = '';
    setTimeout(() => $('pinInput').focus(), 0);
  }
  $('pinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('pinInput').value.trim() === String(store.state.settings.pin || '0000')) {
      $('pinOv').hidden = true;
      openAdmin();
    } else {
      $('pinErr').textContent = '비밀번호가 맞지 않아요.';
      $('pinInput').value = '';
    }
  });
  $('pinCancel').addEventListener('click', () => { $('pinOv').hidden = true; });
  $('gear').addEventListener('click', openPin);
  $('setupAdmin').addEventListener('click', openPin);

  function renderLog() {
    const st = store.state;
    $('drawCount').textContent = `(${st.draws.length}건)`;
    const tb = $('logBody');
    tb.textContent = '';
    for (const d of st.draws.slice(-50).reverse()) {
      const tr = document.createElement('tr');
      for (const v of [d.no, d.at.slice(11, 19), st.stock[d.prize].label, maskName(d.name), maskPhone(d.phone)]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.append(td);
      }
      tb.append(tr);
    }
  }

  function fillAdmin() {
    const st = store.state, s = st.settings;
    $('aTitle').value = s.title;
    $('aPin').value = '';
    $('aSound').checked = s.sound;
    $('fName').checked = s.fields.name;
    $('fPhone').checked = s.fields.phone;
    $('fBirth').checked = s.fields.birth;
    $('cOrg').value = s.consent.org;
    $('cPurpose').value = s.consent.purpose;
    $('cRetention').value = s.consent.retention;
    $('cContact').value = s.consent.contact;
    const tb = $('stockEdit');
    tb.textContent = '';
    for (const k of PRIZE_KEYS) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = st.stock[k].label;
      row.append(th);
      for (const f of ['total', 'left']) {
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = '0'; inp.step = '1';
        inp.value = st.stock[k][f];
        inp.dataset.k = k; inp.dataset.f = f;
        td.append(inp);
        row.append(td);
      }
      tb.append(row);
    }
    $('adminErr').textContent = '';
    renderLog();
  }

  function openAdmin() { fillAdmin(); $('admin').hidden = false; }
  function closeAdmin() { $('admin').hidden = true; }
  $('adminClose').addEventListener('click', closeAdmin);

  $('adminSave').addEventListener('click', () => {
    const pin = $('aPin').value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { $('adminErr').textContent = '비밀번호는 숫자 4~8자리예요.'; return; }
    const fields = { name: $('fName').checked, phone: $('fPhone').checked, birth: $('fBirth').checked };
    const consent = { org: $('cOrg').value.trim(), purpose: $('cPurpose').value.trim(), retention: $('cRetention').value.trim(), contact: $('cContact').value.trim() };
    if (anyField(fields) && (!consent.org || !consent.purpose || !consent.retention)) {
      $('adminErr').textContent = '정보를 수집하려면 수집 주체·목적·보유 기간을 입력해 주세요.';
      return;
    }
    store.updateSettings({ title: $('aTitle').value.trim() || '은크크 Pick', sound: $('aSound').checked, fields, consent, ...(pin ? { pin } : {}) });
    const vals = {};
    for (const inp of $('stockEdit').querySelectorAll('input')) (vals[inp.dataset.k] ||= {})[inp.dataset.f] = inp.value;
    for (const k of PRIZE_KEYS) store.setStock(k, vals[k].total, vals[k].left);
    renderTitle();
    fillAdmin();
    toast('저장했어요');
    handlers.onAdminChanged();
  });

  // 파괴적 작업은 3초 안에 한 번 더 눌러야 실행
  function confirmable(btn, fn) {
    const label = btn.textContent;
    let timer = null;
    btn.addEventListener('click', () => {
      if (btn.dataset.armed) {
        clearTimeout(timer);
        delete btn.dataset.armed;
        btn.textContent = label;
        fn();
        return;
      }
      btn.dataset.armed = '1';
      btn.textContent = '한 번 더 누르면 실행';
      timer = setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; }, 3000);
    });
  }
  confirmable($('undoBtn'), () => {
    const r = store.undoLast();
    toast(r ? `#${r.no} ${store.state.stock[r.prize].label} 기록을 취소했어요` : '취소할 기록이 없어요');
    fillAdmin();
    handlers.onAdminChanged();
  });
  confirmable($('purgeBtn'), () => { store.purgePersonal(); toast('개인정보를 파기했어요'); fillAdmin(); });
  confirmable($('resetBtn'), () => {
    store.resetAll();
    toast('기록을 지우고 재고를 처음으로 돌렸어요');
    fillAdmin();
    handlers.onAdminChanged();
  });

  $('csvBtn').addEventListener('click', () => {
    const blob = new Blob([store.toCSV()], { type: 'text/csv;charset=utf-8' });
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eunkk-pick-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('pinOv').hidden = true; closeAdmin(); }
  });

  return {
    renderTitle,
    renderStock,
    setScreen,
    toast,
    openPin,
    setAdminEnabled(v) {
      adminEnabled = v;
      $('gear').hidden = !v;
      if (!v) { $('pinOv').hidden = true; closeAdmin(); }
    },
    setStorageWarning(v) { $('storeWarn').hidden = !v; },
  };
}
```

메모:
- 화면이 바뀔 때 포커스를 푼다. 숨겨진 버튼에 포커스가 남으면 다음 스페이스·엔터가 먹히지 않는다(프로토타입에서 실제로 난 버그).
- 관리자 기록 표는 미러링된 TV에 보이므로 이름·휴대폰을 가린다. CSV에는 원본이 들어간다.
- 결과 화면 20초 자동 넘김은 `ui.js`만 관리한다(`handlers.onNext` 호출).

- [ ] **Step 3: 진입점 작성**

`assets/js/pick/main.js`:

```js
// 진입점 — store·stage·ui를 묶고 상태 머신을 돌린다
// boot → setup | locked → (entry) → ready → busy → result → locked … | soldout
import { createStore } from './store.js';
import { pickPrize, PRIZE_KEYS } from './draw.js';
import { anyField } from './entry.js';
import { MAX_CAPSULES } from './physics.js';
import { createSfx } from './sfx.js';
import { createUI } from './ui.js';

function safeStorage() {
  try {
    const s = window.localStorage;
    s.setItem('__pick_probe', '1');
    s.removeItem('__pick_probe');
    return s;
  } catch (e) {
    return null;
  }
}

const store = createStore({ storage: safeStorage(), search: location.search });
const sfx = createSfx();
sfx.setEnabled(store.state.settings.sound);

let phase = 'boot';
let entry = null;
let stage = null;
let lastShown = null; // 결과 화면에 띄운 기록

const visibleCount = () => Math.min(store.totalLeft(), MAX_CAPSULES);
const glbUrl = (k) => new URL(`../../glb/pick/${k}.glb`, import.meta.url).href;

const ui = createUI({
  store,
  handlers: {
    onPrimary() {
      sfx.unlock();
      if (!store.ok) { ui.toast('기록을 저장할 수 없어 뽑기를 잠가 두었어요'); return; }
      if (phase === 'locked') {
        if (anyField(store.state.settings.fields)) setPhase('entry');
        else { entry = {}; setPhase('ready'); }
      } else if (phase === 'ready') {
        turnByButton();
      }
    },
    onEnter(value) { entry = value; setPhase('ready'); },
    onCancelEntry() { setPhase('locked'); },
    onNext() { next(); },
    onAdminChanged() {
      sfx.setEnabled(store.state.settings.sound);
      if (phase !== 'busy' && phase !== 'boot') next();
    },
  },
});

function setPhase(p) {
  phase = p;
  ui.setScreen(p, p === 'result' ? lastShown : undefined);
  ui.setAdminEnabled(p !== 'busy');
  ui.setStorageWarning(!store.ok);
  if (stage) stage.setMode(p === 'ready' ? 'ready' : p === 'busy' ? 'busy' : 'idle');
}

function idle() {
  entry = null;
  if (store.totalStock() === 0) return setPhase('setup');
  if (store.totalLeft() === 0) return setPhase('soldout');
  return setPhase('locked');
}

function next() {
  if (stage) stage.clearReveal();
  idle();
}

function showResult(rec) {
  store.markShown(rec.no);
  lastShown = rec;
  setPhase('result');
}

function turnByButton() {
  if (stage) stage.autoTurn();
  else doDraw();
}

async function doDraw() {
  if (phase !== 'ready') return;
  setPhase('busy');
  const prize = pickPrize(store.state.stock);
  if (!prize) { idle(); return; }
  let rec;
  try {
    rec = store.commitDraw(prize, entry || {});
  } catch (e) {
    console.error('[pick] 기록 실패', e);
    ui.toast('기록을 저장하지 못해서 뽑기를 멈췄어요');
    idle();
    return;
  }
  entry = null;
  if (stage) {
    try { await stage.playReveal(prize); } catch (e) { console.error('[pick] 연출 오류', e); }
    stage.setCapsuleCount(visibleCount());
  }
  showResult(rec);
}

store.onChange(() => {
  ui.renderStock();
  if (stage && phase !== 'busy') stage.setCapsuleCount(visibleCount());
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); ui.openPin(); return; }
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, .ov, .admin')) return; // 입력·오버레이·관리자에서는 기본 동작
  if (phase === 'ready') { e.preventDefault(); sfx.unlock(); turnByButton(); }
  else if (phase === 'result') { e.preventDefault(); next(); }
});

async function boot() {
  ui.renderTitle();
  ui.renderStock();
  setPhase('boot');
  try {
    const { createStage } = await import('./stage.js');
    stage = await createStage({
      canvas: document.getElementById('stage'),
      sfx,
      title: store.state.settings.title,
      prizes: Object.fromEntries(PRIZE_KEYS.map((k) => [k, { url: glbUrl(k), label: store.state.stock[k].label }])),
      onTurnComplete: doDraw,
    });
    stage.setCapsuleCount(visibleCount());
  } catch (e) {
    console.error('[pick] 3D 초기화 실패 — 2D 모드로 진행', e);
    stage = null;
    document.body.classList.add('no3d');
  }
  if (store.ignoredSeed) ui.toast('저장된 재고를 사용 중이에요 (주소의 수량은 무시했어요)', 4000);
  const pending = store.pendingDraw();
  if (pending) showResult(pending); // 연출 중 새로 고침 복구
  else idle();
}

boot();
```

- [ ] **Step 4: Jekyll 서버 띄우기**

Run (백그라운드): `bundle exec jekyll serve --port 4000`
Expected: `Server address: http://127.0.0.1:4000/`

- [ ] **Step 5: 렌더링 결과 확인**

Run:
```bash
curl -s http://127.0.0.1:4000/eunkk-pick/ | grep -E 'importmap|three.module|pick/main.js|robots'
curl -s http://127.0.0.1:4000/sitemap.xml | grep -c eunkk-pick
```
Expected: `/assets/vendor/three-0.185.1/three.module.min.js`, `/assets/js/pick/main.js`, `noindex, nofollow`가 보이고 Liquid 태그(`{{`)가 남아 있지 않다. 두 번째 명령은 `0`.

- [ ] **Step 6: 2D 모드 손 확인**

Chrome에서 `http://127.0.0.1:4000/eunkk-pick/?towel=3&cup=2&bag=1`을 연다.
Expected: 콘솔에 `[pick] 3D 초기화 실패 — 2D 모드로 진행`(이 단계에서는 정상). HUD 3/2/1 → "영수증 확인 완료" → "뽑기" → "○○ 당첨!" 카드 → 20초 뒤 또는 "다음 참가자"로 처음 화면. 새로 고쳐도 남은 수량이 유지된다. 확인 후 개발자 도구에서 `localStorage.removeItem('eunkk-pick-v1')`로 지운다.

- [ ] **Step 7: 커밋**

```bash
git add eunkk-pick/index.html assets/js/pick/ui.js assets/js/pick/main.js
git commit -m "[FEAT] 은크크 Pick 페이지·화면·상태 머신"
```

---

### Task 7: 3D 구성 요소 — 머신·캡슐·이펙트

**Files:**
- Create: `assets/js/pick/machine.js`
- Create: `assets/js/pick/capsules.js`
- Create: `assets/js/pick/fx.js`

- [ ] **Step 1: 머신**

`assets/js/pick/machine.js`:

```js
// 가챠 머신 — three 기본 도형만으로 만든다(외부 모델 없음)
import * as THREE from 'three';

export const COLORS = {
  green900: 0x0f3d24, green700: 0x1d6b3c, green500: 0x2f8f4e,
  yellow: 0xffe14d, cream: 0xf6f1e3, pink: 0xf4a6c0, orange: 0xf39a52, ink: 0x14231a,
};

// 머신 로컬 좌표(머신 그룹은 원점에 둔다)
export const DOME = { center: new THREE.Vector3(0, 2.15, 0), radius: 1.0 };
export const HANDLE_POS = new THREE.Vector3(0.42, 0.48, 0.74);
export const EXIT_POS = new THREE.Vector3(-0.42, 0.44, 0.73);
export const TRAY_POS = new THREE.Vector3(-0.42, 0.14, 0.95);

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

// 모서리가 둥근 상자(가운데 정렬). 베벨이 바깥으로 붙으므로 그만큼 빼고 만든다.
function roundedBox(w, h, d, r) {
  const bevel = Math.min(r, d / 4);
  const g = new THREE.ExtrudeGeometry(
    roundedRectShape(w - 2 * bevel, h - 2 * bevel, Math.max(0.001, r - bevel)),
    { depth: d - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 },
  );
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
}

function textTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildMachine(scene, { title = '은크크 Pick' } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...extra });

  // 받침
  const base = new THREE.Mesh(roundedBox(1.7, 1.15, 1.45, 0.16), std(COLORS.green700));
  base.position.y = 0.575;
  group.add(base);

  // 받침 위 테두리
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.86, 0.14, 48), std(COLORS.yellow, { roughness: 0.35 }));
  collar.position.y = 1.22;
  group.add(collar);

  // 유리 돔 + 뚜껑
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME.radius, 64, 48),
    new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, shininess: 140, specular: 0xffffff, depthWrite: false }),
  );
  dome.position.copy(DOME.center);
  dome.renderOrder = 2;
  group.add(dome);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.16, 32), std(COLORS.yellow, { roughness: 0.35 }));
  cap.position.y = DOME.center.y + DOME.radius + 0.02;
  group.add(cap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), std(COLORS.pink, { roughness: 0.3 }));
  knob.position.y = cap.position.y + 0.14;
  group.add(knob);

  // 앞면 로고 판
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.32),
    new THREE.MeshBasicMaterial({
      map: textTexture(1000, 256, (g, w, h) => {
        g.fillStyle = '#f6f1e3';
        g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 60); g.fill();
        g.fillStyle = '#1d6b3c';
        g.font = '700 150px ChaiHwaljjak, "Malgun Gothic", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(title, w / 2, h / 2 + 8);
      }),
      transparent: true,
    }),
  );
  logo.position.set(0, 0.9, 0.726);
  group.add(logo);

  // 손잡이(시계 방향으로 돈다) — 받침판 + 회전하는 원판·막대
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 48), std(COLORS.green900));
  bezel.rotation.x = Math.PI / 2;
  bezel.position.copy(HANDLE_POS).setZ(HANDLE_POS.z - 0.01);
  group.add(bezel);
  const handle = new THREE.Group();
  handle.position.copy(HANDLE_POS);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 40), std(COLORS.yellow, { roughness: 0.3 }));
  disc.rotation.x = Math.PI / 2;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.07), std(COLORS.cream, { roughness: 0.3 }));
  bar.position.z = 0.05;
  handle.add(disc, bar);
  group.add(handle);

  // 손잡이 안내 링(READY에서 깜빡임)
  const hintRing = new THREE.Mesh(
    new THREE.RingGeometry(0.31, 0.36, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.yellow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  hintRing.position.copy(HANDLE_POS).setZ(HANDLE_POS.z + 0.03);
  hintRing.visible = false;
  group.add(hintRing);

  // 배출구 + 위쪽 경첩으로 열리는 덮개
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), new THREE.MeshBasicMaterial({ color: COLORS.ink }));
  hole.position.copy(EXIT_POS);
  group.add(hole);
  const flapPivot = new THREE.Group();
  flapPivot.position.set(EXIT_POS.x, EXIT_POS.y + 0.17, EXIT_POS.z + 0.01);
  const flap = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), std(COLORS.pink, { transparent: true, opacity: 0.85 }));
  flap.position.y = -0.17;
  flapPivot.add(flap);
  group.add(flapPivot);

  // 받침 트레이
  const trayMat = std(COLORS.cream, { roughness: 0.4 });
  const trayBottom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), trayMat);
  trayBottom.position.copy(TRAY_POS);
  const trayLip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.04), trayMat);
  trayLip.position.set(TRAY_POS.x, TRAY_POS.y + 0.05, TRAY_POS.z + 0.17);
  group.add(trayBottom, trayLip);

  // 바닥 그림자(그림자 맵 대신 블롭 텍스처)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({
      map: textTexture(256, 256, (g, w) => {
        const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        gr.addColorStop(0, 'rgba(5,25,14,0.55)');
        gr.addColorStop(1, 'rgba(5,25,14,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
      }),
      transparent: true, depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);

  return {
    group,
    handle,
    hintRing,
    setFlap(open) { flapPivot.rotation.x = -open * 1.2; },
  };
}
```

좌표 메모: 머신 그룹은 원점, 받침 높이 1.15, 돔 중심 (0, 2.15, 0) 반지름 1. 손잡이·배출구·트레이 위치는 `HANDLE_POS`·`EXIT_POS`·`TRAY_POS` 상수 하나로 관리한다.

- [ ] **Step 2: 캡슐**

`assets/js/pick/capsules.js`:

```js
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
```

메모: 캡슐 색은 경품과 무관하게 무작위다. `setCount`는 처음이거나 차이가 12개를 넘으면 새로 채우고, 그 밖에는 위에서 떨어뜨리거나 맨 위부터 뺀다.

- [ ] **Step 3: 이펙트**

`assets/js/pick/fx.js`:

```js
// 개봉 이펙트 — 후처리 없이 가산 혼합 스프라이트·인스턴스로
import * as THREE from 'three';

export const FX_COLORS = [0xffe14d, 0xf4a6c0, 0xf39a52, 0x2f8f4e, 0xf6f1e3];
const CONFETTI = 300;
const SPARKLES = 40;

const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  return canvasTexture(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(0.25, 'rgba(255,240,170,0.8)');
    gr.addColorStop(1, 'rgba(255,225,77,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

function raysTexture() {
  return canvasTexture(512, (g, s) => {
    g.translate(s / 2, s / 2);
    const n = 14;
    for (let i = 0; i < n; i++) {
      g.rotate((Math.PI * 2) / n);
      const gr = g.createLinearGradient(0, 0, s / 2, 0);
      gr.addColorStop(0, 'rgba(255,240,180,0.9)');
      gr.addColorStop(1, 'rgba(255,225,77,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(s / 2, -s * 0.06);
      g.lineTo(s / 2, s * 0.06);
      g.closePath();
      g.fill();
    }
  });
}

export function createFx(scene) {
  const additive = (map) => new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = glowTexture();
  const flash = new THREE.Sprite(additive(glow));
  const rays = new THREE.Sprite(additive(raysTexture()));
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.62, 64),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );

  // 색종이
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.085), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < CONFETTI; i++) confetti.setColorAt(i, col.setHex(FX_COLORS[i % FX_COLORS.length]));
  confetti.count = 0;
  const bits = Array.from({ length: CONFETTI }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }));

  // 경품 주변 반짝이
  const sPos = new Float32Array(SPARKLES * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const sparkles = new THREE.Points(sGeo, new THREE.PointsMaterial({ map: glow, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparkles.frustumCulled = false;
  const seeds = Array.from({ length: SPARKLES }, () => ({ a: Math.random() * Math.PI * 2, rad: 0.45 + Math.random() * 0.35, y: (Math.random() * 2 - 1) * 0.45, sp: 0.4 + Math.random() * 0.8 }));

  const parts = [flash, rays, halo, confetti, sparkles];
  parts.forEach((o) => { o.visible = false; scene.add(o); });

  let time = 0, since = 0, active = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0);

  return {
    burst(pos) {
      active = true;
      since = 0;
      flash.position.copy(pos);
      rays.position.copy(pos).setZ(pos.z - 0.35); // 경품 뒤
      halo.position.copy(pos).setZ(pos.z - 0.3);
      sparkles.position.copy(pos);
      for (const b of bits) {
        const a = Math.random() * Math.PI * 2, up = 2.2 + Math.random() * 2.6, out = 0.8 + Math.random() * 2.2;
        b.p.copy(pos);
        b.v.set(Math.cos(a) * out, up, Math.sin(a) * out * 0.4); // 카메라 쪽으로 덜 튀게
        b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        b.w.set((Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 10);
        b.life = 2.6 + Math.random() * 0.8;
      }
      confetti.count = CONFETTI;
      parts.forEach((o) => { o.visible = true; });
    },
    clear() {
      active = false;
      confetti.count = 0;
      parts.forEach((o) => { o.visible = false; });
    },
    update(dt) {
      time += dt;
      if (!active) return;
      since += dt;
      // 섬광: 0.35초 동안 커지며 사라짐
      const f = Math.min(1, since / 0.35);
      flash.material.opacity = 1 - f;
      flash.scale.setScalar(0.3 + f * 3.6);
      // 빛줄기·후광: 0.5초에 걸쳐 나타난 뒤 유지, 천천히 회전
      const k = Math.min(1, since / 0.5);
      rays.material.opacity = 0.75 * k;
      rays.scale.setScalar(3.4 * easeOutBack(k));
      rays.material.rotation += dt * 0.35;
      halo.material.opacity = 0.6 * k;
      halo.scale.setScalar(0.6 + 0.4 * k + Math.sin(time * 3) * 0.03);
      // 반짝이
      sparkles.material.opacity = Math.min(1, since / 0.6);
      for (let i = 0; i < SPARKLES; i++) {
        const s = seeds[i], a = s.a + time * s.sp;
        sPos[i * 3] = Math.cos(a) * s.rad;
        sPos[i * 3 + 1] = s.y + Math.sin(time * 2 + i) * 0.05;
        sPos[i * 3 + 2] = Math.sin(a) * s.rad * 0.5;
      }
      sGeo.attributes.position.needsUpdate = true;
      // 색종이
      for (let i = 0; i < CONFETTI; i++) {
        const b = bits[i];
        if (b.life > 0) {
          b.life -= dt;
          b.v.y -= 3.2 * dt;
          b.v.multiplyScalar(1 - 1.2 * dt);
          b.p.addScaledVector(b.v, dt);
          b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt;
        }
        q.setFromEuler(b.r);
        m.compose(b.p, q, b.life > 0 ? one : none);
        confetti.setMatrixAt(i, m);
      }
      confetti.instanceMatrix.needsUpdate = true;
    },
  };
}
```

- [ ] **Step 4: 커밋**

```bash
git add assets/js/pick/machine.js assets/js/pick/capsules.js assets/js/pick/fx.js
git commit -m "[FEAT] 은크크 Pick 가챠 머신·캡슐·이펙트"
```

---

### Task 8: 3D 무대 `stage.js`

**Files:**
- Create: `assets/js/pick/stage.js`

- [ ] **Step 1: 구현**

`assets/js/pick/stage.js`:

```js
// 3D 무대 — 렌더러·카메라, 손잡이 입력, 배출·개봉 연출, 경품 메시
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildMachine, DOME, HANDLE_POS, EXIT_POS, TRAY_POS } from './machine.js';
import { createCapsules, capsuleGeometries, CAPSULE_COLORS } from './capsules.js';
import { createFx } from './fx.js';

export const SHOWCASE = new THREE.Vector3(0, 1.7, 3.2);
// 머신(높이 약 3.35)이 화면 위쪽 ~65%에 들어오고 아래쪽은 버튼·결과 카드 자리로 비운다
const CAMERA_POS = new THREE.Vector3(0, 1.9, 8.3);
const CAMERA_TARGET = new THREE.Vector3(0, 1.05, 0);
const PRIZE_SIZE = 0.95;
const TURN = Math.PI * 2;
const TICK = Math.PI / 4;
// Meshy 모델 방향 보정(라디안). GLB를 받은 뒤 화면을 보며 맞춘다.
export const PRIZE_TUNE = { towel: { rotX: 0, rotY: 0 }, cup: { rotX: 0, rotY: 0 }, bag: { rotX: 0, rotY: 0 } };

const lerp = (a, b, t) => a + (b - a) * t;
const easeInQuad = (x) => x * x;
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

// 크기·중심을 맞춘 홀더 그룹으로 감싼다(홀더를 돌리고 움직인다)
function normalizePrize(obj, tune) {
  const pivot = new THREE.Group();
  pivot.add(obj);
  pivot.rotation.set(tune.rotX, tune.rotY, 0);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = PRIZE_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
  pivot.scale.setScalar(s);
  pivot.position.copy(center).multiplyScalar(-s);
  const holder = new THREE.Group();
  holder.add(pivot);
  return holder;
}

// GLB가 없거나 깨졌을 때: 경품 이름 카드
function prizeCard(label) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f1e3';
  g.beginPath(); g.roundRect(6, 6, 500, 308, 48); g.fill();
  g.fillStyle = '#1d6b3c';
  g.font = '700 120px ChaiHwaljjak, "Malgun Gothic", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 256, 170);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const holder = new THREE.Group();
  holder.add(new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })));
  return holder;
}

async function loadPrizes(scene, prizes) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  await Promise.all(Object.entries(prizes).map(async ([key, { url, label }]) => {
    let holder;
    try {
      const gltf = await loader.loadAsync(url);
      holder = normalizePrize(gltf.scene, PRIZE_TUNE[key] || { rotX: 0, rotY: 0 });
    } catch (e) {
      console.warn(`[pick] ${key} GLB를 불러오지 못해 이름 카드로 대체`, e);
      holder = prizeCard(label);
    }
    holder.visible = false;
    scene.add(holder);
    out[key] = holder;
  }));
  return out;
}

export async function createStage({ canvas, sfx, prizes, title, onTurnComplete }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); // WebGL 불가 시 여기서 throw
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1d6b3c, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 5);
  const rim = new THREE.DirectionalLight(0xffe14d, 0.8);
  rim.position.set(-4, 3, -3);
  scene.add(key, rim);

  await document.fonts.load('700 80px ChaiHwaljjak').catch(() => {});
  const machine = buildMachine(scene, { title });
  const capsules = createCapsules(scene, { center: DOME.center, radius: DOME.radius });
  const fx = createFx(scene);

  // 쇼케이스 뒤 배경을 어둡게 하는 판
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshBasicMaterial({ color: 0x06180d, transparent: true, opacity: 0, depthWrite: false }));
  dim.position.set(0, 1.5, 2.4);
  dim.visible = false;
  scene.add(dim);

  // 배출되는 캡슐(반으로 갈라지는 히어로)
  const capGeo = capsuleGeometries();
  const heroTopMat = new THREE.MeshStandardMaterial({ color: CAPSULE_COLORS[0], roughness: 0.25, transparent: true });
  const heroBottomMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e3, roughness: 0.4, transparent: true });
  const hero = new THREE.Group();
  const heroTop = new THREE.Mesh(capGeo.top, heroTopMat);
  const heroBottom = new THREE.Mesh(capGeo.bottom, heroBottomMat);
  hero.add(heroTop, heroBottom);
  hero.visible = false;
  scene.add(hero);

  const prizeObjs = await loadPrizes(scene, prizes);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 16:9보다 좁으면 뒤로 물러나 머신이 잘리지 않게
    const back = Math.max(1, 1.5 / camera.aspect);
    camera.position.copy(CAMERA_POS).setZ(CAMERA_POS.z * back);
    camera.lookAt(CAMERA_TARGET);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- 트윈 ----
  const tweens = new Set();
  const tween = (duration, fn, ease = (x) => x) => new Promise((resolve) => tweens.add({ t: 0, duration, fn, ease, resolve }));
  const wait = (s) => tween(s, () => {});

  // ---- 손잡이 ----
  let mode = 'idle'; // idle | ready | busy
  let turn = 0, nextTick = TICK, auto = false, dragging = false, lastAngle = 0, shake = 0;
  let revealed = null, idleStir = 0, time = 0;
  const handleWorld = new THREE.Vector3();

  function angleAt(e) {
    machine.handle.getWorldPosition(handleWorld);
    const v = handleWorld.project(camera);
    const rect = canvas.getBoundingClientRect();
    const sx = rect.left + ((v.x + 1) / 2) * rect.width;
    const sy = rect.top + ((1 - v.y) / 2) * rect.height;
    return Math.atan2(e.clientY - sy, e.clientX - sx); // 화면 좌표(y 아래)라 시계 방향이 +
  }

  function addTurn(d) {
    if (mode !== 'ready' || d <= 0) return;
    turn = Math.min(TURN, turn + d);
    machine.handle.rotation.z = -turn;
    while (turn >= nextTick) {
      nextTick += TICK;
      sfx.click();
      capsules.stir();
      shake = 1;
    }
    if (turn >= TURN) {
      mode = 'busy';
      auto = false;
      dragging = false;
      machine.hintRing.visible = false;
      onTurnComplete();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'ready') return;
    sfx.unlock();
    dragging = true;
    lastAngle = angleAt(e);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const a = angleAt(e);
    let d = a - lastAngle;
    if (d > Math.PI) d -= TURN;
    if (d < -Math.PI) d += TURN;
    lastAngle = a;
    addTurn(Math.min(d, 0.6)); // 역방향은 무시, 순간 점프는 제한
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  // 트랙패드 두 손가락 스크롤로도 돌린다(방향 무관)
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'ready') return;
    sfx.unlock();
    addTurn(Math.min(Math.abs(e.deltaY) * 0.003, 0.5));
  }, { passive: true });

  // ---- 연출 ----
  async function playReveal(prizeKey) {
    mode = 'busy';
    const r = capsules.radius;
    const bottomPt = DOME.center.clone().setY(DOME.center.y - DOME.radius);
    const body = capsules.takeNearest(bottomPt.x, bottomPt.y, bottomPt.z);
    const start = body ? new THREE.Vector3(body.x, body.y, body.z) : bottomPt.clone().setY(bottomPt.y + r);
    heroTopMat.color.setHex(CAPSULE_COLORS[body ? body.color : 0]);
    heroTopMat.opacity = heroBottomMat.opacity = 1;
    heroTop.position.set(0, 0, 0); heroTop.rotation.set(0, 0, 0);
    heroBottom.position.set(0, 0, 0); heroBottom.rotation.set(0, 0, 0);
    if (body) hero.quaternion.set(body.qx, body.qy, body.qz, body.qw); else hero.quaternion.identity();
    hero.position.copy(start);
    hero.scale.setScalar(r);
    hero.visible = true;

    // 1) 돔 → 받침 속 → 배출구 → 트레이
    const restY = TRAY_POS.y + 0.03 + r;
    const path = new THREE.CatmullRomCurve3([
      start,
      new THREE.Vector3(start.x * 0.5 - 0.2, 1.0, 0.1),
      new THREE.Vector3(EXIT_POS.x, EXIT_POS.y + 0.05, 0.45),
      new THREE.Vector3(EXIT_POS.x, EXIT_POS.y, EXIT_POS.z + 0.05),
      new THREE.Vector3(TRAY_POS.x, restY, TRAY_POS.z),
    ]);
    sfx.roll(1.3);
    tween(0.25, (t) => machine.setFlap(t));
    await tween(1.3, (t, dt) => { hero.position.copy(path.getPoint(t)); hero.rotateX(dt * 9); }, easeInQuad);
    sfx.thunk();
    tween(0.3, (t) => machine.setFlap(1 - t));
    await tween(0.35, (t) => { hero.position.y = restY + Math.abs(Math.sin(t * Math.PI * 2)) * 0.08 * (1 - t); });
    await wait(0.25);

    // 2) 트레이 → 쇼케이스(크게), 배경 어둡게
    const from = hero.position.clone();
    const lift = new THREE.CatmullRomCurve3([from, new THREE.Vector3(from.x * 0.5, 1.2, 1.8), SHOWCASE.clone()]);
    const q0 = hero.quaternion.clone(), qUp = new THREE.Quaternion();
    dim.visible = true;
    await tween(0.9, (t) => {
      hero.position.copy(lift.getPoint(t));
      hero.scale.setScalar(lerp(r, 0.36, t));
      hero.quaternion.slerpQuaternions(q0, qUp, t); // 색 반구가 위로 오게 세운다
      dim.material.opacity = 0.55 * t;
    }, easeInOutCubic);

    // 3) 흔들기(점점 세게)
    let tickAcc = 0;
    await tween(1.1, (t, dt) => {
      hero.rotation.set(0, 0, Math.sin(t * 40) * 0.2 * t);
      tickAcc += dt;
      if (tickAcc > 0.11) { tickAcc = 0; sfx.tick(); }
    });

    // 4) 개봉: 반구가 갈라지고 경품 등장
    sfx.pop();
    sfx.fanfare();
    fx.burst(SHOWCASE);
    const prize = prizeObjs[prizeKey];
    prize.position.copy(SHOWCASE);
    prize.rotation.set(0, 0, 0);
    prize.scale.setScalar(0.001);
    prize.visible = true;
    revealed = prize;
    tween(0.6, (t) => prize.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    await tween(0.7, (t) => {
      heroTop.position.set(-1.5 * t, 2.2 * t, 0.5 * t);
      heroTop.rotation.z = 1.2 * t;
      heroBottom.position.set(1.4 * t, -2.0 * t, 0.5 * t);
      heroBottom.rotation.z = -1.0 * t;
      heroTopMat.opacity = heroBottomMat.opacity = 1 - t;
    });
    hero.visible = false;
  }

  function clearReveal() {
    fx.clear();
    hero.visible = false;
    dim.visible = false;
    dim.material.opacity = 0;
    if (revealed) revealed.visible = false;
    revealed = null;
  }

  function setMode(m) {
    mode = m;
    if (m === 'ready') {
      turn = 0;
      nextTick = TICK;
      machine.handle.rotation.z = 0;
    }
    machine.hintRing.visible = m === 'ready';
    if (m !== 'ready') { auto = false; dragging = false; }
  }

  // ---- 루프 ----
  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    time += dt;
    for (const tw of [...tweens]) {
      tw.t = Math.min(tw.duration, tw.t + dt);
      tw.fn(tw.ease(tw.t / tw.duration), dt);
      if (tw.t >= tw.duration) { tweens.delete(tw); tw.resolve(); }
    }
    if (auto) addTurn((dt * TURN) / 1.3);
    if (mode !== 'busy') {
      idleStir += dt;
      if (idleStir > 5) { idleStir = 0; capsules.stir(0.06); } // 대기 중 가볍게 출렁
    }
    capsules.update(dt);
    fx.update(dt);
    if (machine.hintRing.visible) machine.hintRing.material.opacity = 0.35 + 0.35 * Math.sin(time * 5);
    shake = Math.max(0, shake - dt * 6);
    machine.group.position.x = (Math.random() - 0.5) * 0.03 * shake;
    machine.group.rotation.z = (Math.random() - 0.5) * 0.01 * shake;
    if (revealed) {
      revealed.rotation.y += dt * 0.9;
      revealed.position.y = SHOWCASE.y + Math.sin(time * 2) * 0.03;
    }
    renderer.render(scene, camera);
  });

  return {
    setMode,
    autoTurn() { if (mode === 'ready') { sfx.unlock(); auto = true; } },
    playReveal,
    clearReveal,
    setCapsuleCount(n) { capsules.setCount(n); },
    get mode() { return mode; },
  };
}
```

연출 순서(약 5초): 손잡이 1바퀴 → (`main.js`가 결과 저장) → 돔 바닥에서 가장 가까운 캡슐이 받침 속을 지나 배출구 → 트레이(1.3초) → 쇼케이스로 들어 올리며 배경 어둡게(0.9초) → 흔들기(1.1초) → 개봉: 섬광·빛줄기·후광·색종이 + 경품 등장.

입력: READY에서 캔버스 아무 데나 드래그하면 손잡이 화면 위치를 중심으로 각도를 잰다(시계 방향만 누적). 트랙패드 스크롤도 돌린다. 스페이스·엔터·"대신 돌려 주기"는 1.3초 자동 회전.

- [ ] **Step 2: 브라우저에서 3D 확인**

Chrome에서 `http://127.0.0.1:4000/eunkk-pick/?towel=30&cup=20&bag=25`를 연다(이전 기록이 있으면 `localStorage.removeItem('eunkk-pick-v1')` 후 다시).
Expected: 콘솔 오류 없음(GLB가 아직 없어 `[pick] towel GLB를 불러오지 못해 이름 카드로 대체` 경고 3개와 404는 정상). 돔에 캡슐 75개, 손잡이를 드래그하면 45°마다 딸깍하며 캡슐이 들썩임, 1바퀴에 배출 → 개봉 → 이름 카드 + 이펙트.

- [ ] **Step 3: 커밋**

```bash
git add assets/js/pick/stage.js
git commit -m "[FEAT] 은크크 Pick 3D 무대와 뽑기 연출"
```

---

### Task 9: 헤드리스 Chrome 검증

**Files (저장소 밖):**
- Create: `$SCRATCH/pick-verify/verify.mjs`
- Create: `$SCRATCH/pick-verify/preview.mjs`

- [ ] **Step 1: 도구 설치**

```bash
mkdir -p "$SCRATCH/pick-verify" && cd "$SCRATCH/pick-verify" && npm init -y >/dev/null && npm i playwright-core@1
```

- [ ] **Step 2: 검증 스크립트**

`$SCRATCH/pick-verify/verify.mjs`:

```js
// node verify.mjs [BASE] — 은크크 Pick 페이지 헤드리스 검증 (스크린샷: ./shots)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:4000';
const URL0 = `${BASE}/eunkk-pick/`;
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'ok   - ' : 'FAIL - ') + msg); if (!cond) failed++; };

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource.*404|\/glb\/pick\//.test(t)) return; // GLB 미배치 시 404는 예상됨
    errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: OUT + name + '.png' });
const visible = (page, sel) => page.locator(sel).isVisible();
const stockNums = (page) => page.$$eval('#stock .num', (els) => els.map((e) => +e.textContent));

// 1) 처음 열기: URL 파라미터로 재고
const A = await newPage();
await A.page.goto(URL0 + '?towel=30&cup=20&bag=25');
await A.page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
check(!(await A.page.evaluate(() => document.body.classList.contains('no3d'))), '3D 모드로 부팅');
check(JSON.stringify(await stockNums(A.page)) === '[30,20,25]', 'HUD 재고 30/20/25');
check(await visible(A.page, '#action'), 'LOCKED: 하단 버튼 표시');
await A.page.waitForTimeout(800);
await shot(A.page, '01-locked');

// 2) 영수증 확인 → READY → 스크롤로 조금 돌린 뒤 스페이스로 자동 돌리기
await A.page.click('#primaryBtn');
check((await A.page.textContent('#primaryBtn')).includes('돌려'), 'READY: 대신 돌려 주기 버튼');
await A.page.mouse.move(960, 540);
for (let i = 0; i < 6; i++) { await A.page.mouse.wheel(0, 120); await A.page.waitForTimeout(30); }
await shot(A.page, '02-ready');
await A.page.keyboard.press('Space');
await A.page.waitForTimeout(5200);
await shot(A.page, '03-open');
await A.page.waitForSelector('#result', { state: 'visible', timeout: 20000 });
await A.page.waitForTimeout(600);
await shot(A.page, '04-result');
const left1 = (await stockNums(A.page)).reduce((a, b) => a + b, 0);
check(left1 === 74, '뽑은 뒤 재고 합 74');
const saved = await A.page.evaluate(() => JSON.parse(localStorage.getItem('eunkk-pick-v1')));
check(saved.draws.length === 1 && saved.draws[0].shown === true, '기록 1건, shown=true');

// 3) 새로 고침: 재고 유지 + 파라미터 무시 안내
await A.page.reload();
await A.page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
check((await stockNums(A.page)).reduce((a, b) => a + b, 0) === 74, '새로 고침 후 재고 유지');
check(await visible(A.page, '#toast'), '저장된 재고 사용 안내 토스트');

// 4) 관리자: PIN → 휴대폰 수집 켜기
await A.page.keyboard.press('Control+Shift+A');
await A.page.fill('#pinInput', '1234');
await A.page.keyboard.press('Enter');
check((await A.page.textContent('#pinErr')).length > 0, '틀린 PIN 거부');
await A.page.fill('#pinInput', '0000');
await A.page.keyboard.press('Enter');
check(await visible(A.page, '#admin'), '관리자 패널 열림');
await A.page.check('#fPhone');
await A.page.click('#adminSave');
check((await A.page.textContent('#adminErr')).includes('수집 주체'), '동의 문구 없이 수집 켜기 거부');
await A.page.fill('#cOrg', '서울청년센터 은평');
await A.page.fill('#cPurpose', '경품 지급 확인');
await A.page.fill('#cRetention', '행사 종료 후 30일 이내 파기');
await A.page.click('#adminSave');
await shot(A.page, '05-admin');
await A.page.click('#adminClose');

// 5) 정보 입력
await A.page.click('#primaryBtn');
check(await visible(A.page, '#entryOv'), '참가하기 → 정보 입력');
await A.page.fill('input[name=phone]', '01012345678');
check((await A.page.textContent('.mask-hint')) === '끝자리 5678', '휴대폰 끝자리만 표시');
await A.page.click('#entrySubmit');
check((await A.page.textContent('.err[data-err=consent]')).length > 0, '동의 없이 제출 거부');
await shot(A.page, '06-entry');
await A.page.check('#consentChk');
await A.page.click('#entrySubmit');
check(!(await visible(A.page, '#entryOv')), '동의 후 READY');
await A.page.keyboard.press('Space');
await A.page.waitForSelector('#result', { state: 'visible', timeout: 20000 });
const saved2 = await A.page.evaluate(() => JSON.parse(localStorage.getItem('eunkk-pick-v1')));
check(saved2.draws[1].phone === '010-1234-5678', '기록에 휴대폰 저장');
await A.page.keyboard.press('Enter');
check(await visible(A.page, '#action'), '엔터로 다음 참가자');

// 6) 소진
await A.page.keyboard.press('Control+Shift+A');
await A.page.fill('#pinInput', '0000');
await A.page.keyboard.press('Enter');
for (const inp of await A.page.$$('#stockEdit input[data-f=left]')) await inp.fill('0');
await A.page.click('#adminSave');
await A.page.click('#adminClose');
check(await visible(A.page, '#soldoutOv'), '남은 수량 0 → 소진 화면');
await shot(A.page, '07-soldout');

// 7) 연출 중 새로 고침 복구: shown=false 기록을 심고 다시 열기
await A.page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('eunkk-pick-v1'));
  s.stock.cup.left = 3;
  s.draws.push({ no: 99, at: '2026-11-21T12:00:00+09:00', prize: 'cup', name: '', phone: '', birth: '', shown: false });
  localStorage.setItem('eunkk-pick-v1', JSON.stringify(s));
});
await A.page.reload();
await A.page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
check(await visible(A.page, '#result'), '미표시 결과 복구');
check((await A.page.textContent('#resultName')) === '컵', '복구된 결과: 컵');
check(A.errors.length === 0, '콘솔 오류 없음' + (A.errors.length ? ': ' + A.errors.join(' | ') : ''));
await A.ctx.close();

// 8) 저장본·파라미터 없음 → 재고 입력 안내
const B = await newPage();
await B.page.goto(URL0);
await B.page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
check(await visible(B.page, '#setupOv'), '재고 없음 → 설정 안내');
check(B.errors.length === 0, '콘솔 오류 없음(설정 화면)');
await B.ctx.close();

await browser.close();
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exitCode = failed ? 1 : 0;
```

`$SCRATCH/pick-verify/preview.mjs`(경품별 등장 화면, Task 10에서 사용):

```js
// node preview.mjs [BASE] — 경품별 등장 화면 스크린샷 (GLB 방향·크기 확인용, ./shots/prize-*.png)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:4000';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
for (const k of ['towel', 'cup', 'bag']) {
  // 재고를 한 경품만 1개로 두면 그 경품이 나온다(새 컨텍스트 = 빈 localStorage)
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log(`[${k}] ${m.text()}`); });
  await page.goto(`${BASE}/eunkk-pick/?${k}=1`);
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
  await page.click('#primaryBtn');
  await page.keyboard.press('Space');
  await page.waitForSelector('#result', { state: 'visible', timeout: 20000 });
  for (const [i, ms] of [[1, 300], [2, 1200]]) {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${OUT}prize-${k}-${i}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log('saved', OUT);
```

- [ ] **Step 3: 실행**

Jekyll 서버(Task 6 Step 4)가 떠 있는 상태에서:

Run: `cd "$SCRATCH/pick-verify" && node verify.mjs http://127.0.0.1:4000`
Expected: `ok` 23줄 + `전부 통과`. 스크린샷 `shots/01-locked.png` … `07-soldout.png`.

- [ ] **Step 4: 스크린샷 눈으로 확인**

- `01-locked`/`02-ready`: 머신이 화면 위쪽 약 65% 안에 있고 하단 안내·버튼이 손잡이·트레이를 가리지 않는다. READY에서 손잡이 둘레 링이 깜빡인다.
- `03-open`: 배경이 어두워지고 캡슐이 앞으로 크게 나와 열리는 중.
- `04-result`: 빛줄기·색종이, 경품(이름 카드)이 결과 카드 위쪽에 보인다.
- `05-admin`, `06-entry`, `07-soldout`: 글자가 잘리거나 겹치지 않는다.

문제가 있으면 고치고 다시 돌린 뒤, 바뀐 파일만 커밋한다(`[FIX] 은크크 Pick …`).

---

### Task 10: 경품 GLB 최적화·적용 (사용자 GLB 도착 후, 목표 11/18 수)

**Files:**
- Create: `assets/glb/pick/towel.glb`, `assets/glb/pick/cup.glb`, `assets/glb/pick/bag.glb`
- Modify: `assets/js/pick/stage.js` (`PRIZE_TUNE`만)

- [ ] **Step 1: 작업 폴더 준비**

Windows에서 gltf-transform 텍스처 명령이 sharp 이중 설치로 실패하므로 버전을 하나로 고정한 전용 폴더를 쓴다.

```bash
mkdir -p "$SCRATCH/pick-glb/in" "$SCRATCH/pick-glb/out" && cd "$SCRATCH/pick-glb"
cat > package.json <<'JSON'
{ "name": "pick-glb", "private": true,
  "dependencies": { "@gltf-transform/cli": "4.4.2", "sharp": "0.35.3", "meshoptimizer": "1.2.0" },
  "overrides": { "sharp": "$sharp" } }
JSON
npm i
```

사용자가 준 Meshy GLB를 `in/towel.glb`, `in/cup.glb`, `in/bag.glb`로 복사한다.

- [ ] **Step 2: 원본 확인**

Run: `for k in towel cup bag; do echo "== $k"; npx gltf-transform inspect in/$k.glb | grep -iE 'render|tri|vertices|size|image/' ; done`
삼각형 수 `N`을 적어 두고 경품별 `ratio = min(1, 20000 / N)`을 정한다.

- [ ] **Step 3: 최적화**

```bash
for k in towel cup bag; do
  RATIO=0.25   # Step 2에서 정한 값으로 경품별 지정
  npx gltf-transform simplify in/$k.glb out/$k.s.glb --ratio $RATIO --error 0.002
  npx gltf-transform resize out/$k.s.glb out/$k.r.glb --width 1024 --height 1024
  npx gltf-transform webp out/$k.r.glb out/$k.w.glb
  npx gltf-transform meshopt out/$k.w.glb out/$k.glb
done
ls -la out/towel.glb out/cup.glb out/bag.glb
```
Expected: 각 1MB 이하. 넘으면 `resize`를 512로 다시. `webp`가 `colourspace` 오류를 내면 `npm ls sharp`로 sharp가 하나뿐인지 확인한다.

- [ ] **Step 4: 저장소에 배치**

```bash
mkdir -p /e/project/dev-blog/assets/glb/pick
cp out/towel.glb out/cup.glb out/bag.glb /e/project/dev-blog/assets/glb/pick/
```

- [ ] **Step 5: 방향·크기 확인과 보정**

Run: `cd "$SCRATCH/pick-verify" && node preview.mjs http://127.0.0.1:4000`
`shots/prize-{towel,cup,bag}-{1,2}.png`를 본다. 경품 GLB 로드 실패 경고가 없어야 한다. 누워 있거나 뒤집혀 있으면 `assets/js/pick/stage.js`의 `PRIZE_TUNE`만 고친다(예: 컵이 옆으로 누우면 `cup: { rotX: -Math.PI / 2, rotY: 0 }`). 고칠 때마다 `preview.mjs`를 다시 돌린다. 크기는 `PRIZE_SIZE`(0.95)가 전체 경품에 공통이다.

- [ ] **Step 6: 회귀 확인**

Run: `node verify.mjs http://127.0.0.1:4000`
Expected: `전부 통과`

- [ ] **Step 7: 커밋**

```bash
cd /e/project/dev-blog
git add assets/glb/pick/towel.glb assets/glb/pick/cup.glb assets/glb/pick/bag.glb assets/js/pick/stage.js
git commit -m "[ASSET] 은크크 Pick 경품 메시(수건·컵·장바구니)"
```

---

### Task 11: 배포와 리허설 (11/20 금)

- [ ] **Step 1: 최종 테스트**

Run: `node scripts/pick-test.mjs` → `27 passed`, `node "$SCRATCH/pick-verify/verify.mjs" http://127.0.0.1:4000` → `전부 통과`

- [ ] **Step 2: main에 병합하고 푸시 (사용자 확인 후에만)**

```bash
git checkout main
git pull --rebase
git merge --no-ff feature/eunkk-pick -m "Merge branch 'feature/eunkk-pick'"
gh auth switch -u keemminxu
git push origin main
gh auth switch -u keemminxutcl
```
GitHub Pages 빌드가 끝나면 `https://keemminxu.com/eunkk-pick/`이 열리는지 확인한다.

- [ ] **Step 3: 실제 노트북 + TV 리허설 체크리스트**

- 행사용 노트북 Chrome에서 `https://keemminxu.com/eunkk-pick/?towel=<수량>&cup=<수량>&bag=<수량>`를 처음 연다(실제 수량으로).
- 관리자(`Ctrl+Shift+A` 또는 오른쪽 아래 톱니, PIN `0000`) → **PIN 변경**, 수집 항목과 동의 문구 확인(센터 확인 결과 반영), 효과음 켜기.
- TV 미러링 상태에서 확인: 글자 크기, 머신이 화면에 다 들어오는지, 효과음 크기, 트랙패드 드래그·스크롤로 손잡이 돌리기.
- 테스트 뽑기 1회 → 관리자 "마지막 뽑기 취소"로 재고 복구.
- 새로 고침해도 재고가 유지되는지, CSV 내보내기가 엑셀에서 한글 깨짐 없이 열리는지.
- 현장 와이파이가 불안하면 휴대폰 테더링을 준비한다(처음 열 때만 인터넷이 필요하다).

- [ ] **Step 4: 행사 종료 후**

관리자 → CSV 내보내기 → 센터 전달 → "개인정보 파기".
