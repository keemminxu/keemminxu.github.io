// input.js — 기존 게임패드 UI 이벤트·키보드·터치·실제 게임패드를 게임 intent로 변환하는 어댑터
// intents: jumpStart / jumpEnd / duck(bool) / bark / mute / pause / start
// 규칙: attract·gameover에서는 jumpStart 계열 입력이 start로 쓰임 (main이 모드에 따라 해석)

const JUMP_KEYS = new Set([' ', 'w', 'arrowup', 'x']);
const DUCK_KEYS = new Set(['shift', 's', 'arrowdown']);
const TAP_THRESHOLD_PX = 10;

function isEditableFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.isContentEditable;
}

export function createInput(handlers) {
  const h = Object.assign({ jumpStart() {}, jumpEnd() {}, duck() {}, bark() {}, mute() {}, pause() {}, }, handlers);
  const pressedJump = new Set();   // 키·소스별 중복 press 방지
  const pressedDuck = new Set();

  function press(set, id, on, downFn, upFn) {
    if (on) { const wasEmpty = set.size === 0; set.add(id); if (wasEmpty) downFn(); }
    else { if (set.has(id)) { set.delete(id); if (set.size === 0) upFn(); } }
  }
  const jumpDown = (id) => press(pressedJump, id, true, h.jumpStart, h.jumpEnd);
  const jumpUp = (id) => press(pressedJump, id, false, h.jumpStart, h.jumpEnd);
  const duckSet = (id, on) => press(pressedDuck, id, on, () => h.duck(true), () => h.duck(false));

  // --- 키보드 ---
  function onKeyDown(e) {
    if (isEditableFocused()) return;
    const k = e.key.toLowerCase();
    if (JUMP_KEYS.has(k)) { if (!e.repeat) jumpDown('kb'); e.preventDefault(); }
    else if (DUCK_KEYS.has(k)) { duckSet('kb', true); e.preventDefault(); }
    else if (k === 'e') { if (!e.repeat) h.bark(); e.preventDefault(); }
    else if (k === 'f') { if (!e.repeat) h.mute(); e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (isEditableFocused()) return;
    const k = e.key.toLowerCase();
    if (JUMP_KEYS.has(k)) { jumpUp('kb'); e.preventDefault(); }
    else if (DUCK_KEYS.has(k)) { duckSet('kb', false); e.preventDefault(); }
  }
  function onBlur() {
    pressedJump.clear(); pressedDuck.clear();
    h.jumpEnd(); h.duck(false);
  }

  // --- 게임패드 UI (home.html의 CustomEvent) ---
  function onDpad(e) {
    const d = e.detail && e.detail.direction;
    if (d === 'up') jumpDown('dpad');
    else if (d === 'down') duckSet('dpad', true);
    else { jumpUp('dpad'); duckSet('dpad', false); }
  }
  function onButton(e) {
    const b = e.detail && e.detail.button;
    if (b === 'a') jumpDown('btn');
    else if (b === 'b') duckSet('btn', true);
    else if (b === 'x') h.bark();
    else if (b === 'y') h.mute();
    else if (b === 'option') h.pause();
  }
  function onButtonRelease(e) {
    const b = e.detail && e.detail.button;
    if (b === 'a') jumpUp('btn');
    else if (b === 'b') duckSet('btn', false);
  }

  // --- CRT 화면 포인터: 상단 ⅔ = 점프, 하단 ⅓ = 숙이기. 세로 스크롤(pan-y)은 pointercancel로 양보 ---
  const screen = document.querySelector('.console-screen');
  let ptr = null;   // { id, zone }
  function onPointerDown(e) {
    if (!screen || !e.isPrimary) return;
    if (e.target && e.target.closest && e.target.closest('.dash-zoom-btn')) return;   // 확대 버튼
    const rect = screen.getBoundingClientRect();
    const zone = (e.clientY - rect.top) / rect.height > 2 / 3 ? 'duck' : 'jump';
    ptr = { id: e.pointerId, zone };
    if (zone === 'jump') jumpDown('scr'); else duckSet('scr', true);
  }
  function onPointerEnd(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    if (ptr.zone === 'jump') jumpUp('scr'); else duckSet('scr', false);
    ptr = null;
  }

  // --- 아날로그 왼스틱 (보조): flick ↑ = 점프, hold ↓ = 숙이기 ---
  const stickEl = document.getElementById('analog-left');
  const stickCap = document.getElementById('analog-cap-left');
  let stick = null;   // { id, cx, cy }
  const STICK_MAX = 15;
  function stickDown(e) {
    const r = stickEl.getBoundingClientRect();
    stick = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    stickEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function stickMove(e) {
    if (!stick || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_MAX) { dx *= STICK_MAX / d; dy *= STICK_MAX / d; }
    if (stickCap) stickCap.style.transform = `translate(${dx}px, ${dy}px)`;
    const ny = dy / STICK_MAX;
    if (ny < -0.5) jumpDown('stick'); else jumpUp('stick');
    duckSet('stick', ny > 0.5);
  }
  function stickEnd(e) {
    if (!stick || e.pointerId !== stick.id) return;
    stick = null;
    if (stickCap) stickCap.style.transform = '';
    jumpUp('stick'); duckSet('stick', false);
  }

  // --- 실제 게임패드 (Gamepad API 표준 배치) — A·↑·왼스틱↑ = 점프, B·↓·왼스틱↓ = 숙이기, X = 짖기, Y = 음소거, Start = 일시정지.
  //     브라우저는 패드 버튼을 한 번 누른 뒤에야 패드를 알려 준다. 누르는 동안 화면 속 패드의 같은 버튼도 눌린 것처럼 표시 ---
  const PAD_JUMP = [0, 12], PAD_DUCK = [1, 13], PAD_BARK = 2, PAD_MUTE = 3, PAD_PAUSE = 9;
  const PAD_HITS = { 0: '.hit-a', 1: '.hit-b', 2: '.hit-x', 3: '.hit-y', 12: '.hit-up', 13: '.hit-down' };
  const padPrev = new Map();   // 패드 index → 이전 프레임의 버튼 눌림 배열
  let padRaf = 0;
  function showPadPress(i, on) {
    const el = document.querySelector(PAD_HITS[i]);
    if (el) el.classList.toggle('is-pad-pressed', on);
  }
  function pollPads() {
    padRaf = 0;
    const pads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
    for (const pad of pads) {
      const id = 'pad' + pad.index;
      const prev = padPrev.get(pad.index) || [];
      const now = pad.buttons.map((b) => b.pressed);
      const stickY = pad.axes[1] || 0;
      if (PAD_JUMP.some((i) => now[i]) || stickY < -0.5) jumpDown(id); else jumpUp(id);
      duckSet(id, PAD_DUCK.some((i) => now[i]) || stickY > 0.5);
      if (now[PAD_BARK] && !prev[PAD_BARK]) h.bark();
      if (now[PAD_MUTE] && !prev[PAD_MUTE]) h.mute();
      if (now[PAD_PAUSE] && !prev[PAD_PAUSE]) h.pause();
      for (const i in PAD_HITS) if (!!now[i] !== !!prev[i]) showPadPress(i, !!now[i]);
      padPrev.set(pad.index, now);
    }
    if (pads.length) padRaf = requestAnimationFrame(pollPads);
  }
  function startPads() { if (!padRaf) padRaf = requestAnimationFrame(pollPads); }
  function onPadDisconnected(e) {
    const id = 'pad' + e.gamepad.index;
    jumpUp(id); duckSet(id, false);
    const prev = padPrev.get(e.gamepad.index) || [];
    for (const i in PAD_HITS) if (prev[i]) showPadPress(i, false);
    padPrev.delete(e.gamepad.index);
  }

  const listeners = [
    [window, 'keydown', onKeyDown], [window, 'keyup', onKeyUp], [window, 'blur', onBlur],
    [document, 'game-dpad', onDpad], [document, 'game-button', onButton], [document, 'game-button-release', onButtonRelease],
    [window, 'gamepadconnected', startPads], [window, 'gamepaddisconnected', onPadDisconnected],
  ];
  if (screen) listeners.push([screen, 'pointerdown', onPointerDown], [window, 'pointerup', onPointerEnd], [window, 'pointercancel', onPointerEnd]);
  if (stickEl) listeners.push([stickEl, 'pointerdown', stickDown], [window, 'pointermove', stickMove], [window, 'pointerup', stickEnd], [window, 'pointercancel', stickEnd]);

  return {
    attach() { for (const [t, ev, fn] of listeners) t.addEventListener(ev, fn); startPads(); },
    detach() {
      for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn);
      cancelAnimationFrame(padRaf); padRaf = 0;
    },
  };
}
