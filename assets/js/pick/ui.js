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
      const card = $('result');
      card.classList.remove('stamp');
      void card.offsetWidth; // 애니메이션 재시작
      card.classList.add('stamp');
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

  // ---------- 임팩트(캡슐이 터지는 순간): 흰 플래시 + 만화 집중선 ----------
  function drawSpeedLines(cx, cy) {
    const c = $('speed');
    const w = (c.width = window.innerWidth), h = (c.height = window.innerHeight);
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const outer = Math.hypot(w, h);
    const inner = Math.min(w, h) * 0.3;
    g.fillStyle = 'rgba(251, 246, 232, 0.92)';
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + Math.random() * 0.05;
      const spread = 0.007 + Math.random() * 0.02;
      const r0 = inner * (0.9 + Math.random() * 0.6);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a - spread) * outer, cy + Math.sin(a - spread) * outer);
      g.lineTo(cx + Math.cos(a + spread) * outer, cy + Math.sin(a + spread) * outer);
      g.closePath();
      g.fill();
    }
  }

  function impact({ x, y } = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }) {
    $('flash').animate([{ opacity: 0.95 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
    drawSpeedLines(x, y);
    $('speed').animate(
      [{ opacity: 0, transform: 'scale(1.08)' }, { opacity: 1, transform: 'scale(1)', offset: 0.15 }, { opacity: 0, transform: 'scale(0.98)' }],
      { duration: 900, easing: 'ease-out' },
    );
  }

  return {
    impact,
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
