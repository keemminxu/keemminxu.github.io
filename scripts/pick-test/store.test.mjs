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
  s.commitDraw('bag', { name: '가', phone: '010-1234-5678', birth: '19990101', gender: '남' });
  assert.equal(s.state.draws[0].gender, '남');
  s.purgePersonal();
  const r = s.state.draws[0];
  assert.deepEqual([r.name, r.phone, r.birth, r.gender, r.prize], ['', '', '', '', 'bag']);
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
  const s = createStore({ storage: memStorage(), search: '?cup=0' }); // 다른 경품 0개로 시작
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
    { no: 1, at: 't1', prize: 'cup', name: '김,민수', phone: '', birth: '' }, // 성별 생기기 전 기록
    { no: 2, at: 't2', prize: 'bag', name: '=1+1', phone: '"x"', birth: '', gender: '여' },
  ];
  const csv = toCSV(st);
  assert.ok(csv.startsWith('\uFEFF순번,시각,경품,이름,휴대폰,생년월일,성별\r\n'));
  assert.ok(csv.includes('1,t1,컵,"김,민수",,,\r\n'));
  assert.ok(csv.includes("2,t2,장바구니,'=1+1,\"\"\"x\"\"\",,여\r\n"));
  assert.equal(normalize({}).settings.fields.gender, false, '성별 수집은 기본 꺼짐');
});

test('showStock: 기본은 표시, 끄면 저장된다(옛 저장본에도 기본값 보충)', () => {
  assert.equal(normalize({}).settings.showStock, true);
  const storage = memStorage();
  const s = createStore({ storage, search: '?cup=1' });
  s.updateSettings({ showStock: false });
  assert.equal(createStore({ storage }).state.settings.showStock, false);
});

test('저장본도 주소 수량도 없으면 경품마다 100개로 시작한다', () => {
  const s = createStore({ storage: memStorage(), search: '' });
  assert.equal(s.seededFromUrl, false);
  for (const k of ['towel', 'cup', 'bag']) assert.deepEqual([s.state.stock[k].total, s.state.stock[k].left], [100, 100]);
  assert.equal(s.totalLeft(), 300);
});

test('예전 버전이 0개로 저장한 빈 저장본은 기본 100개로 채우고 설정은 유지한다', () => {
  const storage = memStorage();
  const old = normalize({ settings: { pin: '4321' } }); // 재고 0, 기록 없음
  storage.setItem(STORAGE_KEY, JSON.stringify(old));
  const s = createStore({ storage });
  assert.equal(s.state.stock.cup.left, 100);
  assert.equal(s.state.settings.pin, '4321');
  assert.equal(s.ignoredSeed, false);
  // 주소 수량이 있으면 그걸로 채운다
  const storage2 = memStorage();
  storage2.setItem(STORAGE_KEY, JSON.stringify(old));
  assert.equal(createStore({ storage: storage2, search: '?cup=7' }).state.stock.cup.left, 7);
  // 기록이 있는 저장본은 0개여도 건드리지 않는다(소진 상태 유지)
  const storage3 = memStorage();
  const used = normalize({ stock: { cup: { total: 1, left: 0 } }, draws: [{ no: 1, at: 't', prize: 'cup' }] });
  storage3.setItem(STORAGE_KEY, JSON.stringify(used));
  assert.equal(createStore({ storage: storage3 }).totalLeft(), 0);
});
