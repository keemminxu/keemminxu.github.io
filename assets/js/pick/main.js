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
      if (phase !== 'locked') return;
      if (anyField(store.state.settings.fields)) setPhase('entry');
      else { entry = {}; startDraw(); }
    },
    onEnter(value) { entry = value; startDraw(); },
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
  ui.renderStock(); // 결과가 뜬 뒤에야 남은 개수를 줄인다
}

// 버튼 한 번으로 바로 뽑는다: 손잡이가 저절로 한 바퀴 돌고(3D) 끝나면 doDraw
function startDraw() {
  setPhase('ready');
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

// 결과는 연출 전에 저장되므로(새로 고침 복구용) 뽑는 동안 남은 개수를 바로 그리면 어떤 경품인지 미리 보인다.
// 손잡이가 돌고 캡슐이 열리는 동안(ready·busy)에는 화면을 그대로 두고, showResult에서 갱신한다.
store.onChange(() => {
  if (phase === 'ready' || phase === 'busy') return;
  ui.renderStock();
  if (stage) stage.setCapsuleCount(visibleCount());
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); ui.openPin(); return; }
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, .ov, .admin')) return; // 입력·오버레이·관리자에서는 기본 동작
  if (phase === 'locked') { e.preventDefault(); ui.pressPrimary(); }
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
      prizes: Object.fromEntries(PRIZE_KEYS.map((k) => [k, { url: glbUrl(k), label: store.state.stock[k].label }])),
      onTurnComplete: doDraw,
      onImpact: (at) => ui.impact(at),
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
