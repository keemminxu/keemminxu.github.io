// README.txt 창 안 3D ASCII 스페이스 인베이더 3마리 — 복셀 압출 + z-buffer 포인트 렌더
// 각자 자동 회전(턴테이블) + 마우스/터치 드래그로 한 마리씩 직접 회전
(function () {
  'use strict';

  var pres = document.querySelectorAll('.greeting-ascii[data-invader]');
  if (!pres.length) return;

  var W = 36, H = 17;             // 마리당 문자 그리드
  var SCALE_X = 75, SCALE_Y = 39; // 문자 종횡비 보정 투영 스케일
  var K2 = 30;                    // 카메라 거리 (원근 약하게)
  var CHARS = '.,-~:;=!*#$@';
  var DEPTH = 2;
  var STEP = 0.25;                // 면당 4×4 샘플

  // 클래식 스페이스 인베이더 3종
  var SPRITES = {
    squid: [
      '...##...',
      '..####..',
      '.######.',
      '##.##.##',
      '########',
      '..#..#..',
      '.#.##.#.',
      '#.#..#.#'
    ],
    crab: [
      '..#.....#..',
      '...#...#...',
      '..#######..',
      '.##.###.##.',
      '###########',
      '#.#######.#',
      '#.#.....#.#',
      '...##.##...'
    ],
    octopus: [
      '....####....',
      '.##########.',
      '############',
      '###..##..###',
      '############',
      '...##..##...',
      '..##.##.##..',
      '##........##'
    ]
  };

  // 노출된 복셀 면만 샘플링한 포인트 클라우드 (오브젝트 공간, 1회 생성)
  function buildPoints(sprite) {
    var rows = sprite.length, cols = sprite[0].length;
    var pts = [];
    function filled(c, r) {
      return r >= 0 && r < rows && c >= 0 && c < cols && sprite[r].charAt(c) === '#';
    }
    function addFace(cx, cy, cz, nx, ny, nz) {
      var tx, ty; // 면의 접선축 2개
      if (nx !== 0) { tx = [0, 1, 0]; ty = [0, 0, 1]; }
      else if (ny !== 0) { tx = [1, 0, 0]; ty = [0, 0, 1]; }
      else { tx = [1, 0, 0]; ty = [0, 1, 0]; }
      for (var u = -0.375; u < 0.5; u += STEP) {
        for (var v = -0.375; v < 0.5; v += STEP) {
          pts.push({
            x: cx + nx * 0.5 + tx[0] * u + ty[0] * v,
            y: cy + ny * 0.5 + tx[1] * u + ty[1] * v,
            z: cz + nz * 0.5 + tx[2] * u + ty[2] * v,
            nx: nx, ny: ny, nz: nz
          });
        }
      }
    }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (!filled(c, r)) continue;
        for (var d = 0; d < DEPTH; d++) {
          var cx = c - (cols - 1) / 2, cy = (rows - 1) / 2 - r, cz = d - (DEPTH - 1) / 2;
          if (!filled(c + 1, r)) addFace(cx, cy, cz, 1, 0, 0);
          if (!filled(c - 1, r)) addFace(cx, cy, cz, -1, 0, 0);
          if (!filled(c, r - 1)) addFace(cx, cy, cz, 0, 1, 0);
          if (!filled(c, r + 1)) addFace(cx, cy, cz, 0, -1, 0);
          if (d === DEPTH - 1) addFace(cx, cy, cz, 0, 0, 1);
          if (d === 0) addFace(cx, cy, cz, 0, 0, -1);
        }
      }
    }
    return pts;
  }

  // 광원 방향 (정규화됨) — 좌상단 + 카메라 쪽
  var LX = -0.33, LY = 0.46, LZ = -0.82;

  function frame(inv) {
    var buf = new Array(W * H);
    var zb = new Array(W * H);
    for (var i = 0; i < W * H; i++) { buf[i] = ' '; zb[i] = 0; }

    var cA = Math.cos(inv.A), sA = Math.sin(inv.A);
    var cB = Math.cos(inv.B), sB = Math.sin(inv.B);
    var pts = inv.pts;

    for (var k = 0; k < pts.length; k++) {
      var p = pts[k];
      // Y축 회전(B) → X축 회전(A)
      var x1 = p.x * cB + p.z * sB, z1 = -p.x * sB + p.z * cB;
      var y2 = p.y * cA - z1 * sA, z2 = p.y * sA + z1 * cA;
      var D = 1 / (z2 + K2);
      var px = Math.floor(W / 2 + SCALE_X * D * x1);
      var py = Math.floor(H / 2 - SCALE_Y * D * y2);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      var o = px + W * py;
      if (D <= zb[o]) continue;

      // 노멀 회전 + 램버트 음영
      var nx1 = p.nx * cB + p.nz * sB, nz1 = -p.nx * sB + p.nz * cB;
      var ny2 = p.ny * cA - nz1 * sA, nz2 = p.ny * sA + nz1 * cA;
      var lum = nx1 * LX + ny2 * LY + nz2 * LZ;
      var idx = Math.floor(lum * 8) + 3; // 약한 ambient
      if (idx < 0) idx = 0;
      if (idx > 11) idx = 11;

      zb[o] = D;
      buf[o] = CHARS[idx];
    }

    var rows = [];
    for (var r = 0; r < H; r++) {
      rows.push(buf.slice(r * W, (r + 1) * W).join(''));
    }
    inv.pre.textContent = rows.join('\n');
  }

  // 세 마리 + 여백 6칸이 README 본문 폭에 들어가는 글자 크기 (JetBrains Mono 글자 폭 0.6em, 최대 10px).
  // CSS 컨테이너 단위(cqw)는 모바일 세로 쌓기에서 높이 측정 때 0으로 풀려 창이 잘리므로 여기서 잰다.
  var body = pres[0].parentNode;
  function fit() {
    var cs = getComputedStyle(body);
    var inner = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var size = Math.min(10, inner / (W * pres.length + 6) / 0.6);
    for (var i = 0; i < pres.length; i++) pres[i].style.fontSize = size + 'px';
  }
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(body);
  else window.addEventListener('resize', fit);

  // 마리마다 회전 위상을 어긋나게 — 같은 박자로 돌되 서로 다른 면을 보인다
  var invaders = Array.prototype.map.call(pres, function (pre, i) {
    return {
      pre: pre,
      pts: buildPoints(SPRITES[pre.getAttribute('data-invader')] || SPRITES.crab),
      A: 0.2,
      B: 0.5 + i * 0.9,
      tau: i * 1.4
    };
  });

  // 자동 회전: 기울기는 ±0.32 대역에서 진동(실루엣 유지), 턴테이블은 연속 회전.
  // 드래그로 벗어나도 놓으면 서서히 대역으로 복귀.
  var active = null, lastX = 0, lastY = 0;
  var visible = true;

  // ~30fps 루프 (탭 비활성 시 rAF가 알아서 멈춤)
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!visible) return;
    if (ts - last < 33) return;
    last = ts;
    invaders.forEach(function (inv) {
      if (inv !== active) {
        inv.tau += 0.012;
        inv.A += (0.32 * Math.sin(inv.tau) - inv.A) * 0.04;
        inv.B += 0.024;
      }
      frame(inv);
    });
  }
  requestAnimationFrame(loop);

  // 화면 밖이면 연산 중지
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }).observe(body);
  }

  // ── 드래그 회전 — 잡은 한 마리만 ──
  function dragStart(inv, x, y) { active = inv; lastX = x; lastY = y; }
  function dragMove(x, y) {
    if (!active) return;
    // 드래그 방향대로 따라오게 — 두 축 모두 반전
    active.A -= (y - lastY) * 0.01;
    active.B -= (x - lastX) * 0.01;
    lastX = x; lastY = y;
    frame(active);
  }
  function dragEnd() { active = null; }

  invaders.forEach(function (inv) {
    inv.pre.addEventListener('mousedown', function (e) { e.preventDefault(); dragStart(inv, e.clientX, e.clientY); });
    inv.pre.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      dragStart(inv, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    inv.pre.addEventListener('touchmove', function (e) {
      if (!active || e.touches.length !== 1) return;
      e.preventDefault();
      dragMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    inv.pre.addEventListener('touchend', dragEnd);
  });
  window.addEventListener('mousemove', function (e) { dragMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', dragEnd);
})();
